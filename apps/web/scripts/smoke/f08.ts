import { activateContext, addAnalyst, approveCatalog, bootstrapProject, check, P2P_CONFIG, p2pCsv, publishCsv, rejects, run, waitFor, waitRun, type Client } from "./harness.ts";

const SCALE = [{ value: 0, label: "Tidak", definition: "" }, { value: 2, label: "Sebagian", definition: "" }, { value: 4, label: "Ya", definition: "" }];

async function waitAssessments(a: Client, projectId: string, findingId: string) {
  return waitFor("assessment run", async () => {
    const r = (await a.call((t) => t.findings.assessments.query({ projectId, findingId }))).body;
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
  await publishCsv(a, projectId, p2pCsv(80), P2P_CONFIG);
  await a.call((t) => t.context.importCatalog.mutate({ projectId, catalog: {
    hypotheses: [{ key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"], activities: ["Approve PO"] } }],
    interventions: [
      { key: "delegation", payload: { action: "Delegasi approval bernilai kecil", addressedHypotheses: ["approver"], findingTypes: ["bottleneck_indication"], activities: ["Approve PO", "Receive Goods", "Pay Invoice", "Create PO"], effort: 2, risk: 2 } },
      { key: "generic", payload: { action: "Pantau antrian mingguan", findingTypes: ["bottleneck_indication"] } },
      { key: "impossible", payload: { action: "Otomasi penuh", findingTypes: ["bottleneck_indication"], conditions: [{ ref: "metric", key: "caseCount", op: ">", value: 100000 }] } },
      { key: "needs-start", payload: { action: "Ukur service time", findingTypes: ["bottleneck_indication"], requiredCapabilities: ["serviceTime"] } },
    ],
    rubrics: [{ key: "relevansi", payload: { name: "Relevansi", criteria: [{ key: "gejala", name: "Menjawab gejala", weight: 0.6, scale: SCALE }, { key: "bukti", name: "Didukung bukti", weight: 0.4, scale: SCALE }] } }],
  } }));
  await approveCatalog(a, projectId);
  await activateContext(a, projectId);
  const r = await a.call((t) => t.analyses.request.mutate({ projectId }));
  await waitRun(a, projectId, r.body.id);
  const fb = (await a.call((t) => t.findings.list.query({ projectId }))).body.findings.find((f) => f.type === "bottleneck_indication")!;
  const findingId = fb.id;

  const owner = await addAnalyst(s, admin, projectId, "po8@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "po8@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.assessments.requestRun.mutate({ projectId, findingId }))).status === 403, "process owner cannot run assessments");
  const run1 = await a.call((t) => t.assessments.requestRun.mutate({ projectId, findingId }));
  check(run1.status === 200 && !run1.body.reused, "assessment run queued", run1.body);
  const res = await waitAssessments(a, projectId, findingId);
  check(res.run?.status === "completed", "assessment run completed", res.run);
  const byKey = Object.fromEntries(res.assessments.map((x) => [x.candidateKey, x]));
  check(Object.keys(byKey).sort().join() === "delegation,generic", "only eligible catalog candidates are assessed", Object.keys(byKey));
  const blocked = Object.fromEntries(res.blocked.map((b) => [b.candidateKey, b.preconditionStatus]));
  check(blocked.impossible === "not_eligible" && blocked["needs-start"] === "insufficient_information", "failed and unevaluable preconditions are not sent to Jev", blocked);
  const d = byKey.delegation!;
  check(d.status === "automatic" && d.conclusion === "relevant" && d.totalScore === 1 && d.criteria.length === 2, "relevant candidate scored by code aggregation", d);
  check(d.evidenceBundleId && d.questionSpecs.length === 3 && d.rubricVersion === 1 && d.adapter === "fixture", "result records bundle, specs, rubric and adapter");
  const g = byKey.generic!;
  check(g.status === "needs_review", "uncertain result needs review", g);
  check(g.effective.source === "model", "unreviewed value is labelled as model output");

  const assessment = async (assessmentId: string) => (await a.call((t) => t.assessments.get.query({ projectId, assessmentId }))).body;
  const detail = await assessment(d.id);
  check(detail.usage.length === 4 && detail.usage.every((u) => u.rawKey?.startsWith(`projects/${projectId}/model-output/jev/`)), "every provider call stored with raw output under the project", detail.usage.length);
  const calls = await s.db.modelUsageEvent.count({ where: { projectId } });

  // Same bundle/spec/model/candidate → no new provider call.
  await a.call((t) => t.assessments.requestRun.mutate({ projectId, findingId }));
  await waitAssessments(a, projectId, findingId);
  await waitFor("second run", async () => (await s.db.assessmentRun.count({ where: { findingId, status: "completed" } })) === 2 || null);
  const calls2 = await s.db.modelUsageEvent.count({ where: { projectId } });
  check(calls2 === calls, "same idempotency key adds no provider calls", { calls, calls2 });

  // Review: reason required, original preserved, effective value from the correction.
  const correct = (c: Client, input: { kind: "confirm" | "correct"; conclusion?: string; reason: string; goldCandidate?: boolean }) =>
    c.call((t) => t.assessments.correct.mutate({ projectId, assessmentId: g.id, ...input }));
  check((await correct(owner, { kind: "confirm", reason: "x" })).status === 403, "process owner cannot correct");
  check((await correct(a, { kind: "correct", conclusion: "relevant", reason: "" })).status === 400, "correction needs a reason");
  check((await correct(a, { kind: "correct", conclusion: "not_relevant", reason: "Pemantauan tidak mengurangi tunggu", goldCandidate: true })).status === 200, "correction saved");
  const after = await assessment(g.id);
  check(after.conclusion === "partly_relevant" && after.effective.conclusion === "not_relevant" && after.effective.source === "correction", "original model result kept, effective value from correction", after.effective);
  check(await rejects(s.db.assessment.update({ where: { id: g.id }, data: { conclusion: "relevant" } })), "final model output cannot be overwritten");
  const gold = (await a.call((t) => t.assessments.goldSet.query({ projectId }))).body;
  check(gold.items.length === 1 && gold.items[0]!.label === "not_relevant", "correction marked as gold-set candidate");
  const ev = await a.call((t) => t.assessments.evaluateGoldSet.mutate({ projectId }));
  check(ev.status === 200 && ev.body.metrics.accuracy === 0, "evaluation computes accuracy against gold labels", ev.body);

  const spec = await a.call((t) => t.assessments.createSpec.mutate({ projectId, spec: { task: "candidate_relevance", primitive: "choice", question: "Pertanyaan baru", options: [], topThreshold: 0.7, marginThreshold: 0.2, contextTemplate: "x" } }));
  check(spec.status === 200 && spec.body.version === 2, "new spec version created");
  check((await assessment(d.id)).specSuperseded === true, "historical result shows superseded spec");
  const actions = (await admin.call((t) => t.projects.audit.query({ projectId }))).body.events.map((e) => e.action);
  check(["assessment.request", "assessment.run", "assessment.correct", "assessment.spec"].every((x) => actions.includes(x)), "assessment actions audited");
  const page = await a.page(`/lite/projects/${projectId}/findings/${findingId}`);
  check(page.status === 200, "finding page renders with assessment panel");
}, { workers: true, env: { JEV_MODE: "fixture" } });
