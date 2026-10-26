import "server-only";
import { createHash } from "node:crypto";
import { CatalogImport, CONTEXT_PAYLOAD, PreviewRuleResult, RulePayload, type ContextKind } from "@nora/contracts";
import { advisoryLock, jsonAs, plain, Prisma, type Db } from "@nora/db";
import { getBytes, putObject } from "@nora/storage";
import type { z } from "zod";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { stableStringify } from "./data";
import { db, withTx, type Tx } from "./db";
import { badRequest, conflict, HttpError, notFound } from "./http";
import { runJob, startJob } from "./jobs";
import { can } from "./projects";

export const KIND_TABLE: Record<ContextKind, string> = {
  process_boundary: "process_boundaries",
  rework_definition: "rework_definitions",
  rule: "rules",
  calendar: "calendars",
  hypothesis: "hypotheses",
  intervention: "interventions",
  rubric: "rubrics",
};

/** Kinds with one logical item per project; others are keyed collections. */
const SINGLETON: Partial<Record<ContextKind, true>> = { process_boundary: true, rework_definition: true, calendar: true };

export type ContextPayload = { [K in ContextKind]: z.infer<(typeof CONTEXT_PAYLOAD)[K]> }[ContextKind];

export interface ContextItem {
  id: string;
  kind: ContextKind;
  key: string;
  version: number;
  status: "draft" | "reviewed" | "approved" | "obsolete";
  payload: ContextPayload;
  sourceDocumentId: string | null;
  sourceReference: string;
  createdAt: string;
  approvedAt: string | null;
}

// The seven context tables share one shape and the kind picks the table, so these queries are raw SQL.
// The table name always comes from KIND_TABLE, never from the request.
const table = (kind: ContextKind) => Prisma.raw(KIND_TABLE[kind]);

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

export async function listItems(q: Db, projectId: string, kind: ContextKind, opts: { latestOnly?: boolean } = {}): Promise<ContextItem[]> {
  const t = table(kind);
  const latest = opts.latestOnly ? Prisma.sql`AND (item_key, version) IN (SELECT item_key, max(version) FROM ${t} WHERE project_id = ${projectId}::uuid GROUP BY item_key)` : Prisma.empty;
  const rows = await q.$queryRaw<(Omit<ContextItem, "kind" | "createdAt" | "approvedAt"> & { createdAt: Date; approvedAt: Date | null })[]>`
    SELECT id, item_key AS key, version, status, payload, source_document_id AS "sourceDocumentId", source_reference AS "sourceReference",
           created_at AS "createdAt", approved_at AS "approvedAt"
      FROM ${t} WHERE project_id = ${projectId}::uuid ${latest} ORDER BY item_key, version DESC`;
  return rows.map((r) => ({ ...r, kind, createdAt: r.createdAt.toISOString(), approvedAt: r.approvedAt?.toISOString() ?? null }));
}

export async function saveItem(
  viewer: Viewer, projectId: string, kind: ContextKind,
  input: { key?: string | null; payload: unknown; sourceDocumentId?: string | null; sourceReference?: string },
  correlationId: string, tx?: Tx,
): Promise<{ id: string; key: string; version: number }> {
  await can(viewer, "context.write", projectId);
  const parsed = CONTEXT_PAYLOAD[kind].safeParse(input.payload);
  if (!parsed.success) throw badRequest("Konfigurasi tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "_", i.message])));
  const payload = parsed.data as Record<string, unknown>;
  const key = SINGLETON[kind] ? kind : input.key ? slug(input.key) : slug(String(payload.name ?? payload.statement ?? payload.action ?? kind));
  const t = table(kind);
  const json = JSON.stringify(payload);
  const run = async (tx: Tx) => {
    if (input.sourceDocumentId && !(await tx.contextDocument.findFirst({ where: { id: input.sourceDocumentId, projectId }, select: { id: true } }))) throw notFound();
    await advisoryLock(tx, `${KIND_TABLE[kind]}:${projectId}:${key}`);
    const [latest] = await tx.$queryRaw<{ id: string; version: number; status: string }[]>`
      SELECT id, version, status FROM ${t} WHERE project_id = ${projectId}::uuid AND item_key = ${key} ORDER BY version DESC LIMIT 1`;
    // A draft is still mutable; anything reviewed or approved gets a new version instead.
    if (latest?.status === "draft") {
      await tx.$executeRaw`UPDATE ${t} SET payload = ${json}::jsonb, source_document_id = ${input.sourceDocumentId ?? null}::uuid, source_reference = ${input.sourceReference ?? ""} WHERE id = ${latest.id}::uuid`;
      await audit(tx, { projectId, actorId: viewer.id, action: `context.${kind}.update`, objectType: kind, objectId: latest.id, correlationId, metadata: { key, version: latest.version } });
      return { id: latest.id, key, version: latest.version };
    }
    const version = (latest?.version ?? 0) + 1;
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO ${t} (project_id, item_key, version, payload, source_document_id, source_reference, created_by)
      VALUES (${projectId}::uuid, ${key}, ${version}, ${json}::jsonb, ${input.sourceDocumentId ?? null}::uuid, ${input.sourceReference ?? ""}, ${viewer.id}::uuid) RETURNING id`;
    await audit(tx, { projectId, actorId: viewer.id, action: `context.${kind}.create`, objectType: kind, objectId: row!.id, correlationId, metadata: { key, version } });
    return { id: row!.id, key, version };
  };
  return tx ? run(tx) : withTx(run);
}

const NEXT: Record<string, string[]> = { draft: ["reviewed", "approved", "obsolete"], reviewed: ["approved", "draft", "obsolete"], approved: ["obsolete"], obsolete: [] };

/** Approving also stamps the review and retires the previously approved version of the same key. */
export async function transitionItem(viewer: Viewer, projectId: string, kind: ContextKind, id: string, to: "reviewed" | "approved" | "obsolete", correlationId: string) {
  await can(viewer, "context.write", projectId);
  const t = table(kind);
  return withTx(async (tx) => {
    const [cur] = await tx.$queryRaw<{ status: string; item_key: string; source_document_id: string | null; source_reference: string }[]>`
      SELECT status, item_key, source_document_id, source_reference FROM ${t} WHERE id = ${id}::uuid AND project_id = ${projectId}::uuid FOR UPDATE`;
    if (!cur) throw notFound();
    if (!NEXT[cur.status]!.includes(to)) throw conflict(`Status ${cur.status} tidak dapat diubah menjadi ${to}`);
    if (to === "approved" && kind === "rule" && !cur.source_document_id && !cur.source_reference.trim()) {
      throw new HttpError(409, "source_required", "Aturan tanpa sumber (dokumen atau referensi) tidak dapat disetujui");
    }
    if (to === "approved") {
      await tx.$executeRaw`UPDATE ${t} SET status = 'obsolete' WHERE project_id = ${projectId}::uuid AND item_key = ${cur.item_key} AND status = 'approved' AND id <> ${id}::uuid`;
      await tx.$executeRaw`UPDATE ${t} SET status = 'approved', approved_by = ${viewer.id}::uuid, approved_at = now(), reviewed_by = coalesce(reviewed_by, ${viewer.id}::uuid), reviewed_at = coalesce(reviewed_at, now()) WHERE id = ${id}::uuid`;
    } else if (to === "reviewed") {
      await tx.$executeRaw`UPDATE ${t} SET status = 'reviewed', reviewed_by = ${viewer.id}::uuid, reviewed_at = now() WHERE id = ${id}::uuid`;
    } else {
      await tx.$executeRaw`UPDATE ${t} SET status = ${to} WHERE id = ${id}::uuid`;
    }
    await audit(tx, { projectId, actorId: viewer.id, action: `context.${kind}.${to}`, objectType: kind, objectId: id, correlationId, metadata: { from: cur.status } });
    return { status: to };
  });
}

// ---------------------------------------------------------------- documents

export async function listDocuments(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().contextDocument.findMany({
    where: { projectId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, reference: true, version: true, excerpt: true, createdAt: true },
  });
  return rows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }));
}

export async function createDocument(viewer: Viewer, projectId: string, input: { title: string; reference: string; version: string; excerpt: string }, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    const { id } = await tx.contextDocument.create({ data: { projectId, ...input, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "context.document.create", objectType: "context_document", objectId: id, correlationId, metadata: { title: input.title } });
    return { id };
  });
}

// ---------------------------------------------------------------- BPMN

export interface BpmnModel {
  id: string;
  key: string;
  version: number;
  name: string;
  fileName: string;
  status: string;
  validationStatus: "pending" | "valid" | "invalid";
  readable: boolean;
  validationError: string | null;
  tasks: { id: string; name: string }[];
  elementCount: number | null;
  createdAt: string;
  mapping: { id: string; version: number; mapping: Record<string, string[]>; conflicts: string[]; unmappedTasks: string[]; unmappedActivities: string[]; labelSourceDatasetId: string | null } | null;
}

export async function listBpmn(viewer: Viewer, projectId: string): Promise<BpmnModel[]> {
  await can(viewer, "project.read", projectId);
  const rows = await db().bpmnModel.findMany({
    where: { projectId }, orderBy: { createdAt: "desc" },
    select: {
      id: true, itemKey: true, version: true, name: true, fileName: true, status: true, validationStatus: true, readable: true, validationError: true,
      tasks: true, elementCount: true, createdAt: true,
      bpmnMappings: {
        orderBy: { version: "desc" }, take: 1,
        select: { id: true, version: true, mapping: true, conflicts: true, unmappedTasks: true, unmappedActivities: true, labelSourceDatasetId: true },
      },
    },
  });
  return rows.map(({ itemKey, bpmnMappings: [m], ...b }) => ({
    ...b, key: itemKey, validationStatus: b.validationStatus as BpmnModel["validationStatus"], tasks: jsonAs<BpmnModel["tasks"]>(b.tasks), createdAt: b.createdAt.toISOString(),
    mapping: m ? {
      ...m, mapping: jsonAs<Record<string, string[]>>(m.mapping), conflicts: jsonAs<string[]>(m.conflicts),
      unmappedTasks: jsonAs<string[]>(m.unmappedTasks), unmappedActivities: jsonAs<string[]>(m.unmappedActivities),
    } : null,
  }));
}

const MAX_BPMN_BYTES = 5 * 1024 * 1024;

export async function uploadBpmn(viewer: Viewer, projectId: string, input: { name: string; fileName: string; xml: string }, correlationId: string) {
  await can(viewer, "context.write", projectId);
  const bytes = Buffer.from(input.xml, "utf8");
  if (bytes.length > MAX_BPMN_BYTES) throw badRequest("File BPMN melebihi 5 MB");
  const key = slug(input.name);
  const res = await withTx(async (tx) => {
    await advisoryLock(tx, `bpmn:${projectId}:${key}`);
    const max = await tx.bpmnModel.aggregate({ where: { projectId, itemKey: key }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    const id = crypto.randomUUID();
    const objectKey = `projects/${projectId}/context/bpmn/${id}/${version}/model.bpmn`;
    await putObject(projectId, objectKey, bytes, "application/xml");
    await tx.bpmnModel.create({
      data: { id, projectId, itemKey: key, version, name: input.name, fileName: input.fileName, objectKey, sha256: createHash("sha256").update(bytes).digest("hex"), createdBy: viewer.id },
    });
    await audit(tx, { projectId, actorId: viewer.id, action: "context.bpmn.upload", objectType: "bpmn_model", objectId: id, correlationId, metadata: { name: input.name, version } });
    return { id, objectKey };
  });
  await startJob("validateBpmnWorkflow", `bpmn-${res.id}`, [{ projectId, modelId: res.id, objectKey: res.objectKey, requestedBy: viewer.id, correlationId }]);
  return { id: res.id };
}

export async function getBpmnXml(viewer: Viewer, projectId: string, modelId: string): Promise<string> {
  await can(viewer, "project.read", projectId);
  const m = await db().bpmnModel.findFirst({ where: { id: modelId, projectId }, select: { objectKey: true } });
  if (!m) throw notFound();
  return Buffer.from(await getBytes(projectId, m.objectKey)).toString("utf8");
}

/** Row lock on a BPMN model: approval and mapping saves of one model are serialised. */
const lockBpmn = async (tx: Tx, projectId: string, modelId: string) => (await tx.$queryRaw<{ item_key: string; readable: boolean; validation_status: string; tasks: { id: string; name: string }[] }[]>`
  SELECT item_key, readable, validation_status, tasks FROM bpmn_models WHERE id = ${modelId}::uuid AND project_id = ${projectId}::uuid FOR UPDATE`)[0];

export async function approveBpmn(viewer: Viewer, projectId: string, modelId: string, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    const m = await lockBpmn(tx, projectId, modelId);
    if (!m) throw notFound();
    if (m.validation_status === "pending") throw conflict("Validasi BPMN masih berjalan");
    // An invalid conversion stays usable as a visual reference; conformance is then switched off in the package.
    if (!m.readable) throw conflict("BPMN tidak dapat dibaca dan tidak dapat disetujui");
    await tx.bpmnModel.updateMany({ where: { projectId, status: "approved", id: { not: modelId } }, data: { status: "obsolete" } });
    await tx.bpmnModel.update({ where: { id: modelId }, data: { status: "approved", approvedBy: viewer.id, approvedAt: new Date() } });
    await audit(tx, { projectId, actorId: viewer.id, action: "context.bpmn.approved", objectType: "bpmn_model", objectId: modelId, correlationId });
    return { status: "approved" };
  });
}

/** Saves task → activity labels as a new mapping version; conflicts are flagged for review, not rejected. */
export async function saveBpmnMapping(viewer: Viewer, projectId: string, modelId: string, mapping: Record<string, string[]>, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    const m = await lockBpmn(tx, projectId, modelId);
    if (!m) throw notFound();
    const taskIds = new Set(m.tasks.map((t) => t.id));
    const clean: Record<string, string[]> = {};
    for (const [task, labels] of Object.entries(mapping)) {
      if (!taskIds.has(task)) throw badRequest(`Task ${task} tidak ada pada model`);
      const uniq = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
      if (uniq.length) clean[task] = uniq;
    }
    const ds = await tx.datasetVersion.findFirst({ where: { projectId, status: "published" }, orderBy: { publishedAt: "desc" }, select: { id: true, activityLabels: true } });
    const owners = new Map<string, string[]>();
    for (const [task, labels] of Object.entries(clean)) for (const l of labels) owners.set(l, [...(owners.get(l) ?? []), task]);
    const conflicts = [...owners.entries()].filter(([, ts]) => ts.length > 1).map(([l]) => l).sort();
    const unmappedTasks = m.tasks.filter((t) => !clean[t.id]).map((t) => t.id);
    const unmappedActivities = (jsonAs<{ label: string }[] | null>(ds?.activityLabels ?? null) ?? []).map((l) => l.label).filter((l) => !owners.has(l)).sort();
    const max = await tx.bpmnMapping.aggregate({ where: { bpmnModelId: modelId }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    const { id } = await tx.bpmnMapping.create({
      data: { projectId, bpmnModelId: modelId, version, mapping: clean, labelSourceDatasetId: ds?.id ?? null, conflicts, unmappedTasks, unmappedActivities, createdBy: viewer.id },
      select: { id: true },
    });
    await audit(tx, { projectId, actorId: viewer.id, action: "context.bpmn.mapping", objectType: "bpmn_mapping", objectId: id, correlationId, metadata: { modelId, version, conflicts: conflicts.length } });
    return { id, version, conflicts, unmappedTasks, unmappedActivities };
  });
}

// ---------------------------------------------------------------- rule preview

export async function previewRule(viewer: Viewer, projectId: string, ruleId: string | null, draft?: unknown): Promise<PreviewRuleResult> {
  await can(viewer, "project.read", projectId);
  let rule = draft;
  if (!rule) {
    const r = ruleId ? await db().rule.findFirst({ where: { id: ruleId, projectId }, select: { payload: true } }) : null;
    if (!r) throw notFound();
    rule = r.payload;
  }
  const parsed = RulePayload.safeParse(rule);
  if (!parsed.success) throw badRequest("Aturan tidak valid");
  const ds = await db().datasetVersion.findFirst({ where: { projectId, status: "published" }, orderBy: { publishedAt: "desc" }, select: { eventsKey: true } });
  if (!ds) throw conflict("Belum ada dataset terbit untuk pratinjau aturan");
  return runJob<PreviewRuleResult>("previewRuleWorkflow", `rule-preview-${crypto.randomUUID()}`, [{ projectId, eventsKey: ds.eventsKey, rule: parsed.data, maxCases: 5000 }], 60_000);
}

// ---------------------------------------------------------------- catalog import

export async function importCatalog(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "context.write", projectId);
  const parsed = CatalogImport.safeParse(raw);
  if (!parsed.success) throw badRequest("File katalog tidak sesuai format", Object.fromEntries(parsed.error.issues.slice(0, 10).map((i) => [i.path.join("."), i.message])));
  const c = parsed.data;
  return withTx(async (tx) => {
    let n = 0;
    for (const h of c.hypotheses) { await saveItem(viewer, projectId, "hypothesis", { key: h.key, payload: h.payload, sourceReference: "Impor katalog" }, correlationId, tx); n++; }
    for (const i of c.interventions) { await saveItem(viewer, projectId, "intervention", { key: i.key, payload: i.payload, sourceReference: "Impor katalog" }, correlationId, tx); n++; }
    for (const r of c.rubrics) { await saveItem(viewer, projectId, "rubric", { key: r.key, payload: r.payload, sourceReference: "Impor katalog" }, correlationId, tx); n++; }
    await audit(tx, { projectId, actorId: viewer.id, action: "catalog.import", objectType: "catalog", objectId: null, correlationId, metadata: { hypotheses: c.hypotheses.length, interventions: c.interventions.length, rubrics: c.rubrics.length } });
    return { imported: n };
  });
}

// ---------------------------------------------------------------- packages

export interface PackageRow {
  id: string;
  version: number;
  name: string;
  status: string;
  hash: string;
  conformanceAvailable: boolean;
  createdAt: string;
  activatedAt: string | null;
  refs: { type: string; key: string; version: number }[];
}

export async function listPackages(viewer: Viewer, projectId: string): Promise<PackageRow[]> {
  await can(viewer, "project.read", projectId);
  const rows = await db().contextPackage.findMany({
    where: { projectId }, orderBy: { version: "desc" },
    select: {
      id: true, version: true, name: true, status: true, hash: true, conformanceAvailable: true, createdAt: true, activatedAt: true,
      contextPackageRefs: { orderBy: [{ refType: "asc" }, { refKey: "asc" }], select: { refType: true, refKey: true, refVersion: true } },
    },
  });
  return rows.map(({ contextPackageRefs, ...p }) => ({
    ...plain(p), refs: contextPackageRefs.map((r) => ({ type: r.refType, key: r.refKey, version: r.refVersion })),
  }));
}

/** Collects approved items into an immutable package, then activates it. Same content → same hash → no new version. */
export async function freezeAndActivate(viewer: Viewer, projectId: string, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    await advisoryLock(tx, `package:${projectId}`);
    const approved = async (kind: ContextKind) => (await listItems(tx, projectId, kind)).filter((i) => i.status === "approved");
    const [boundary] = await approved("process_boundary");
    if (!boundary) throw new HttpError(409, "boundary_required", "Batas proses yang disetujui wajib ada sebelum paket diaktifkan");
    const [rework] = await approved("rework_definition");
    const [calendar] = await approved("calendar");
    const [rubric] = await approved("rubric");
    const rules = await approved("rule");
    const hypotheses = await approved("hypothesis");
    const interventions = await approved("intervention");
    const bpmn = await tx.bpmnModel.findFirst({ where: { projectId, status: "approved" }, select: { id: true, itemKey: true, version: true, validationStatus: true } });
    const mapping = bpmn ? await tx.bpmnMapping.findFirst({ where: { bpmnModelId: bpmn.id }, orderBy: { version: "desc" }, select: { id: true, version: true, mapping: true } }) : null;
    const conformance = !!bpmn && bpmn.validationStatus === "valid" && !!mapping && Object.keys(jsonAs<Record<string, string[]>>(mapping.mapping)).length > 0;

    const refs = [
      ...[boundary, rework, calendar, rubric].filter((i) => i !== undefined).map((i) => ({ type: i.kind, id: i.id, key: i.key, version: i.version })),
      ...[...rules, ...hypotheses, ...interventions].map((i) => ({ type: i.kind, id: i.id, key: i.key, version: i.version })),
      ...(bpmn ? [{ type: "bpmn_model", id: bpmn.id, key: bpmn.itemKey, version: bpmn.version }] : []),
      ...(bpmn && mapping ? [{ type: "bpmn_mapping", id: mapping.id, key: bpmn.itemKey, version: mapping.version }] : []),
    ].sort((a, b) => `${a.type}:${a.key}`.localeCompare(`${b.type}:${b.key}`));
    const hash = createHash("sha256").update(stableStringify(refs.map((r) => [r.type, r.id, r.version]))).digest("hex");

    const active = await tx.contextPackage.findFirst({ where: { projectId, status: "active" }, select: { id: true, hash: true } });
    if (active?.hash === hash) return { id: active.id, created: false, hash };
    const existing = await tx.contextPackage.findFirst({ where: { projectId, hash }, orderBy: { version: "desc" }, select: { id: true } });
    let id = existing?.id;
    if (!id) {
      const max = await tx.contextPackage.aggregate({ where: { projectId }, _max: { version: true } });
      const version = (max._max.version ?? 0) + 1;
      id = (await tx.contextPackage.create({
        data: {
          projectId, version, name: `Konteks v${version}`, status: "ready", hash, processBoundaryId: boundary.id, reworkDefinitionId: rework?.id ?? null,
          calendarId: calendar?.id ?? null, bpmnModelId: bpmn?.id ?? null, bpmnMappingId: mapping?.id ?? null, rubricId: rubric?.id ?? null,
          conformanceAvailable: conformance, createdBy: viewer.id,
        },
        select: { id: true },
      })).id;
      await tx.contextPackageRef.createMany({ data: refs.map((r) => ({ packageId: id!, refType: r.type, refId: r.id, refKey: r.key, refVersion: r.version })) });
    }
    await tx.contextPackage.updateMany({ where: { projectId, status: "active" }, data: { status: "superseded" } });
    await tx.contextPackage.update({ where: { id }, data: { status: "active", activatedBy: viewer.id, activatedAt: new Date() } });
    await audit(tx, { projectId, actorId: viewer.id, action: "context.package.activate", objectType: "context_package", objectId: id, correlationId, metadata: { hash, refs: refs.length, conformance } });
    return { id, created: !existing, hash };
  });
}

export async function contextSummary(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const q = db();
  const kinds = Object.keys(KIND_TABLE) as ContextKind[];
  const items = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await listItems(q, projectId, k, { latestOnly: true })]))) as Record<ContextKind, ContextItem[]>;
  const labels = await q.datasetVersion.findFirst({ where: { projectId, status: "published" }, orderBy: { publishedAt: "desc" }, select: { activityLabels: true, name: true } });
  const [documents, bpmn, packages] = await Promise.all([listDocuments(viewer, projectId), listBpmn(viewer, projectId), listPackages(viewer, projectId)]);
  const datasetLabels = (jsonAs<{ label: string }[] | null>(labels?.activityLabels ?? null) ?? []).map((l) => l.label);
  return { items, documents, bpmn, packages, datasetLabels, datasetName: labels?.name ?? null };
}
