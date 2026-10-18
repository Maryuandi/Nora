import "server-only";
import { createHash } from "node:crypto";
import { CatalogImport, CONTEXT_PAYLOAD, PreviewRuleResult, RulePayload, type ContextKind } from "@nora/contracts";
import { getBytes, putObject } from "@nora/storage";
import type { Queryable } from "@nora/db";
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

export interface ContextItem {
  id: string;
  kind: ContextKind;
  key: string;
  version: number;
  status: "draft" | "reviewed" | "approved" | "obsolete";
  payload: any;
  sourceDocumentId: string | null;
  sourceReference: string;
  createdAt: string;
  approvedAt: string | null;
}

const itemCols = (kind: ContextKind) => `id, '${kind}' AS kind, item_key AS key, version, status, payload, source_document_id AS "sourceDocumentId",
  source_reference AS "sourceReference", created_at AS "createdAt", approved_at AS "approvedAt"`;

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

export async function listItems(q: Queryable, projectId: string, kind: ContextKind, opts: { latestOnly?: boolean } = {}): Promise<ContextItem[]> {
  const t = KIND_TABLE[kind];
  const where = opts.latestOnly ? `AND (item_key, version) IN (SELECT item_key, max(version) FROM ${t} WHERE project_id = $1 GROUP BY item_key)` : "";
  const { rows } = await q.query<ContextItem>(`SELECT ${itemCols(kind)} FROM ${t} WHERE project_id = $1 ${where} ORDER BY item_key, version DESC`, [projectId]);
  return rows;
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
  const t = KIND_TABLE[kind];
  const run = async (tx: Tx) => {
    if (input.sourceDocumentId && !(await tx.query("SELECT 1 FROM context_documents WHERE id = $1 AND project_id = $2", [input.sourceDocumentId, projectId])).rows.length) throw notFound();
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${t}:${projectId}:${key}`]);
    const latest = (await tx.query<{ id: string; version: number; status: string }>(`SELECT id, version, status FROM ${t} WHERE project_id = $1 AND item_key = $2 ORDER BY version DESC LIMIT 1`, [projectId, key])).rows[0];
    // A draft is still mutable; anything reviewed or approved gets a new version instead.
    if (latest?.status === "draft") {
      await tx.query(`UPDATE ${t} SET payload = $2, source_document_id = $3, source_reference = $4 WHERE id = $1`, [latest.id, JSON.stringify(payload), input.sourceDocumentId ?? null, input.sourceReference ?? ""]);
      await audit(tx, { projectId, actorId: viewer.id, action: `context.${kind}.update`, objectType: kind, objectId: latest.id, correlationId, metadata: { key, version: latest.version } });
      return { id: latest.id, key, version: latest.version };
    }
    const version = (latest?.version ?? 0) + 1;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO ${t} (project_id, item_key, version, payload, source_document_id, source_reference, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [projectId, key, version, JSON.stringify(payload), input.sourceDocumentId ?? null, input.sourceReference ?? "", viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: `context.${kind}.create`, objectType: kind, objectId: rows[0]!.id, correlationId, metadata: { key, version } });
    return { id: rows[0]!.id, key, version };
  };
  return tx ? run(tx) : withTx(run);
}

const NEXT: Record<string, string[]> = { draft: ["reviewed", "approved", "obsolete"], reviewed: ["approved", "draft", "obsolete"], approved: ["obsolete"], obsolete: [] };

/** Approving also stamps the review and retires the previously approved version of the same key. */
export async function transitionItem(viewer: Viewer, projectId: string, kind: ContextKind, id: string, to: "reviewed" | "approved" | "obsolete", correlationId: string) {
  await can(viewer, "context.write", projectId);
  const t = KIND_TABLE[kind];
  return withTx(async (tx) => {
    const cur = (await tx.query<{ status: string; item_key: string; source_document_id: string | null; source_reference: string }>(
      `SELECT status, item_key, source_document_id, source_reference FROM ${t} WHERE id = $1 AND project_id = $2 FOR UPDATE`, [id, projectId],
    )).rows[0];
    if (!cur) throw notFound();
    if (!NEXT[cur.status]!.includes(to)) throw conflict(`Status ${cur.status} tidak dapat diubah menjadi ${to}`);
    if (to === "approved" && kind === "rule" && !cur.source_document_id && !cur.source_reference.trim()) {
      throw new HttpError(409, "source_required", "Aturan tanpa sumber (dokumen atau referensi) tidak dapat disetujui");
    }
    if (to === "approved") {
      await tx.query(`UPDATE ${t} SET status = 'obsolete' WHERE project_id = $1 AND item_key = $2 AND status = 'approved' AND id <> $3`, [projectId, cur.item_key, id]);
      await tx.query(`UPDATE ${t} SET status = 'approved', approved_by = $2, approved_at = now(), reviewed_by = coalesce(reviewed_by, $2), reviewed_at = coalesce(reviewed_at, now()) WHERE id = $1`, [id, viewer.id]);
    } else if (to === "reviewed") {
      await tx.query(`UPDATE ${t} SET status = 'reviewed', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [id, viewer.id]);
    } else {
      await tx.query(`UPDATE ${t} SET status = $2 WHERE id = $1`, [id, to]);
    }
    await audit(tx, { projectId, actorId: viewer.id, action: `context.${kind}.${to}`, objectType: kind, objectId: id, correlationId, metadata: { from: cur.status } });
    return { status: to };
  });
}

// ---------------------------------------------------------------- documents

export async function listDocuments(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query<{ id: string; title: string; reference: string; version: string; excerpt: string; createdAt: string }>(
    `SELECT id, title, reference, version, excerpt, created_at AS "createdAt" FROM context_documents WHERE project_id = $1 ORDER BY created_at DESC`, [projectId],
  );
  return rows;
}

export async function createDocument(viewer: Viewer, projectId: string, input: { title: string; reference: string; version: string; excerpt: string }, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO context_documents (project_id, title, reference, version, excerpt, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [projectId, input.title, input.reference, input.version, input.excerpt, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "context.document.create", objectType: "context_document", objectId: rows[0]!.id, correlationId, metadata: { title: input.title } });
    return { id: rows[0]!.id };
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
  const { rows } = await db().query<BpmnModel>(
    `SELECT m.id, m.item_key AS key, m.version, m.name, m.file_name AS "fileName", m.status, m.validation_status AS "validationStatus", m.readable,
            m.validation_error AS "validationError", m.tasks, m.element_count AS "elementCount", m.created_at AS "createdAt",
            (SELECT json_build_object('id', b.id, 'version', b.version, 'mapping', b.mapping, 'conflicts', b.conflicts, 'unmappedTasks', b.unmapped_tasks,
                    'unmappedActivities', b.unmapped_activities, 'labelSourceDatasetId', b.label_source_dataset_id)
               FROM bpmn_mappings b WHERE b.bpmn_model_id = m.id ORDER BY b.version DESC LIMIT 1) AS mapping
       FROM bpmn_models m WHERE m.project_id = $1 ORDER BY m.created_at DESC`,
    [projectId],
  );
  return rows;
}

const MAX_BPMN_BYTES = 5 * 1024 * 1024;

export async function uploadBpmn(viewer: Viewer, projectId: string, input: { name: string; fileName: string; xml: string }, correlationId: string) {
  await can(viewer, "context.write", projectId);
  const bytes = Buffer.from(input.xml, "utf8");
  if (bytes.length > MAX_BPMN_BYTES) throw badRequest("File BPMN melebihi 5 MB");
  const key = slug(input.name);
  const res = await withTx(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`bpmn:${projectId}:${key}`]);
    const version = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM bpmn_models WHERE project_id = $1 AND item_key = $2", [projectId, key])).rows[0]!.v ?? 0) + 1;
    const id = crypto.randomUUID();
    const objectKey = `projects/${projectId}/context/bpmn/${id}/${version}/model.bpmn`;
    await putObject(projectId, objectKey, bytes, "application/xml");
    await tx.query(
      `INSERT INTO bpmn_models (id, project_id, item_key, version, name, file_name, object_key, sha256, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, projectId, key, version, input.name, input.fileName, objectKey, createHash("sha256").update(bytes).digest("hex"), viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "context.bpmn.upload", objectType: "bpmn_model", objectId: id, correlationId, metadata: { name: input.name, version } });
    return { id, objectKey };
  });
  await startJob("validateBpmnWorkflow", `bpmn-${res.id}`, [{ projectId, modelId: res.id, objectKey: res.objectKey, requestedBy: viewer.id, correlationId }]);
  return { id: res.id };
}

export async function getBpmnXml(viewer: Viewer, projectId: string, modelId: string): Promise<string> {
  await can(viewer, "project.read", projectId);
  const m = (await db().query<{ object_key: string }>("SELECT object_key FROM bpmn_models WHERE id = $1 AND project_id = $2", [modelId, projectId])).rows[0];
  if (!m) throw notFound();
  return Buffer.from(await getBytes(projectId, m.object_key)).toString("utf8");
}

export async function approveBpmn(viewer: Viewer, projectId: string, modelId: string, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    const m = (await tx.query<{ item_key: string; readable: boolean; validation_status: string }>("SELECT item_key, readable, validation_status FROM bpmn_models WHERE id = $1 AND project_id = $2 FOR UPDATE", [modelId, projectId])).rows[0];
    if (!m) throw notFound();
    if (m.validation_status === "pending") throw conflict("Validasi BPMN masih berjalan");
    // An invalid conversion stays usable as a visual reference; conformance is then switched off in the package.
    if (!m.readable) throw conflict("BPMN tidak dapat dibaca dan tidak dapat disetujui");
    await tx.query("UPDATE bpmn_models SET status = 'obsolete' WHERE project_id = $1 AND status = 'approved' AND id <> $2", [projectId, modelId]);
    await tx.query("UPDATE bpmn_models SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1", [modelId, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "context.bpmn.approved", objectType: "bpmn_model", objectId: modelId, correlationId });
    return { status: "approved" };
  });
}

/** Saves task → activity labels as a new mapping version; conflicts are flagged for review, not rejected. */
export async function saveBpmnMapping(viewer: Viewer, projectId: string, modelId: string, mapping: Record<string, string[]>, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    const m = (await tx.query<{ tasks: { id: string; name: string }[] }>("SELECT tasks FROM bpmn_models WHERE id = $1 AND project_id = $2 FOR UPDATE", [modelId, projectId])).rows[0];
    if (!m) throw notFound();
    const taskIds = new Set(m.tasks.map((t) => t.id));
    const clean: Record<string, string[]> = {};
    for (const [task, labels] of Object.entries(mapping)) {
      if (!taskIds.has(task)) throw badRequest(`Task ${task} tidak ada pada model`);
      const uniq = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
      if (uniq.length) clean[task] = uniq;
    }
    const ds = (await tx.query<{ id: string; activity_labels: { label: string }[] | null }>(
      "SELECT id, activity_labels FROM dataset_versions WHERE project_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1", [projectId],
    )).rows[0];
    const owners = new Map<string, string[]>();
    for (const [task, labels] of Object.entries(clean)) for (const l of labels) owners.set(l, [...(owners.get(l) ?? []), task]);
    const conflicts = [...owners.entries()].filter(([, ts]) => ts.length > 1).map(([l]) => l).sort();
    const unmappedTasks = m.tasks.filter((t) => !clean[t.id]).map((t) => t.id);
    const unmappedActivities = (ds?.activity_labels ?? []).map((l) => l.label).filter((l) => !owners.has(l)).sort();
    const version = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM bpmn_mappings WHERE bpmn_model_id = $1", [modelId])).rows[0]!.v ?? 0) + 1;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO bpmn_mappings (project_id, bpmn_model_id, version, mapping, label_source_dataset_id, conflicts, unmapped_tasks, unmapped_activities, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [projectId, modelId, version, JSON.stringify(clean), ds?.id ?? null, JSON.stringify(conflicts), JSON.stringify(unmappedTasks), JSON.stringify(unmappedActivities), viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "context.bpmn.mapping", objectType: "bpmn_mapping", objectId: rows[0]!.id, correlationId, metadata: { modelId, version, conflicts: conflicts.length } });
    return { id: rows[0]!.id, version, conflicts, unmappedTasks, unmappedActivities };
  });
}

// ---------------------------------------------------------------- rule preview

export async function previewRule(viewer: Viewer, projectId: string, ruleId: string | null, draft?: unknown): Promise<PreviewRuleResult> {
  await can(viewer, "project.read", projectId);
  let rule = draft;
  if (!rule) {
    const r = (await db().query<{ payload: unknown }>("SELECT payload FROM rules WHERE id = $1 AND project_id = $2", [ruleId, projectId])).rows[0];
    if (!r) throw notFound();
    rule = r.payload;
  }
  const parsed = RulePayload.safeParse(rule);
  if (!parsed.success) throw badRequest("Aturan tidak valid");
  const ds = (await db().query<{ events_key: string }>("SELECT events_key FROM dataset_versions WHERE project_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1", [projectId])).rows[0];
  if (!ds) throw conflict("Belum ada dataset terbit untuk pratinjau aturan");
  return runJob<PreviewRuleResult>("previewRuleWorkflow", `rule-preview-${crypto.randomUUID()}`, [{ projectId, eventsKey: ds.events_key, rule: parsed.data, maxCases: 5000 }], 60_000);
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
  const { rows } = await db().query<PackageRow>(
    `SELECT p.id, p.version, p.name, p.status, p.hash, p.conformance_available AS "conformanceAvailable", p.created_at AS "createdAt", p.activated_at AS "activatedAt",
            coalesce((SELECT json_agg(json_build_object('type', r.ref_type, 'key', r.ref_key, 'version', r.ref_version) ORDER BY r.ref_type, r.ref_key)
                        FROM context_package_refs r WHERE r.package_id = p.id), '[]') AS refs
       FROM context_packages p WHERE p.project_id = $1 ORDER BY p.version DESC`,
    [projectId],
  );
  return rows;
}

/** Collects approved items into an immutable package, then activates it. Same content → same hash → no new version. */
export async function freezeAndActivate(viewer: Viewer, projectId: string, correlationId: string) {
  await can(viewer, "context.write", projectId);
  return withTx(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`package:${projectId}`]);
    const approved = async (kind: ContextKind) => (await listItems(tx, projectId, kind)).filter((i) => i.status === "approved");
    const [boundary] = await approved("process_boundary");
    if (!boundary) throw new HttpError(409, "boundary_required", "Batas proses yang disetujui wajib ada sebelum paket diaktifkan");
    const [rework] = await approved("rework_definition");
    const [calendar] = await approved("calendar");
    const [rubric] = await approved("rubric");
    const rules = await approved("rule");
    const hypotheses = await approved("hypothesis");
    const interventions = await approved("intervention");
    const bpmn = (await tx.query<{ id: string; item_key: string; version: number; validation_status: string }>(
      "SELECT id, item_key, version, validation_status FROM bpmn_models WHERE project_id = $1 AND status = 'approved' LIMIT 1", [projectId],
    )).rows[0];
    const mapping = bpmn ? (await tx.query<{ id: string; version: number; mapping: Record<string, string[]> }>("SELECT id, version, mapping FROM bpmn_mappings WHERE bpmn_model_id = $1 ORDER BY version DESC LIMIT 1", [bpmn.id])).rows[0] : undefined;
    const conformance = !!bpmn && bpmn.validation_status === "valid" && !!mapping && Object.keys(mapping.mapping).length > 0;

    const refs = [
      ...[boundary, rework, calendar, rubric].filter(Boolean).map((i) => ({ type: i!.kind, id: i!.id, key: i!.key, version: i!.version })),
      ...[...rules, ...hypotheses, ...interventions].map((i) => ({ type: i.kind, id: i.id, key: i.key, version: i.version })),
      ...(bpmn ? [{ type: "bpmn_model", id: bpmn.id, key: bpmn.item_key, version: bpmn.version }] : []),
      ...(mapping ? [{ type: "bpmn_mapping", id: mapping.id, key: bpmn!.item_key, version: mapping.version }] : []),
    ].sort((a, b) => `${a.type}:${a.key}`.localeCompare(`${b.type}:${b.key}`));
    const hash = createHash("sha256").update(stableStringify(refs.map((r) => [r.type, r.id, r.version]))).digest("hex");

    const active = (await tx.query<{ id: string; hash: string }>("SELECT id, hash FROM context_packages WHERE project_id = $1 AND status = 'active'", [projectId])).rows[0];
    if (active?.hash === hash) return { id: active.id, created: false, hash };
    const existing = (await tx.query<{ id: string }>("SELECT id FROM context_packages WHERE project_id = $1 AND hash = $2 ORDER BY version DESC LIMIT 1", [projectId, hash])).rows[0];
    let id = existing?.id;
    if (!id) {
      const version = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM context_packages WHERE project_id = $1", [projectId])).rows[0]!.v ?? 0) + 1;
      id = (await tx.query<{ id: string }>(
        `INSERT INTO context_packages (project_id, version, name, status, hash, process_boundary_id, rework_definition_id, calendar_id, bpmn_model_id, bpmn_mapping_id, rubric_id, conformance_available, created_by)
         VALUES ($1, $2, $3, 'ready', $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [projectId, version, `Konteks v${version}`, hash, boundary.id, rework?.id ?? null, calendar?.id ?? null, bpmn?.id ?? null, mapping?.id ?? null, rubric?.id ?? null, conformance, viewer.id],
      )).rows[0]!.id;
      for (const r of refs) await tx.query("INSERT INTO context_package_refs (package_id, ref_type, ref_id, ref_key, ref_version) VALUES ($1, $2, $3, $4, $5)", [id, r.type, r.id, r.key, r.version]);
    }
    await tx.query("UPDATE context_packages SET status = 'superseded' WHERE project_id = $1 AND status = 'active'", [projectId]);
    await tx.query("UPDATE context_packages SET status = 'active', activated_by = $2, activated_at = now() WHERE id = $1", [id, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "context.package.activate", objectType: "context_package", objectId: id, correlationId, metadata: { hash, refs: refs.length, conformance } });
    return { id, created: !existing, hash };
  });
}

export async function contextSummary(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const q = db();
  const kinds = Object.keys(KIND_TABLE) as ContextKind[];
  const items = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await listItems(q, projectId, k, { latestOnly: true })]))) as Record<ContextKind, ContextItem[]>;
  const labels = (await q.query<{ activity_labels: { label: string; count: number }[] | null; name: string }>(
    "SELECT activity_labels, name FROM dataset_versions WHERE project_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1", [projectId],
  )).rows[0];
  const [documents, bpmn, packages] = await Promise.all([listDocuments(viewer, projectId), listBpmn(viewer, projectId), listPackages(viewer, projectId)]);
  return { items, documents, bpmn, packages, datasetLabels: labels?.activity_labels?.map((l) => l.label) ?? [], datasetName: labels?.name ?? null };
}
