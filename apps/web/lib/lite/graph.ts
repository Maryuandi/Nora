import "server-only";
import { neighborhood, NODE_TYPES, projectCounts, type NodeType } from "@nora/graph";
import { EvidenceBundle } from "@nora/contracts";
import { getJson } from "@nora/storage";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db } from "./db";
import { badRequest, notFound } from "./http";
import { can } from "./projects";

export const STALE_AFTER_SECONDS = 30;

export interface GraphStatus {
  projectedSequence: number;
  latestSequence: number;
  pending: number;
  deadLetters: { sequence: number; aggregateType: string; aggregateId: string; error: string | null; attempts: number }[];
  lagSeconds: number;
  stale: boolean;
  lastProjectedAt: string | null;
  rebuildRequestedAt: string | null;
  rebuiltAt: string | null;
}

/** Graph version = last projected outbox sequence; lag is the age of the oldest unprojected event. */
export async function graphStatus(projectId: string): Promise<GraphStatus> {
  // Raw: lag is measured on the database clock, the same clock that stamped occurred_at.
  const [s] = await db().$queryRaw<[{ projected: bigint; latest: bigint; pending: bigint; lag: number; last_projected_at: Date | null; rebuild_requested_at: Date | null; rebuilt_at: Date | null }]>`
    SELECT coalesce((SELECT max(sequence) FROM outbox_events WHERE project_id = ${projectId}::uuid AND projected_at IS NOT NULL), 0) AS projected,
           coalesce((SELECT max(sequence) FROM outbox_events WHERE project_id = ${projectId}::uuid), 0) AS latest,
           (SELECT count(*) FROM outbox_events WHERE project_id = ${projectId}::uuid AND projected_at IS NULL AND NOT dead_letter) AS pending,
           coalesce(extract(epoch FROM now() - (SELECT min(occurred_at) FROM outbox_events WHERE project_id = ${projectId}::uuid AND projected_at IS NULL AND NOT dead_letter)), 0)::float8 AS lag,
           g.last_projected_at, g.rebuild_requested_at, g.rebuilt_at
      FROM (SELECT 1) x LEFT JOIN graph_projection_state g ON g.project_id = ${projectId}::uuid`;
  const dead = await db().outboxEvent.findMany({
    where: { projectId, deadLetter: true }, orderBy: { sequence: "asc" }, take: 50, select: { sequence: true, aggregateType: true, aggregateId: true, lastError: true, attempts: true },
  });
  return {
    projectedSequence: Number(s.projected), latestSequence: Number(s.latest), pending: Number(s.pending), lagSeconds: Math.round(s.lag),
    deadLetters: dead.map((d) => ({ sequence: Number(d.sequence), aggregateType: d.aggregateType, aggregateId: d.aggregateId, error: d.lastError, attempts: d.attempts })),
    stale: s.lag > STALE_AFTER_SECONDS || !!s.rebuild_requested_at, lastProjectedAt: s.last_projected_at?.toISOString() ?? null,
    rebuildRequestedAt: s.rebuild_requested_at?.toISOString() ?? null, rebuiltAt: s.rebuilt_at?.toISOString() ?? null,
  };
}

export async function graphStatusFor(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const status = await graphStatus(projectId);
  let counts: { nodes: number; relations: number } | null = null;
  try { counts = await projectCounts(projectId); } catch { counts = null; }
  return { ...status, counts, graphAvailable: counts !== null };
}

/** Admin-only: the projection is dropped and replayed from authoritative records by the worker. */
export async function requestRebuild(viewer: Viewer, projectId: string, correlationId: string) {
  await can(viewer, "graph.rebuild", projectId);
  const now = new Date();
  await db().graphProjectionState.upsert({ where: { projectId }, create: { projectId, rebuildRequestedAt: now }, update: { rebuildRequestedAt: now } });
  await audit(db(), { projectId, actorId: viewer.id, action: "graph.rebuild", objectType: "graph", objectId: projectId, correlationId });
  return { requested: true };
}

/** Bounded, project-scoped neighbourhood; node type comes from a whitelist and the caller never sends Cypher. */
export async function graphNeighborhood(viewer: Viewer, projectId: string, type: string, id: string, depth: number, correlationId: string) {
  await can(viewer, "project.read", projectId);
  if (!(NODE_TYPES as readonly string[]).includes(type) || !id || id.length > 200) throw badRequest("Node tidak dikenal");
  let result;
  try {
    result = await neighborhood(projectId, { type: type as NodeType, id }, depth, 150);
  } catch {
    return { nodes: [], edges: [], available: false, status: await graphStatus(projectId) };
  }
  await audit(db(), { projectId, actorId: viewer.id, action: "graph.read", objectType: "graph", objectId: `${type}:${id}`, correlationId, metadata: { depth, nodes: result.nodes.length } });
  return { ...result, available: true, status: await graphStatus(projectId) };
}

export async function listBundles(viewer: Viewer, projectId: string, targetId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().evidenceBundle.findMany({
    where: { projectId, targetId }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, targetType: true, purpose: true, hash: true, graphSequence: true, contextLimited: true, contextMaybeStale: true, createdAt: true },
  });
  const counts = await db().evidenceBundleItem.groupBy({ by: ["bundleId", "included"], where: { bundleId: { in: rows.map((b) => b.id) } }, _count: { _all: true } });
  const count = (bundleId: string, included: boolean) => counts.find((c) => c.bundleId === bundleId && c.included === included)?._count._all ?? 0;
  return rows.map((b) => ({ ...b, graphSequence: Number(b.graphSequence), createdAt: b.createdAt.toISOString(), included: count(b.id, true), excluded: count(b.id, false) }));
}

export async function getBundle(viewer: Viewer, projectId: string, bundleId: string, correlationId: string): Promise<EvidenceBundle & { createdAt: string }> {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(bundleId)) throw notFound();
  const b = await db().evidenceBundle.findFirst({ where: { id: bundleId, projectId }, select: { objectKey: true, createdAt: true } });
  if (!b) throw notFound();
  await audit(db(), { projectId, actorId: viewer.id, action: "evidence.bundle.read", objectType: "evidence_bundle", objectId: bundleId, correlationId });
  return { ...EvidenceBundle.parse(await getJson(projectId, b.objectKey)), createdAt: b.createdAt.toISOString() };
}
