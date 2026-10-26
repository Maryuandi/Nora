import { DEFAULT_PRIORITY_WEIGHTS, priorityScore } from "@nora/contracts";
import { activateContext, addAnalyst, approveCatalog, bootstrapProject, check, must, P2P_CONFIG, p2pCsv, publishCsv, rejects, run, waitFor, waitRun, type Client } from "./harness.ts";

const SCALE = [{ value: 0, label: "Tidak", definition: "" }, { value: 2, label: "Sebagian", definition: "" }, { value: 4, label: "Ya", definition: "" }];

async function refreshAndWait(a: Client, projectId: string, findingId: string) {
  const r = must(await a.call((t) => t.recommendations.refresh.mutate({ projectId, findingId })), "refresh");
  return waitFor("candidate set", async () => {
    const x = (await a.call((t) => t.recommendations.forFinding.query({ projectId, findingId }))).body;
    return x.set && x.set.id === r.id && ["completed", "failed"].includes(x.set.status) ? x : null;
  }, 180_000);
}

await run("f09", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  await publishCsv(a, projectId, p2pCsv(80), P2P_CONFIG);
  await a.call((t) => t.context.importCatalog.mutate({ projectId, catalog: {
    hypotheses: [{ key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"] } }],
    interventions: [
      { key: "delegation", payload: { action: "Delegasi approval bernilai kecil", addressedHypotheses: ["approver"], findingTypes: ["bottleneck_indication"], activities: ["Approve PO", "Receive Goods", "Pay Invoice", "Create PO"], effort: 2, risk: 2, ownerRole: "Manajer pengadaan", successMetric: "P90 tunggu turun", prerequisites: ["Matriks wewenang"] } },
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
  const findingId = (await a.call((t) => t.findings.list.query({ projectId }))).body.findings.find((f) => f.type === "bottleneck_indication")!.id;
  await waitFor("graph", async () => (await admin.call((t) => t.graph.status.query({ projectId }))).body.pending === 0 || null);

  const owner = await addAnalyst(s, admin, projectId, "po9@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "po9@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.recommendations.refresh.mutate({ projectId, findingId }))).status === 403, "process owner cannot refresh");

  const rec = await refreshAndWait(a, projectId, findingId);
  check(rec.set?.status === "completed", "candidate set validated", rec.set);
  const by = Object.fromEntries(rec.candidates.map((c) => [c.candidateKey, c]));
  check(by.delegation?.status === "validated" && by.delegation.checks.length === 7 && by.delegation.checks.every((c) => c.status === "pass"), "catalog candidate validated with all seven checks", by.delegation?.checks);
  check(by.generic?.status === "needs_review", "candidate without owner / uncertain Jev needs review", by.generic?.checks);
  check(by.impossible?.status === "not_eligible" && by.impossible.score == null && by.impossible.rank == null, "ineligible candidate has no active ranking");
  check(by["needs-start"]?.status === "insufficient_information", "missing capability gives insufficient information");
  const d = by.delegation!;
  const expected = priorityScore(Object.fromEntries(Object.entries(d.components ?? {}).map(([k, v]) => [k, v.value])) as never, DEFAULT_PRIORITY_WEIGHTS);
  check(d.partial === false && Math.abs(d.score! - expected.score!) < 1e-9 && d.rank! >= 1, "priority follows the documented formula", { score: d.score, expected: expected.score, comps: d.components });
  check(by.generic!.partial === true && by.generic!.missing?.includes("effort") && by.generic!.missing?.includes("risk"), "missing effort/risk give a partial score");
  check(Object.values(d.components ?? {}).every((c) => c.source), "each score component cites its source");
  const filtered = (await a.call((t) => t.recommendations.forFinding.query({ projectId, findingId, statuses: "validated,needs_review" }))).body.candidates;
  check(filtered.length === 2, "default filter: validated and needs_review", filtered.map((c) => c.candidateKey));

  const rec2 = await refreshAndWait(a, projectId, findingId);
  const by2 = Object.fromEntries(rec2.candidates.map((c) => [c.candidateKey, c]));
  check(by2.delegation!.validationId !== d.validationId && by2.delegation!.score === d.score && by2.delegation!.status === d.status, "re-validation is a new record with the same deterministic result");

  const pol = (await a.call((t) => t.recommendations.policy.query({ projectId }))).body;
  check(pol.version === 0, "default policy");
  const savePolicy = (weights: unknown) => a.call((t) => t.recommendations.savePolicy.mutate({ projectId, weights }));
  check((await savePolicy({ ...DEFAULT_PRIORITY_WEIGHTS, effort: 0.5 })).status === 400, "invalid weights rejected");
  check((await savePolicy({ ...DEFAULT_PRIORITY_WEIGHTS, relevance: 0.6 })).body.version === 1, "policy saved as a new version");
  const rec3 = await refreshAndWait(a, projectId, findingId);
  const d3 = rec3.candidates.find((c) => c.candidateKey === "delegation")!;
  check(d3.policyVersion === 1 && d3.score !== d.score, "new policy gives a new score version");
  const oldScore = (await s.db.candidateScore.findFirstOrThrow({ where: { validationId: d.validationId! } })).score;
  check(oldScore === d.score, "historical score unchanged");

  const addCandidate = (candidate: unknown) => a.call((t) => t.recommendations.addCandidate.mutate({ projectId, candidate }));
  check((await addCandidate({ findingId, description: "x" })).status === 400, "analyst candidate needs problem, metric and source");
  const ac = await addCandidate({ findingId, description: "Approval paralel untuk PO kecil", addressedProblem: "Tunggu approval", successMetric: "Median tunggu turun", sourceReason: "Wawancara tim pengadaan", ownerRole: "Kepala pengadaan", effort: 3, risk: 2 });
  check(ac.status === 200, "analyst candidate added");
  const rec4 = await refreshAndWait(a, projectId, findingId);
  const analyst = rec4.candidates.find((c) => c.candidateType === "analyst");
  check(analyst && analyst.origin.startsWith("analis:") && analyst.status && analyst.checks.length === 7, "analyst candidate assessed and validated with origin", analyst?.status);

  const compare = (ids: string[]) => a.call((t) => t.recommendations.compare.mutate({ projectId, findingId, ids }));
  check((await compare([d.id])).status === 400, "compare needs 2–4 candidates");
  const ids = [d.id, by.generic!.id];
  const cmp = (await compare(ids)).body;
  check(cmp.id && cmp.candidates.length === 2 && Object.keys(cmp.candidates[0]!.rows).length === 12, "comparison with all rows", Object.keys(cmp.candidates?.[0]?.rows ?? {}));
  check(cmp.candidates[0]!.rows.relevance.source?.startsWith("assessment:") && cmp.candidates[0]!.evidenceBundleId, "rows open their source and bundle");
  const cmp2 = (await compare(ids)).body;
  check(cmp2.id === cmp.id, "same selection returns the same snapshot");
  check(await rejects(s.db.candidateComparison.update({ where: { id: cmp.id }, data: { payload: {} } })), "comparison snapshot is immutable");

  // A newer published dataset marks earlier validations stale without changing them.
  await publishCsv(a, projectId, p2pCsv(90), P2P_CONFIG, "ERP baru");
  const stale = (await a.call((t) => t.recommendations.forFinding.query({ projectId, findingId }))).body.candidates.find((c) => c.candidateKey === "delegation")!;
  check(stale.stale === true && stale.status === d3.status, "data update marks validation stale", stale.stale);
  const actions = (await admin.call((t) => t.projects.audit.query({ projectId }))).body.events.map((e) => e.action);
  check(["recommendation.refresh", "recommendation.validate", "recommendation.policy", "recommendation.candidate.add", "recommendation.compare"].every((x) => actions.includes(x)), "recommendation actions audited");
  const page = await a.page(`/projects/${projectId}/recommendations/${findingId}/compare?ids=${ids.join(",")}`);
  check(page.status === 200 && page.body.includes("Perbandingan kandidat"), "compare page renders");
}, { workers: true, env: { JEV_MODE: "fixture", GRAPH_SWEEP_INTERVAL: "2s" } });
