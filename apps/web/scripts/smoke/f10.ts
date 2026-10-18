import { defaultPromptTemplate } from "@nora/contracts";
import { activateContext, addAnalyst, approveCatalog, bootstrapProject, check, must, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, rejects, run, waitFor, waitRun, type Client } from "./harness.ts";

const SCALE = [{ value: 0, label: "Tidak", definition: "" }, { value: 2, label: "Sebagian", definition: "" }, { value: 4, label: "Ya", definition: "" }];
const DONE = ["passed", "failed_check", "failed", "accepted", "flagged"];

/** Waits until a queued interpretation has finished generating and checking. */
async function settle(a: Client, projectId: string, queued: Promise<{ id: string }>) {
  const { id } = await queued;
  return waitFor("interpretation", async () => {
    const d = (await a.call((t) => t.interpretations.get.query({ projectId, interpretationId: id }))).body;
    return DONE.includes(d.status) ? d : null;
  }, 120_000);
}
const interpret = (a: Client, projectId: string, request: object) =>
  settle(a, projectId, a.call((t) => t.interpretations.request.mutate({ projectId, request })).then((r) => must(r, "interpretation")));

await run("f10", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  await publishCsv(a, projectId, p2pCsv(80), P2P_CONFIG);
  await a.call((t) => t.context.importCatalog.mutate({ projectId, catalog: {
    hypotheses: [{ key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"] } }],
    interventions: [
      { key: "delegation", payload: { action: "Delegasi approval bernilai kecil", addressedHypotheses: ["approver"], findingTypes: ["bottleneck_indication"], activities: ["Approve PO", "Receive Goods", "Pay Invoice", "Create PO"], effort: 2, risk: 2, ownerRole: "Manajer pengadaan", successMetric: "P90 tunggu turun", prerequisites: ["Matriks wewenang"] } },
      { key: "generic", payload: { action: "Pantau antrian mingguan", findingTypes: ["bottleneck_indication"] } },
    ],
    rubrics: [{ key: "relevansi", payload: { name: "Relevansi", criteria: [{ key: "gejala", name: "Menjawab gejala", weight: 0.6, scale: SCALE }, { key: "bukti", name: "Didukung bukti", weight: 0.4, scale: SCALE }] } }],
  } }));
  await approveCatalog(a, projectId);
  await activateContext(a, projectId);
  const r = await a.call((t) => t.analyses.request.mutate({ projectId }));
  await waitRun(a, projectId, r.body.id);
  const findingId = (await a.call((t) => t.findings.list.query({ projectId }))).body.findings.find((f) => f.type === "bottleneck_indication")!.id;
  const finding = (await a.call((t) => t.findings.get.query({ projectId, findingId }))).body;
  await waitFor("graph", async () => (await admin.call((t) => t.graph.status.query({ projectId }))).body.pending === 0 || null);

  const owner = await addAnalyst(s, admin, projectId, "po10@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "po10@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.interpretations.request.mutate({ projectId, request: { targetType: "finding", targetId: findingId } }))).status === 403, "process owner cannot request an interpretation");
  check((await a.call((t) => t.interpretations.request.mutate({ projectId, request: { targetType: "finding", targetId: "00000000-0000-4000-8000-000000000000" } }))).status === 404, "unknown target is rejected");

  // Fixture fault: attempt 1 types a raw number, the checker rejects it, attempt 2 passes after repair.
  const d1 = await interpret(a, projectId, { targetType: "finding", targetId: findingId, audience: "analyst" });
  check(d1.status === "passed" && d1.attempts.length === 2, "draft passes after one repair attempt", { status: d1.status, attempts: d1.attempts?.length, report: d1.checkReport });
  check(!d1.attempts[0]!.ok && d1.attempts[0]!.violations.some((v) => v.check === "numeric_literal"), "raw number rejected by the numeric check", d1.attempts[0]?.violations);
  check(d1.modelGenerated === true && d1.provider === "fixture" && d1.templateVersion === 1 && d1.checkerVersion === "checker-v1", "draft labelled model-generated with template/checker versions");
  const claims = d1.sections.flatMap((x) => x.claims);
  check(claims.length > 0 && claims.every((c) => c.citations.length >= 1 && c.citations.every((x) => x.itemType && x.itemId)), "every claim cites an included evidence item");
  const facts = d1.sections.find((x) => x.key === "measured_facts")!.claims;
  check(facts.length > 0 && facts.every((c) => c.metrics.length && !c.text.includes("{{")), "measured facts use rendered placeholders", facts.map((c) => c.text));
  check(facts.every((c) => c.metrics.every((m) => finding.metrics[m.metric] === m.value)), "rendered values come from the exact finding metric", facts.map((c) => c.metrics));
  check(["summary", "measured_facts", "evidence_basis", "interpretation", "open_hypotheses", "follow_up"].every((k) => d1.sections.some((x) => x.key === k)) && d1.uncertainties.length && d1.assumptions.length && d1.followUpQuestions.length, "all required sections present");
  if (finding.population.smallSample) check(d1.uncertainties.some((u) => u.includes("sampel kecil")), "small sample caveat in uncertainty");
  const raw = (await s.db.interpretationAttempt.findMany({ where: { interpretationId: d1.id }, orderBy: { attempt: "asc" }, select: { rawKey: true } })).map((x) => x.rawKey);
  check(raw.length === 2 && raw[0]!.endsWith(`/model-output/llm/${d1.id}/1.json`), "raw prompt/response stored per attempt", raw);
  const usage = await s.db.modelUsageEvent.count({ where: { subjectId: d1.id, kind: "llm" } });
  check(usage === 2 && d1.inputTokens! > 0, "token usage recorded per attempt", { usage, tokens: d1.inputTokens });
  check((await s.db.checkReport.count({ where: { interpretationId: d1.id } })) === 2, "check report stored for every attempt");

  const d2 = await interpret(a, projectId, { targetType: "finding", targetId: findingId, audience: "analyst" });
  check(d2.id !== d1.id && d2.reusedFrom === d1.id && d2.attempts.length === 0 && d2.status === "passed", "same interpretation key reuses the passed result", { reused: d2.reusedFrom, attempts: d2.attempts?.length });
  const d3 = await settle(a, projectId, a.call((t) => t.interpretations.regenerate.mutate({ projectId, interpretationId: d1.id })).then((x) => must(x, "regenerate")));
  check(d3.id !== d1.id && !d3.reusedFrom && d3.attempts.length === 2 && d3.status === "passed", "regenerate makes a new run instead of reusing");

  const accept = (c: Client, interpretationId: string, note?: string) => c.call((t) => t.interpretations.accept.mutate({ projectId, interpretationId, note }));
  const acc = await accept(a, d1.id, "Sesuai bukti");
  const d1a = (await a.call((t) => t.interpretations.get.query({ projectId, interpretationId: d1.id }))).body;
  check(acc.status === 200 && d1a.status === "accepted" && d1a.modelGenerated === false && d1a.versions.map((v) => v.kind).join() === "model_draft,accepted_summary", "accept writes a new version", d1a.versions);
  check(JSON.stringify(d1a.sections) === JSON.stringify(d1.sections) && d1a.checkReport?.ok, "original draft and check report kept after accept");
  check((await accept(a, d1.id)).status === 409, "accept is not repeated");
  check((await accept(owner, d3.id)).status === 403, "process owner cannot accept");
  check((await a.call((t) => t.interpretations.flag.mutate({ projectId, interpretationId: d3.id, reason: "Ringkasan terlalu umum" }))).body.status === "flagged", "flag issue");
  check(await rejects(s.db.interpretation.update({ where: { id: d1.id }, data: { output: {} } })), "checked draft is immutable");
  const other = await otherProjectUser(s);
  check((await other.call((t) => t.interpretations.get.query({ projectId, interpretationId: d1.id }))).status === 404, "other project cannot read the interpretation");
  check((await owner.call((t) => t.interpretations.list.query({ projectId, targetId: findingId }))).body.interpretations.length === 3, "process owner can read the history");

  // Comparison of validated candidates: only validated ones may appear as recommendations.
  const rr = must(await a.call((t) => t.recommendations.refresh.mutate({ projectId, findingId })), "refresh");
  const rec = await waitFor("candidate set", async () => {
    const x = (await a.call((t) => t.recommendations.forFinding.query({ projectId, findingId }))).body;
    return x.set && x.set.id === rr.id && ["completed", "failed"].includes(x.set.status) ? x : null;
  }, 180_000);
  const by = Object.fromEntries(rec.candidates.map((c) => [c.candidateKey, c]));
  const cmp = must(await a.call((t) => t.recommendations.compare.mutate({ projectId, findingId, ids: [by.delegation!.id, by.generic!.id] })), "compare");
  const dc = await interpret(a, projectId, { targetType: "candidate_comparison", targetId: cmp.id, audience: "process_owner" });
  const recs = dc.sections.find((x) => x.key === "validated_recommendations");
  const validatedIds = rec.candidates.filter((c) => c.status === "validated").map((c) => c.id);
  check(dc.status === "passed" && recs && recs.claims.length === validatedIds.filter((id) => [by.delegation!.id, by.generic!.id].includes(id)).length, "comparison interpretation lists validated candidates", { status: dc.status, recs: recs?.claims?.length, validatedIds });
  check(recs?.claims.every((c) => validatedIds.includes(c.candidateId ?? "") && c.type === "validated_recommendation"), "recommendation claims reference validated candidates only");
  check(dc.sections.flatMap((x) => x.claims).flatMap((c) => c.metrics).every((m) => typeof m.value === "number"), "comparison metrics rendered from the snapshot");

  const asm = (await a.call((t) => t.findings.assessments.query({ projectId, findingId }))).body.assessments.find((x) => x.status !== "failed")!;
  const da = await interpret(a, projectId, { targetType: "assessment", targetId: asm.id });
  check(da.status === "passed" && da.sections.find((x) => x.key === "measured_facts")!.claims.length > 0, "assessment summary interpretation passes");

  // A template whose fixture directive keeps every draft invalid ends in failed_check after three attempts.
  const tpl = await a.call((t) => t.interpretations.createTemplate.mutate({ projectId, template: { targetType: "finding", audience: "process_owner", body: { ...defaultPromptTemplate("finding", "process_owner"), example: "fixture:invalid" } } }));
  check(tpl.status === 200 && tpl.body.version === 2, "prompt template saved as a new version", tpl.body);
  const tpls = (await a.call((t) => t.interpretations.templates.query({ projectId }))).body;
  check(tpls.active.length === 6 && tpls.active.find((t) => t.targetType === "finding" && t.audience === "process_owner")!.version === 2, "active templates per target and audience");
  const df = await interpret(a, projectId, { targetType: "finding", targetId: findingId, audience: "process_owner" });
  check(df.status === "failed_check" && df.attempts.length === 3 && df.sections.length === 0 && (df.checkReport?.violations.length ?? 0) > 0, "failing draft ends as failed_check with violations only", { status: df.status, attempts: df.attempts?.length });
  check((await accept(a, df.id)).status === 409, "failed draft cannot be accepted");

  // Unconfigured provider: no key, no model call, no local draft.
  const saved = { mode: process.env.LLM_MODE, key: process.env.ANTHROPIC_API_KEY };
  delete process.env.LLM_MODE;
  delete process.env.ANTHROPIC_API_KEY;
  const { llmAdapter } = await import("../../../worker/src/adapters/llm.ts");
  let notConfigured = "";
  try { llmAdapter(); } catch (err) { notConfigured = (err as { type?: string }).type ?? ""; }
  check(notConfigured === "LlmNotConfigured", "unconfigured provider fails instead of drafting locally", notConfigured);
  Object.assign(process.env, { ...(saved.mode ? { LLM_MODE: saved.mode } : {}), ...(saved.key ? { ANTHROPIC_API_KEY: saved.key } : {}) });

  const actions = (await admin.call((t) => t.projects.audit.query({ projectId }))).body.events.map((e) => e.action);
  check(["interpretation.request", "interpretation.generate", "interpretation.regenerate", "interpretation.accept", "interpretation.flag", "interpretation.template"].every((x) => actions.includes(x)), "interpretation actions audited");
  const page = await a.page(`/lite/projects/${projectId}/findings/${findingId}`);
  check(page.status === 200 && page.body.includes("Interpretasi temuan"), "finding page renders the interpretation panel");
  const cpage = await a.page(`/lite/projects/${projectId}/recommendations/${findingId}/compare?ids=${by.delegation!.id},${by.generic!.id}`);
  check(cpage.status === 200 && cpage.body.includes("Interpretasi perbandingan"), "compare page renders the interpretation panel");
}, { workers: true, env: { JEV_MODE: "fixture", LLM_MODE: "fixture", LLM_FIXTURE_FAULT: "first_attempt", GRAPH_SWEEP_INTERVAL: "2s" } });
