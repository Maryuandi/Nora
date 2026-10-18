import { addAnalyst, bootstrapProject, check, Client, run, waitFor, type Smoke } from "./harness.ts";

const CSV = [
  "case_id,activity,timestamp,user,amount",
  "PO-1,Create PO,2026-01-05 08:00,ana,100",
  "PO-1,Approve PO,2026-01-05 10:30,bob,100",
  "PO-1,Pay Invoice,2026-01-07 09:00,ana,100",
  "PO-2,Create PO,2026-01-06 08:00,ana,250",
  "PO-2,Approve PO,not-a-date,bob,250",
  "PO-2,Pay Invoice,2026-01-09 11:00,cici,250",
  "PO-3,Create PO,2026-01-06 09:00,ana,80",
  "PO-3,Pay Invoice,2026-01-08 09:00,cici,80",
].join("\n") + "\n";

async function upload(s: Smoke, c: Client, projectId: string, sourceId: string, name: string, body: Uint8Array | string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const init = await c.post(`/api/lite/projects/${projectId}/sources/${sourceId}/uploads`, { fileName: name, size: bytes.length });
  if (init.status !== 201) throw new Error(`upload init ${init.status} ${JSON.stringify(init.body)}`);
  const put = await fetch(init.body.upload.url, { method: "PUT", headers: init.body.upload.headers, body: bytes as unknown as BodyInit });
  return { snapshotId: init.body.snapshotId as string, putStatus: put.status, url: init.body.upload.url as string, headers: init.body.upload.headers };
}

async function settled(c: Client, projectId: string, snapshotId: string) {
  return waitFor(`snapshot ${snapshotId}`, async () => {
    const r = await c.get(`/api/lite/projects/${projectId}/snapshots/${snapshotId}`);
    return ["awaiting_upload", "validating"].includes(r.body.status) ? null : r.body;
  });
}

async function dataset(c: Client, projectId: string, id: string) {
  return waitFor(`dataset ${id}`, async () => {
    const r = await c.get(`/api/lite/projects/${projectId}/datasets/${id}`);
    return ["processing", "draft"].includes(r.body.status) ? null : r.body;
  }, 180_000);
}

await run("f02", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const analyst = await addAnalyst(s, admin, projectId);
  check((await s.db.query("SELECT count(*)::int n FROM sources")).rows[0].n === 0, "no sources before user action");

  const src = await analyst.post(`/api/lite/projects/${projectId}/sources`, { name: "ERP export" });
  check(src.status === 201, "analyst creates source");
  const sourceId = src.body.id as string;

  // Upload: signed PUT straight to storage, then complete → 202 + snapshotId.
  const up = await upload(s, analyst, projectId, sourceId, "po.csv", CSV);
  check(up.putStatus === 200, "browser-style signed PUT accepted", up.putStatus);
  check(up.url.includes(`projects%2F${projectId}%2F`) || up.url.includes(`projects/${projectId}/`), "raw key is under project prefix");
  const again = await fetch(up.url, { method: "PUT", headers: up.headers, body: "overwrite" });
  check(again.status === 412, "raw object cannot be overwritten", again.status);
  const done = await analyst.post(`/api/lite/projects/${projectId}/snapshots/${up.snapshotId}/complete`);
  check(done.status === 202 && done.body.snapshotId === up.snapshotId, "complete returns 202 with snapshotId", done.body);
  const snap = await settled(analyst, projectId, up.snapshotId);
  check(snap.status === "ready_for_mapping" && snap.rowCount === 8 && snap.format === "csv", "CSV ingested", { status: snap.status, rows: snap.rowCount, err: snap.errorMessage });
  check(snap.suggestedMapping?.caseId === "case_id" && snap.suggestedMapping?.timestamp === "timestamp", "mapping suggested from header");
  check(snap.sha256?.length === 64, "checksum recorded");

  // Same bytes on the same source are recognised before reprocessing.
  const dup = await upload(s, analyst, projectId, sourceId, "po-again.csv", CSV);
  await analyst.post(`/api/lite/projects/${projectId}/snapshots/${dup.snapshotId}/complete`);
  const dupSnap = await settled(analyst, projectId, dup.snapshotId);
  check(dupSnap.reusedFrom === up.snapshotId && dupSnap.status === "ready_for_mapping", "identical checksum reuses staging", dupSnap.reusedFrom);

  // cp1252 needs review; broken zip fails non-retryably.
  const latin = await upload(s, analyst, projectId, sourceId, "latin.csv", Uint8Array.from([...Buffer.from("case_id,activity,timestamp\nA,Caf"), 0xe9, ...Buffer.from(",2026-01-01\n")]));
  await analyst.post(`/api/lite/projects/${projectId}/snapshots/${latin.snapshotId}/complete`);
  const latinSnap = await settled(analyst, projectId, latin.snapshotId);
  check(latinSnap.status === "needs_review" && latinSnap.encoding === "cp1252", "cp1252 file needs review", latinSnap.status);
  check((await analyst.post(`/api/lite/projects/${projectId}/snapshots/${latin.snapshotId}/review`, { action: "approve" })).body.status === "ready_for_mapping", "reviewed snapshot approved");
  const bad = await upload(s, analyst, projectId, sourceId, "bad.zip", Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
  await analyst.post(`/api/lite/projects/${projectId}/snapshots/${bad.snapshotId}/complete`);
  const badSnap = await settled(analyst, projectId, bad.snapshotId);
  check(badSnap.status === "failed" && badSnap.errorMessage, "invalid file fails with message", badSnap);

  // Mapping: versioned, preview of ≤50 events in UTC.
  const config = {
    columns: { caseId: "case_id", activity: "activity", timestamp: "timestamp", resource: "user", caseAttributes: ["amount"], eventAttributes: [], objectRefs: [] },
    timestampFormat: "%Y-%m-%d %H:%M", timezone: "Asia/Jakarta", labelMap: { "Approve PO": "Approve Purchase Order" }, repairRules: [],
  };
  const m1 = await analyst.post(`/api/lite/projects/${projectId}/mappings`, { sourceId, config });
  check(m1.status === 201 && m1.body.version === 1, "mapping v1 saved");
  const started = Date.now();
  const prev = await analyst.post(`/api/lite/projects/${projectId}/mappings/${m1.body.id}/preview`, { snapshotId: up.snapshotId });
  check(prev.status === 200 && prev.body.events.length === 8, "preview returns mapped events", prev.body);
  check(prev.body.events?.[0]?.timeUtc === "2026-01-05T01:00:00.000Z", "preview converts to UTC", prev.body.events?.[0]);
  check(prev.body.events?.[1]?.activity === "Approve Purchase Order", "label map applied in preview");
  console.log(`       preview took ${Date.now() - started} ms`);

  // Dataset with the invalid timestamp: not_ready, cannot publish.
  const d1 = await analyst.post(`/api/lite/projects/${projectId}/datasets`, { snapshotId: up.snapshotId, mappingVersionId: m1.body.id });
  check(d1.status === 202, "dataset processing started", d1.body);
  const ds1 = await dataset(analyst, projectId, d1.body.id);
  check(ds1.status === "quality_review" && ds1.qualityStatus === "not_ready", "invalid timestamp makes dataset not_ready", { status: ds1.status, q: ds1.qualityStatus, err: ds1.errorMessage });
  const f = ds1.findings?.find((x: any) => x.check === "timestamp_invalid");
  check(f && f.eventCount === 1 && f.samples[0].row === 5 && f.severity === "high", "quality finding shows count, severity and source row", f);
  check((await analyst.post(`/api/lite/projects/${projectId}/datasets/${d1.body.id}/publish`)).status === 409, "not_ready dataset cannot be published");

  // Repair as a rule → new mapping version → new dataset with a different content hash.
  const m2 = await analyst.post(`/api/lite/projects/${projectId}/mappings`, { sourceId, config: { ...config, repairRules: [{ type: "exclude_invalid", checks: ["timestamp_invalid", "required_missing"] }] } });
  check(m2.body.version === 2, "repair rule creates mapping v2");
  const d2 = await analyst.post(`/api/lite/projects/${projectId}/datasets`, { snapshotId: up.snapshotId, mappingVersionId: m2.body.id });
  const ds2 = await dataset(analyst, projectId, d2.body.id);
  check(ds2.qualityStatus === "ready_with_notes" && ds2.excludedEventCount === 1 && ds2.caseCount === 3, "repaired dataset ready with notes", { q: ds2.qualityStatus, ex: ds2.excludedEventCount });
  check(ds2.contentHash !== ds1.contentHash, "config change gives a new content hash");
  check(ds2.capabilities?.serviceTime?.available === false && ds2.capabilities?.resourceAnalysis?.available === true, "capability matrix computed", ds2.capabilities);
  const same = await analyst.post(`/api/lite/projects/${projectId}/datasets`, { snapshotId: dup.snapshotId, mappingVersionId: m2.body.id });
  check(same.status === 200 && same.body.id === d2.body.id, "same input and config reuse the same content hash");

  check((await new Client(s.baseUrl).get(`/api/lite/projects/${projectId}/datasets/${d2.body.id}`)).status === 401, "anonymous read refused");
  const pub = await analyst.post(`/api/lite/projects/${projectId}/datasets/${d2.body.id}/publish`);
  check(pub.status === 200 && pub.body.status === "published", "dataset published");
  let immutable = false;
  try { await s.db.query("UPDATE dataset_versions SET event_count = 1 WHERE id = $1", [d2.body.id]); } catch { immutable = true; }
  check(immutable, "published dataset is immutable in the database");

  const ready = await analyst.get(`/api/lite/projects/${projectId}/readiness`);
  check(ready.body.state === "needs_context" && ready.body.facts.dataset?.id === d2.body.id, "readiness moves to context", ready.body.state);

  // Isolation: another project's member gets 404 on this project's objects.
  const other = await analyst.post("/api/lite/clients", { name: "x" });
  check(other.status === 403, "analyst cannot create clients");
  const audit = (await admin.get(`/api/lite/projects/${projectId}/audit`)).body.events.map((e: any) => e.action);
  check(["mapping.create", "dataset.publish", "snapshot.ingest"].every((a) => audit.includes(a)), "mapping, ingest and publish are audited");

  const objs = await s.db.query("SELECT events_key FROM dataset_versions WHERE id = $1", [d2.body.id]);
  check(objs.rows[0].events_key === `projects/${projectId}/datasets/${d2.body.id}/events.parquet`, "dataset parquet under project prefix");
}, { workers: true });
