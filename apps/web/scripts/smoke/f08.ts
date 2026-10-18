import { activateContext, addAnalyst, bootstrapProject, check, P2P_CONFIG, p2pCsv, publishCsv, run, waitFor, waitRun, type Client } from "./harness.ts";

const SCALE = [{ value: 0, label: "Tidak", definition: "" }, { value: 2, label: "Sebagian", definition: "" }, { value: 4, label: "Ya", definition: "" }];

async function waitAssessments(a: Client, P: string, findingId: string) {
  return waitFor("assessment run", async () => {
    const r = (await a.get(`${P}/findings/${findingId}/assessments`)).body;
    return r.run && !["queued", "running"].includes(r.run.status) ? r : null;
  }, 120_000);
}

await run("f08", async (s) => {
  // Without provider configuration the adapter refuses instead of falling back to anything else.
  delete process.env.JEV_MODE;
  const { decisionAdapter } = await import("../../../worker/src/adapters/decision.ts");
  let refused = "";
  try { decisionAdapter(); } catch (err) { refused = (err as { type?: string }).type ?? ""; }
  check(refused === "JevNotConfigured", "unconfigured Jev is refused, no LLM fallback", refused);

  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const P = `/api/lite/projects/${projectId}`;
  await publishCsv(a, projectId, p2pCsv(80), P2P_CONFIG);
  await a.post(`${P}/catalog/import`, {
    hypotheses: [{ key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"], activities: ["Approve PO"] } }],
    interventions: [
      { key: "delegation", payload: { action: "Delegasi approval bernilai kecil", addressedHypotheses: ["approver"], findingTypes: ["bottleneck_indication"], activities: ["Approve PO", "Receive Goods", "Pay Invoice", "Create PO"], effort: 2, risk: 2 } },
      { key: "generic", payload: { action: "Pantau antrian mingguan", findingTypes: ["bottleneck_indication"] } },
      { key: "impossible", payload: { action: "Otomasi penuh", findingTypes: ["bottleneck_indication"], conditions: [{ ref: "metric", key: "caseCount", op: ">", value: 100000 }] } },
      { key: "needs-start", payload: { action: "Ukur service time", findingTypes: ["bottleneck_indication"], requiredCapabilities: ["serviceTime"] } },
    ],
    rubrics: [{ key: "relevansi", payload: { name: "Relevansi", criteria: [{ key: "gejala", name: "Menjawab gejala", weight: 0.6, scale: SCALE }, { key: "bukti", name: "Didukung bukti", weight: 0.4, scale: SCALE }] } }],
  });
  for (const t of ["hypotheses", "interventions", "rubrics"]) for (const i of (await a.get(`${P}/catalog/${t}`)).body.items) await a.patch(`${P}/catalog/${t}`, { id: i.id, to: "approved" });
  await activateContext(a, projectId);
  const r = await a.post(`${P}/analyses`, {});
  await waitRun(a, projectId, r.body.id);
  const fb = (await a.get(`${P}/findings`)).body.findings.find((f: any) => f.type === "bottleneck_indication");

  const owner = await addAnalyst(s, admin, projectId, "po8@example.test");
  await admin.post(`${P}/members`, { email: "po8@example.test", role: "process_owner" });
  check((await owner.post(`${P}/assessment-runs`, { findingId: fb.id })).status === 403, "process owner cannot run assessments");
  const run1 = await a.post(`${P}/assessment-runs`, { findingId: fb.id });
  check(run1.status === 202, "assessment run queued", run1.body);
  const res = await waitAssessments(a, P, fb.id);
  check(res.run.status === "completed", "assessment run completed", res.run);
  const byKey = Object.fromEntries(res.assessments.map((x: any) => [x.candidateKey, x]));
  check(Object.keys(byKey).sort().join() === "delegation,generic", "only eligible catalog candidates are assessed", Object.keys(byKey));
  const blocked = Object.fromEntries(res.blocked.map((b: any) => [b.candidateKey, b.preconditionStatus]));
  check(blocked.impossible === "not_eligible" && blocked["needs-start"] === "insufficient_information", "failed and unevaluable preconditions are not sent to Jev", blocked);
  const d = byKey.delegation;
  check(d.status === "automatic" && d.conclusion === "relevant" && d.totalScore === 1 && d.criteria.length === 2, "relevant candidate scored by code aggregation", d);
  check(d.evidenceBundleId && d.questionSpecs.length === 3 && d.rubricVersion === 1 && d.adapter === "fixture", "result records bundle, specs, rubric and adapter");
  const g = byKey.generic;
  check(g.status === "needs_review", "uncertain result needs review", g);
  check(g.effective.source === "model", "unreviewed value is labelled as model output");

  const detail = (await a.get(`${P}/assessments/${d.id}`)).body;
  check(detail.usage.length === 4 && detail.usage.every((u: any) => u.rawKey?.startsWith(`projects/${projectId}/model-output/jev/`)), "every provider call stored with raw output under the project", detail.usage.length);
  const calls = (await s.db.query("SELECT count(*)::int n FROM model_usage_events WHERE project_id = $1", [projectId])).rows[0].n;

  // Same bundle/spec/model/candidate → no new provider call.
  await a.post(`${P}/assessment-runs`, { findingId: fb.id });
  await waitAssessments(a, P, fb.id);
  await waitFor("second run", async () => ((await s.db.query("SELECT count(*)::int n FROM assessment_runs WHERE finding_id = $1 AND status = 'completed'", [fb.id])).rows[0].n === 2) || null);
  const calls2 = (await s.db.query("SELECT count(*)::int n FROM model_usage_events WHERE project_id = $1", [projectId])).rows[0].n;
  check(calls2 === calls, "same idempotency key adds no provider calls", { calls, calls2 });

  // Review: reason required, original preserved, effective value from the correction.
  check((await owner.post(`${P}/assessments/${g.id}/corrections`, { kind: "confirm", reason: "x" })).status === 403, "process owner cannot correct");
  check((await a.post(`${P}/assessments/${g.id}/corrections`, { kind: "correct", conclusion: "relevant", reason: "" })).status === 400, "correction needs a reason");
  check((await a.post(`${P}/assessments/${g.id}/corrections`, { kind: "correct", conclusion: "not_relevant", reason: "Pemantauan tidak mengurangi tunggu", goldCandidate: true })).status === 201, "correction saved");
  const after = (await a.get(`${P}/assessments/${g.id}`)).body;
  check(after.conclusion === "partly_relevant" && after.effective.conclusion === "not_relevant" && after.effective.source === "correction", "original model result kept, effective value from correction", after.effective);
  let immutable = false;
  try { await s.db.query("UPDATE assessments SET conclusion = 'relevant' WHERE id = $1", [g.id]); } catch { immutable = true; }
  check(immutable, "final model output cannot be overwritten");
  const gold = (await a.get(`${P}/gold-sets`)).body;
  check(gold.items.length === 1 && gold.items[0].label === "not_relevant", "correction marked as gold-set candidate");
  const ev = await a.post(`${P}/gold-sets`, {});
  check(ev.status === 201 && ev.body.metrics.accuracy === 0, "evaluation computes accuracy against gold labels", ev.body);

  const spec = await a.post(`${P}/assessment-specs`, { task: "candidate_relevance", primitive: "choice", question: "Pertanyaan baru", options: [], topThreshold: 0.7, marginThreshold: 0.2, contextTemplate: "x" });
  check(spec.status === 201 && spec.body.version === 2, "new spec version created");
  check((await a.get(`${P}/assessments/${d.id}`)).body.specSuperseded === true, "historical result shows superseded spec");
  const actions = (await admin.get(`${P}/audit`)).body.events.map((e: any) => e.action);
  check(["assessment.request", "assessment.run", "assessment.correct", "assessment.spec"].every((x) => actions.includes(x)), "assessment actions audited");
  const page = await a.get(`/lite/projects/${projectId}/findings/${fb.id}`);
  check(page.status === 200, "finding page renders with assessment panel");
}, { workers: true, env: { JEV_MODE: "fixture" } });
