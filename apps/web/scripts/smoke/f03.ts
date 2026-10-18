import { addAnalyst, bootstrapProject, check, P2P_CONFIG, p2pCsv, publishCsv, run, waitFor } from "./harness.ts";

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <process id="p" isExecutable="false">
    <startEvent id="s"/>
    <task id="t1" name="Create PO"/><task id="t2" name="Approve PO"/><task id="t3" name="Receive Goods"/><task id="t4" name="Pay Invoice"/>
    <endEvent id="e"/>
    <sequenceFlow id="f1" sourceRef="s" targetRef="t1"/><sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/>
    <sequenceFlow id="f3" sourceRef="t2" targetRef="t3"/><sequenceFlow id="f4" sourceRef="t3" targetRef="t4"/><sequenceFlow id="f5" sourceRef="t4" targetRef="e"/>
  </process>
</definitions>`;

await run("f03", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const P = `/api/lite/projects/${projectId}`;
  await publishCsv(a, projectId, p2pCsv(40), P2P_CONFIG);

  // Boundary and rework: draft → Ready; labels absent from the dataset are allowed.
  const b = await a.post(`${P}/context/definitions`, { kind: "process_boundary", payload: { startActivities: ["Create PO"], endActivities: ["Pay Invoice", "Future Activity"] } });
  check(b.status === 201, "boundary saved with a label not in the dataset", b.body);
  check((await a.post(`${P}/context/items/process_boundary/${b.body.id}/status`, { to: "approved" })).status === 200, "boundary approved");
  const b2 = await a.post(`${P}/context/definitions`, { kind: "process_boundary", payload: { startActivities: ["Create PO"], endActivities: ["Pay Invoice"] } });
  check(b2.body.version === 2, "editing an approved item creates a new version");
  let immutable = false;
  try { await s.db.query("UPDATE process_boundaries SET payload = '{}' WHERE id = $1", [b.body.id]); } catch { immutable = true; }
  check(immutable, "approved item is immutable in the database");
  await a.post(`${P}/context/items/process_boundary/${b2.body.id}/status`, { to: "approved" });
  check((await s.db.query("SELECT status FROM process_boundaries WHERE id = $1", [b.body.id])).rows[0].status === "obsolete", "previous approved version becomes obsolete");
  const rw = await a.post(`${P}/context/definitions`, { kind: "rework_definition", payload: { rules: [{ type: "repeated_activity", activity: "Approve PO", minOccurrences: 2 }, { type: "return_transition", from: "Request Change", to: "Approve PO" }] } });
  await a.post(`${P}/context/items/rework_definition/${rw.body.id}/status`, { to: "approved" });

  // Rules: a rule without a source cannot be approved; preview evaluates on the published dataset.
  const r1 = await a.post(`${P}/context/rules`, { key: "sla-approve", payload: { name: "Approve ≤ 24 jam", params: { type: "sla_duration", fromActivity: "Create PO", toActivity: "Approve PO", maxHours: 24 } } });
  check(r1.status === 201, "rule saved", r1.body);
  const noSrc = await a.patch(`${P}/context/rules`, { id: r1.body.id, to: "approved" });
  check(noSrc.status === 409 && noSrc.body.error === "source_required", "rule without source cannot be approved", noSrc.body);
  const prev = await a.post(`${P}/context/rules/${r1.body.id}/preview`, {});
  check(prev.status === 200 && prev.body.evaluatedCases === 40 && prev.body.nonCompliant > 0 && prev.body.compliant > 0, "rule preview evaluates cases", prev.body);
  const doc = await a.post(`${P}/context/documents`, { title: "SOP Pengadaan", reference: "SOP-PRC-01", excerpt: "PO disetujui paling lambat 24 jam." });
  const r2 = await a.post(`${P}/context/rules`, { key: "sla-approve", payload: { name: "Approve ≤ 24 jam", params: { type: "sla_duration", fromActivity: "Create PO", toActivity: "Approve PO", maxHours: 24 } }, sourceDocumentId: doc.body.id, sourceReference: "SOP-PRC-01 §3" });
  check(r2.body.id === r1.body.id, "draft rule updated in place");
  check((await a.patch(`${P}/context/rules`, { id: r1.body.id, to: "approved" })).status === 200, "rule with source approved");
  const sod = await a.post(`${P}/context/rules/draft/preview`, { rule: { name: "SoD", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } } });
  check(sod.status === 200 && sod.body.nonCompliant > 0, "separation-of-duties preview finds same-resource cases", sod.body);
  check((await a.post(`${P}/context/rules`, { payload: { name: "bad", params: { type: "ordering" } } })).status === 400, "invalid rule rejected");

  // BPMN: safe parse, PM4Py conversion, task mapping with conflict detection.
  const xxe = await a.post(`${P}/context/bpmn`, { name: "Evil", fileName: "evil.bpmn", xml: '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><definitions>&x;</definitions>' });
  const evil = await waitFor("xxe bpmn", async () => (await a.get(`${P}/context/bpmn`)).body.models.find((m: any) => m.id === xxe.body.id && m.validationStatus !== "pending"));
  check(evil.validationStatus === "invalid" && !evil.readable && /XXE/.test(evil.validationError), "BPMN with external entity rejected", evil);
  const up = await a.post(`${P}/context/bpmn`, { name: "P2P standar", fileName: "p2p.bpmn", xml: BPMN });
  check(up.status === 202, "BPMN upload accepted");
  const model = await waitFor("bpmn validation", async () => (await a.get(`${P}/context/bpmn`)).body.models.find((m: any) => m.id === up.body.id && m.validationStatus !== "pending"));
  check(model.validationStatus === "valid" && model.tasks.length === 4, "BPMN validated by PM4Py", model);
  const map = await a.call("PUT", `${P}/context/bpmn/${up.body.id}/mapping`, { mapping: { t1: ["Create PO"], t2: ["Approve PO", "Request Change"], t3: ["Receive Goods"], t4: ["Pay Invoice", "Approve PO"] } });
  check(map.status === 200 && map.body.conflicts.includes("Approve PO"), "mapping conflict flagged", map.body);
  const map2 = await a.call("PUT", `${P}/context/bpmn/${up.body.id}/mapping`, { mapping: { t1: ["Create PO"], t2: ["Approve PO"], t3: ["Receive Goods"], t4: ["Pay Invoice"] } });
  check(map2.body.version === 2 && map2.body.unmappedActivities.includes("Request Change"), "mapping versioned with unmapped activities", map2.body);
  check((await a.post(`${P}/context/bpmn/${up.body.id}/approve`)).status === 200, "BPMN approved");
  const xml = await a.call("GET", `${P}/context/bpmn/${up.body.id}`);
  check(xml.headers.get("content-type")?.startsWith("text/plain") && String(xml.body).includes("definitions"), "BPMN XML served as text");

  // Catalog: rubric weights must sum to 1; import from the user's own JSON.
  const badRubric = await a.post(`${P}/catalog/rubrics`, { key: "r", payload: { name: "R", criteria: [{ key: "a", name: "A", weight: 0.4, scale: [{ value: 0, label: "x", definition: "" }, { value: 1, label: "y", definition: "" }] }] } });
  check(badRubric.status === 400, "rubric weights must sum to 1");
  const imp = await a.post(`${P}/catalog/import`, {
    hypotheses: [{ key: "approver-capacity", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"], activities: ["Approve PO"], symptoms: ["Antrian approval"], requiredEvidence: ["Wait P90"] } }],
    interventions: [{ key: "delegation", payload: { action: "Delegasi approval di bawah ambang nilai", addressedHypotheses: ["approver-capacity"], findingTypes: ["bottleneck_indication"], effort: 2, risk: 2, ownerRole: "Manajer pengadaan", successMetric: "P90 tunggu turun" } }],
    rubrics: [{ key: "relevance", payload: { name: "Relevansi", criteria: [
      { key: "symptom", name: "Menjawab gejala", weight: 0.6, scale: [{ value: 0, label: "Tidak", definition: "" }, { value: 4, label: "Ya", definition: "" }] },
      { key: "evidence", name: "Didukung bukti", weight: 0.4, scale: [{ value: 0, label: "Tidak", definition: "" }, { value: 4, label: "Ya", definition: "" }] }] } }],
  });
  check(imp.status === 201 && imp.body.imported === 3, "catalog imported", imp.body);
  for (const t of ["hypotheses", "interventions", "rubrics"]) {
    const items = (await a.get(`${P}/catalog/${t}`)).body.items;
    check(items.length === 1 && items[0].status === "draft", `${t} imported as draft`);
    await a.patch(`${P}/catalog/${t}`, { id: items[0].id, to: "approved" });
  }

  // Package: deterministic hash; same content does not create a new version.
  const pkg = await a.post(`${P}/context/packages`);
  check(pkg.status === 201, "package frozen and activated", pkg.body);
  const again = await a.post(`${P}/context/packages`);
  check(again.status === 200 && again.body.hash === pkg.body.hash && again.body.id === pkg.body.id, "same content keeps the same package and hash");
  const list = (await a.get(`${P}/context/packages`)).body.packages;
  check(list[0].conformanceAvailable === true && list[0].refs.some((r: any) => r.type === "bpmn_mapping" && r.version === 2), "package records BPMN mapping version and conformance", list[0]);
  const ready = await a.get(`${P}/readiness`);
  check(ready.body.state === "ready_to_analyze" && ready.body.conformanceUnavailable === false, "readiness moves to ready_to_analyze", ready.body.state);

  const r3 = await a.post(`${P}/context/rules`, { key: "no-cancel", payload: { name: "Tanpa Request Change", params: { type: "forbidden_activity", activity: "Request Change" } }, sourceReference: "Kebijakan internal" });
  await a.patch(`${P}/context/rules`, { id: r3.body.id, to: "approved" });
  const pkg2 = await a.post(`${P}/context/packages`);
  check(pkg2.status === 201 && pkg2.body.hash !== pkg.body.hash, "changed context creates a new package version");
  check((await s.db.query("SELECT status FROM context_packages WHERE id = $1", [pkg.body.id])).rows[0].status === "superseded", "previous package superseded, not modified");

  const owner = await addAnalyst(s, admin, projectId, "owner@example.test");
  await admin.post(`${P}/members`, { email: "owner@example.test", role: "process_owner" });
  check((await owner.post(`${P}/context/rules`, { payload: { name: "x", params: { type: "required_activity", activity: "x" } } })).status === 403, "process owner cannot edit context");
  const actions = (await admin.get(`${P}/audit`)).body.events.map((e: any) => e.action);
  check(actions.includes("context.package.activate") && actions.includes("context.rule.approved"), "approval and activation audited");
}, { workers: true });
