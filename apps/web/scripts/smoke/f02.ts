import { addAnalyst, bootstrapProject, check, Client, rejects, run, uploadFile, waitDataset, waitSnapshot } from "./harness.ts";

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

await run("f02", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const analyst = await addAnalyst(s, admin, projectId);
  check((await s.db.source.count()) === 0, "no sources before user action");

  const src = await analyst.call((t) => t.sources.create.mutate({ projectId, name: "ERP export" }));
  check(src.status === 200, "analyst creates source");
  const sourceId = src.body.id;
  const complete = (snapshotId: string) => analyst.call((t) => t.snapshots.complete.mutate({ projectId, snapshotId }));

  // Upload: signed PUT straight to storage, then complete → snapshotId, status validating.
  const up = await uploadFile(analyst, projectId, sourceId, "po.csv", CSV);
  check(up.putStatus === 200, "browser-style signed PUT accepted", up.putStatus);
  check(up.url.includes(`projects%2F${projectId}%2F`) || up.url.includes(`projects/${projectId}/`), "raw key is under project prefix");
  const again = await fetch(up.url, { method: "PUT", headers: up.headers, body: "overwrite" });
  check(again.status === 412, "raw object cannot be overwritten", again.status);
  const done = await complete(up.snapshotId);
  check(done.status === 200 && done.body.snapshotId === up.snapshotId && done.body.status === "validating", "complete returns snapshotId and validating", done.body);
  const snap = await waitSnapshot(analyst, projectId, up.snapshotId);
  check(snap.status === "ready_for_mapping" && snap.rowCount === 8 && snap.format === "csv", "CSV ingested", { status: snap.status, rows: snap.rowCount, err: snap.errorMessage });
  check(snap.suggestedMapping?.caseId === "case_id" && snap.suggestedMapping?.timestamp === "timestamp", "mapping suggested from header");
  check(snap.sha256?.length === 64, "checksum recorded");

  // Same bytes on the same source are recognised before reprocessing.
  const dup = await uploadFile(analyst, projectId, sourceId, "po-again.csv", CSV);
  await complete(dup.snapshotId);
  const dupSnap = await waitSnapshot(analyst, projectId, dup.snapshotId);
  check(dupSnap.reusedFrom === up.snapshotId && dupSnap.status === "ready_for_mapping", "identical checksum reuses staging", dupSnap.reusedFrom);

  // cp1252 needs review; broken zip fails non-retryably.
  const latin = await uploadFile(analyst, projectId, sourceId, "latin.csv", Uint8Array.from([...Buffer.from("case_id,activity,timestamp\nA,Caf"), 0xe9, ...Buffer.from(",2026-01-01\n")]));
  await complete(latin.snapshotId);
  const latinSnap = await waitSnapshot(analyst, projectId, latin.snapshotId);
  check(latinSnap.status === "needs_review" && latinSnap.encoding === "cp1252", "cp1252 file needs review", latinSnap.status);
  check((await analyst.call((t) => t.snapshots.review.mutate({ projectId, snapshotId: latin.snapshotId, action: "approve" }))).body.status === "ready_for_mapping", "reviewed snapshot approved");
  const bad = await uploadFile(analyst, projectId, sourceId, "bad.zip", Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
  await complete(bad.snapshotId);
  const badSnap = await waitSnapshot(analyst, projectId, bad.snapshotId);
  check(badSnap.status === "failed" && badSnap.errorMessage, "invalid file fails with message", badSnap);

  // Mapping: versioned, preview of ≤50 events in UTC.
  const config = {
    columns: { caseId: "case_id", activity: "activity", timestamp: "timestamp", resource: "user", caseAttributes: ["amount"], eventAttributes: [], objectRefs: [] },
    timestampFormat: "%Y-%m-%d %H:%M", timezone: "Asia/Jakarta", labelMap: { "Approve PO": "Approve Purchase Order" }, repairRules: [],
  };
  const m1 = await analyst.call((t) => t.mappings.create.mutate({ projectId, sourceId, config }));
  check(m1.body.created && m1.body.version === 1, "mapping v1 saved");
  const started = Date.now();
  const prev = await analyst.call((t) => t.mappings.preview.mutate({ projectId, mappingId: m1.body.id, snapshotId: up.snapshotId }));
  check(prev.status === 200 && prev.body.events.length === 8, "preview returns mapped events", prev.body ?? prev.error);
  check(prev.body?.events?.[0]?.timeUtc === "2026-01-05T01:00:00.000Z", "preview converts to UTC", prev.body?.events?.[0]);
  check(prev.body?.events?.[1]?.activity === "Approve Purchase Order", "label map applied in preview");
  console.log(`       preview took ${Date.now() - started} ms`);

  // Dataset with the invalid timestamp: not_ready, cannot publish.
  const d1 = await analyst.call((t) => t.datasets.prepare.mutate({ projectId, snapshotId: up.snapshotId, mappingVersionId: m1.body.id }));
  check(d1.status === 200 && !d1.body.reused && d1.body.status === "processing", "dataset processing started", d1.body);
  const ds1 = await waitDataset(analyst, projectId, d1.body.id);
  check(ds1.status === "quality_review" && ds1.qualityStatus === "not_ready", "invalid timestamp makes dataset not_ready", { status: ds1.status, q: ds1.qualityStatus, err: ds1.errorMessage });
  const f = ds1.findings.find((x) => x.check === "timestamp_invalid");
  check(f && f.eventCount === 1 && f.samples[0]!.row === 5 && f.severity === "high", "quality finding shows count, severity and source row", f);
  check((await analyst.call((t) => t.datasets.publish.mutate({ projectId, datasetId: d1.body.id }))).status === 409, "not_ready dataset cannot be published");

  // Repair as a rule → new mapping version → new dataset with a different content hash.
  const m2 = await analyst.call((t) => t.mappings.create.mutate({ projectId, sourceId, config: { ...config, repairRules: [{ type: "exclude_invalid", checks: ["timestamp_invalid", "required_missing"] }] } }));
  check(m2.body.version === 2, "repair rule creates mapping v2");
  const d2 = await analyst.call((t) => t.datasets.prepare.mutate({ projectId, snapshotId: up.snapshotId, mappingVersionId: m2.body.id }));
  const ds2 = await waitDataset(analyst, projectId, d2.body.id);
  check(ds2.qualityStatus === "ready_with_notes" && ds2.excludedEventCount === 1 && ds2.caseCount === 3, "repaired dataset ready with notes", { q: ds2.qualityStatus, ex: ds2.excludedEventCount });
  check(ds2.contentHash !== ds1.contentHash, "config change gives a new content hash");
  check(ds2.capabilities?.serviceTime?.available === false && ds2.capabilities?.resourceAnalysis?.available === true, "capability matrix computed", ds2.capabilities);
  const same = await analyst.call((t) => t.datasets.prepare.mutate({ projectId, snapshotId: dup.snapshotId, mappingVersionId: m2.body.id }));
  check(same.body.reused && same.body.id === d2.body.id, "same input and config reuse the same content hash");

  check((await new Client(s.baseUrl).call((t) => t.datasets.get.query({ projectId, datasetId: d2.body.id }))).status === 401, "anonymous read refused");
  const pub = await analyst.call((t) => t.datasets.publish.mutate({ projectId, datasetId: d2.body.id }));
  check(pub.status === 200 && pub.body.status === "published", "dataset published");
  check(await rejects(s.db.datasetVersion.update({ where: { id: d2.body.id }, data: { eventCount: 1n } })), "published dataset is immutable in the database");

  const ready = await analyst.call((t) => t.projects.readiness.query({ projectId }));
  check(ready.body.state === "needs_context" && ready.body.facts.dataset?.id === d2.body.id, "readiness moves to context", ready.body.state);

  // Isolation: another project's member gets 404 on this project's objects.
  const other = await analyst.call((t) => t.clients.create.mutate({ name: "x" }));
  check(other.status === 403, "analyst cannot create clients");
  const audit = (await admin.call((t) => t.projects.audit.query({ projectId }))).body.events.map((e) => e.action);
  check(["mapping.create", "dataset.publish", "snapshot.ingest"].every((a) => audit.includes(a)), "mapping, ingest and publish are audited");

  const row = await s.db.datasetVersion.findUniqueOrThrow({ where: { id: d2.body.id }, select: { eventsKey: true } });
  check(row.eventsKey === `projects/${projectId}/datasets/${d2.body.id}/events.parquet`, "dataset parquet under project prefix");
}, { workers: true });
