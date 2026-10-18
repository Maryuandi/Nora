import { addAnalyst, bootstrapProject, CATALOG_KIND, check, P2P_CONFIG, p2pCsv, publishCsv, rejects, run, waitFor } from "./harness.ts";

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
  await publishCsv(a, projectId, p2pCsv(40), P2P_CONFIG);
  const approve = (kind: "process_boundary" | "rework_definition" | "rule", id: string) => a.call((t) => t.context.transition.mutate({ projectId, kind, id, to: "approved" }));

  // Boundary and rework: draft → Ready; labels absent from the dataset are allowed.
  const b = await a.call((t) => t.context.save.mutate({ projectId, kind: "process_boundary", payload: { startActivities: ["Create PO"], endActivities: ["Pay Invoice", "Future Activity"] } }));
  check(b.status === 200, "boundary saved with a label not in the dataset", b.body);
  check((await approve("process_boundary", b.body.id)).status === 200, "boundary approved");
  const b2 = await a.call((t) => t.context.save.mutate({ projectId, kind: "process_boundary", payload: { startActivities: ["Create PO"], endActivities: ["Pay Invoice"] } }));
  check(b2.body.version === 2, "editing an approved item creates a new version");
  check(await rejects(s.db.processBoundary.update({ where: { id: b.body.id }, data: { payload: {} } })), "approved item is immutable in the database");
  await approve("process_boundary", b2.body.id);
  check((await s.db.processBoundary.findUniqueOrThrow({ where: { id: b.body.id } })).status === "obsolete", "previous approved version becomes obsolete");
  const rw = await a.call((t) => t.context.save.mutate({ projectId, kind: "rework_definition", payload: { rules: [{ type: "repeated_activity", activity: "Approve PO", minOccurrences: 2 }, { type: "return_transition", from: "Request Change", to: "Approve PO" }] } }));
  await approve("rework_definition", rw.body.id);

  // Rules: a rule without a source cannot be approved; preview evaluates on the published dataset.
  const slaRule = { name: "Approve ≤ 24 jam", params: { type: "sla_duration", fromActivity: "Create PO", toActivity: "Approve PO", maxHours: 24 } };
  const r1 = await a.call((t) => t.context.save.mutate({ projectId, kind: "rule", key: "sla-approve", payload: slaRule }));
  check(r1.status === 200, "rule saved", r1.body);
  const noSrc = await approve("rule", r1.body.id);
  check(noSrc.status === 409 && noSrc.error?.appCode === "source_required", "rule without source cannot be approved", noSrc.error);
  const prev = await a.call((t) => t.context.previewRule.mutate({ projectId, ruleId: r1.body.id }));
  check(prev.status === 200 && prev.body.evaluatedCases === 40 && prev.body.nonCompliant > 0 && prev.body.compliant > 0, "rule preview evaluates cases", prev.body);
  const doc = await a.call((t) => t.context.createDocument.mutate({ projectId, title: "SOP Pengadaan", reference: "SOP-PRC-01", excerpt: "PO disetujui paling lambat 24 jam." }));
  const r2 = await a.call((t) => t.context.save.mutate({ projectId, kind: "rule", key: "sla-approve", payload: slaRule, sourceDocumentId: doc.body.id, sourceReference: "SOP-PRC-01 §3" }));
  check(r2.body.id === r1.body.id, "draft rule updated in place");
  check((await approve("rule", r1.body.id)).status === 200, "rule with source approved");
  const sod = await a.call((t) => t.context.previewRule.mutate({ projectId, ruleId: "draft", rule: { name: "SoD", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } } }));
  check(sod.status === 200 && sod.body.nonCompliant > 0, "separation-of-duties preview finds same-resource cases", sod.body);
  check((await a.call((t) => t.context.save.mutate({ projectId, kind: "rule", payload: { name: "bad", params: { type: "ordering" } } }))).status === 400, "invalid rule rejected");

  // BPMN: safe parse, PM4Py conversion, task mapping with conflict detection.
  const models = async () => (await a.call((t) => t.context.bpmnModels.query({ projectId }))).body.models;
  const xxe = await a.call((t) => t.context.uploadBpmn.mutate({ projectId, name: "Evil", fileName: "evil.bpmn", xml: '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><definitions>&x;</definitions>' }));
  const evil = await waitFor("xxe bpmn", async () => (await models()).find((m) => m.id === xxe.body.id && m.validationStatus !== "pending"));
  check(evil.validationStatus === "invalid" && !evil.readable && /XXE/.test(evil.validationError ?? ""), "BPMN with external entity rejected", evil);
  const up = await a.call((t) => t.context.uploadBpmn.mutate({ projectId, name: "P2P standar", fileName: "p2p.bpmn", xml: BPMN }));
  check(up.status === 200, "BPMN upload accepted");
  const model = await waitFor("bpmn validation", async () => (await models()).find((m) => m.id === up.body.id && m.validationStatus !== "pending"));
  check(model.validationStatus === "valid" && model.tasks.length === 4, "BPMN validated by PM4Py", model);
  const map = await a.call((t) => t.context.saveBpmnMapping.mutate({ projectId, modelId: up.body.id, mapping: { t1: ["Create PO"], t2: ["Approve PO", "Request Change"], t3: ["Receive Goods"], t4: ["Pay Invoice", "Approve PO"] } }));
  check(map.status === 200 && map.body.conflicts.includes("Approve PO"), "mapping conflict flagged", map.body);
  const map2 = await a.call((t) => t.context.saveBpmnMapping.mutate({ projectId, modelId: up.body.id, mapping: { t1: ["Create PO"], t2: ["Approve PO"], t3: ["Receive Goods"], t4: ["Pay Invoice"] } }));
  check(map2.body.version === 2 && map2.body.unmappedActivities.includes("Request Change"), "mapping versioned with unmapped activities", map2.body);
  check((await a.call((t) => t.context.approveBpmn.mutate({ projectId, modelId: up.body.id }))).status === 200, "BPMN approved");
  const xml = await a.call((t) => t.context.bpmnXml.query({ projectId, modelId: up.body.id }));
  check(typeof xml.body === "string" && xml.body.includes("definitions"), "BPMN XML served as text");

  // Catalog: rubric weights must sum to 1; import from the user's own JSON.
  const badRubric = await a.call((t) => t.context.save.mutate({ projectId, kind: "rubric", key: "r", payload: { name: "R", criteria: [{ key: "a", name: "A", weight: 0.4, scale: [{ value: 0, label: "x", definition: "" }, { value: 1, label: "y", definition: "" }] }] } }));
  check(badRubric.status === 400, "rubric weights must sum to 1");
  const imp = await a.call((t) => t.context.importCatalog.mutate({ projectId, catalog: {
    hypotheses: [{ key: "approver-capacity", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"], activities: ["Approve PO"], symptoms: ["Antrian approval"], requiredEvidence: ["Wait P90"] } }],
    interventions: [{ key: "delegation", payload: { action: "Delegasi approval di bawah ambang nilai", addressedHypotheses: ["approver-capacity"], findingTypes: ["bottleneck_indication"], effort: 2, risk: 2, ownerRole: "Manajer pengadaan", successMetric: "P90 tunggu turun" } }],
    rubrics: [{ key: "relevance", payload: { name: "Relevansi", criteria: [
      { key: "symptom", name: "Menjawab gejala", weight: 0.6, scale: [{ value: 0, label: "Tidak", definition: "" }, { value: 4, label: "Ya", definition: "" }] },
      { key: "evidence", name: "Didukung bukti", weight: 0.4, scale: [{ value: 0, label: "Tidak", definition: "" }, { value: 4, label: "Ya", definition: "" }] }] } }],
  } }));
  check(imp.status === 200 && imp.body.imported === 3, "catalog imported", imp.body);
  for (const [t, kind] of Object.entries(CATALOG_KIND)) {
    const items = (await a.call((x) => x.context.items.query({ projectId, kinds: [kind] }))).body.items;
    check(items.length === 1 && items[0]!.status === "draft", `${t} imported as draft`);
    await a.call((x) => x.context.transition.mutate({ projectId, kind, id: items[0]!.id, to: "approved" }));
  }

  // Package: deterministic hash; same content does not create a new version.
  const pkg = await a.call((t) => t.context.activatePackage.mutate({ projectId }));
  check(pkg.status === 200 && pkg.body.created, "package frozen and activated", pkg.body);
  const again = await a.call((t) => t.context.activatePackage.mutate({ projectId }));
  check(!again.body.created && again.body.hash === pkg.body.hash && again.body.id === pkg.body.id, "same content keeps the same package and hash");
  const list = (await a.call((t) => t.context.packages.query({ projectId }))).body.packages;
  check(list[0]!.conformanceAvailable === true && list[0]!.refs.some((r) => r.type === "bpmn_mapping" && r.version === 2), "package records BPMN mapping version and conformance", list[0]);
  const ready = await a.call((t) => t.projects.readiness.query({ projectId }));
  check(ready.body.state === "ready_to_analyze" && ready.body.conformanceUnavailable === false, "readiness moves to ready_to_analyze", ready.body.state);

  const r3 = await a.call((t) => t.context.save.mutate({ projectId, kind: "rule", key: "no-cancel", payload: { name: "Tanpa Request Change", params: { type: "forbidden_activity", activity: "Request Change" } }, sourceReference: "Kebijakan internal" }));
  await approve("rule", r3.body.id);
  const pkg2 = await a.call((t) => t.context.activatePackage.mutate({ projectId }));
  check(pkg2.body.created && pkg2.body.hash !== pkg.body.hash, "changed context creates a new package version");
  check((await s.db.contextPackage.findUniqueOrThrow({ where: { id: pkg.body.id } })).status === "superseded", "previous package superseded, not modified");

  const owner = await addAnalyst(s, admin, projectId, "owner@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "owner@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.context.save.mutate({ projectId, kind: "rule", payload: { name: "x", params: { type: "required_activity", activity: "x" } } }))).status === 403, "process owner cannot edit context");
  const actions = (await admin.call((t) => t.projects.audit.query({ projectId }))).body.events.map((e) => e.action);
  check(actions.includes("context.package.activate") && actions.includes("context.rule.approved"), "approval and activation audited");
}, { workers: true });
