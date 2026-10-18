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
  const s = (await db().query(
    `SELECT coalesce((SELECT max(sequence) FROM outbox_events WHERE project_id = $1 AND projected_at IS NOT NULL), 0) AS projected,
            coalesce((SELECT max(sequence) FROM outbox_events WHERE project_id = $1), 0) AS latest,
            (SELECT count(*) FROM outbox_events WHERE project_id = $1 AND projected_at IS NULL AND NOT dead_letter) AS pending,
            coalesce(extract(epoch FROM now() - (SELECT min(occurred_at) FROM outbox_events WHERE project_id = $1 AND projected_at IS NULL AND NOT dead_letter)), 0) AS lag,
            g.last_projected_at, g.rebuild_requested_at, g.rebuilt_at
       FROM (SELECT 1) x LEFT JOIN graph_projection_state g ON g.project_id = $1`, [projectId],
  )).rows[0];
  const dead = (await db().query(
    `SELECT sequence, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId", last_error AS error, attempts FROM outbox_events WHERE project_id = $1 AND dead_letter ORDER BY sequence LIMIT 50`, [projectId],
  )).rows;
  return {
    projectedSequence: Number(s.projected), latestSequence: Number(s.latest), pending: Number(s.pending), deadLetters: dead, lagSeconds: Math.round(Number(s.lag)),
    stale: Number(s.lag) > STALE_AFTER_SECONDS || !!s.rebuild_requested_at, lastProjectedAt: s.last_projected_at, rebuildRequestedAt: s.rebuild_requested_at, rebuiltAt: s.rebuilt_at,
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
  await db().query(
    `INSERT INTO graph_projection_state (project_id, rebuild_requested_at) VALUES ($1, now())
     ON CONFLICT (project_id) DO UPDATE SET rebuild_requested_at = now()`, [projectId],
  );
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
  const { rows } = await db().query(
    `SELECT id, target_type AS "targetType", purpose, hash, graph_sequence AS "graphSequence", context_limited AS "contextLimited", context_maybe_stale AS "contextMaybeStale", created_at AS "createdAt",
            (SELECT count(*) FILTER (WHERE included) FROM evidence_bundle_items i WHERE i.bundle_id = b.id) AS included,
            (SELECT count(*) FILTER (WHERE NOT included) FROM evidence_bundle_items i WHERE i.bundle_id = b.id) AS excluded
       FROM evidence_bundles b WHERE project_id = $1 AND target_id = $2 ORDER BY created_at DESC LIMIT 20`, [projectId, targetId],
  );
  return rows;
}

export async function getBundle(viewer: Viewer, projectId: string, bundleId: string, correlationId: string): Promise<EvidenceBundle & { createdAt: string }> {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(bundleId)) throw notFound();
  const b = (await db().query<{ object_key: string; created_at: string }>("SELECT object_key, created_at FROM evidence_bundles WHERE id = $1 AND project_id = $2", [bundleId, projectId])).rows[0];
  if (!b) throw notFound();
  await audit(db(), { projectId, actorId: viewer.id, action: "evidence.bundle.read", objectType: "evidence_bundle", objectId: bundleId, correlationId });
  return { ...EvidenceBundle.parse(await getJson(projectId, b.object_key)), createdAt: b.created_at };
}
