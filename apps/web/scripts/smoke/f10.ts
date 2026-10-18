import { defaultPromptTemplate } from "@nora/contracts";
import { activateContext, addAnalyst, bootstrapProject, check, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, run, waitFor, waitRun, type Client } from "./harness.ts";

const SCALE = [{ value: 0, label: "Tidak", definition: "" }, { value: 2, label: "Sebagian", definition: "" }, { value: 4, label: "Ya", definition: "" }];
const DONE = ["passed", "failed_check", "failed", "accepted", "flagged"];

async function interpret(a: Client, P: string, body: unknown, path = `${P}/interpretations`) {
  const r = await a.post(path, body);
  if (r.status !== 202) throw new Error(`interpretation ${r.status} ${JSON.stringify(r.body)}`);
  return waitFor("interpretation", async () => {
    const d = (await a.get(`${P}/interpretations/${r.body.id}`)).body;
    return DONE.includes(d.status) ? d : null;
  }, 120_000);
}

await run("f10", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const P = `/api/lite/projects/${projectId}`;
  await publishCsv(a, projectId, p2pCsv(80), P2P_CONFIG);
  await a.post(`${P}/catalog/import`, {
    hypotheses: [{ key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"] } }],
    interventions: [
      { key: "delegation", payload: { action: "Delegasi approval bernilai kecil", addressedHypotheses: ["approver"], findingTypes: ["bottleneck_indication"], activities: ["Approve PO", "Receive Goods", "Pay Invoice", "Create PO"], effort: 2, risk: 2, ownerRole: "Manajer pengadaan", successMetric: "P90 tunggu turun", prerequisites: ["Matriks wewenang"] } },
      { key: "generic", payload: { action: "Pantau antrian mingguan", findingTypes: ["bottleneck_indication"] } },
    ],
    rubrics: [{ key: "relevansi", payload: { name: "Relevansi", criteria: [{ key: "gejala", name: "Menjawab gejala", weight: 0.6, scale: SCALE }, { key: "bukti", name: "Didukung bukti", weight: 0.4, scale: SCALE }] } }],
  });
  for (const t of ["hypotheses", "interventions", "rubrics"]) for (const i of (await a.get(`${P}/catalog/${t}`)).body.items) await a.patch(`${P}/catalog/${t}`, { id: i.id, to: "approved" });
  await activateContext(a, projectId);
  const r = await a.post(`${P}/analyses`, {});
  await waitRun(a, projectId, r.body.id);
  const fb = (await a.get(`${P}/findings`)).body.findings.find((f: any) => f.type === "bottleneck_indication");
  const finding = (await a.get(`${P}/findings/${fb.id}`)).body;
  await waitFor("graph", async () => ((await admin.get(`${P}/graph/status`)).body.pending === 0) || null);

  const owner = await addAnalyst(s, admin, projectId, "po10@example.test");
  await admin.post(`${P}/members`, { email: "po10@example.test", role: "process_owner" });
  check((await owner.post(`${P}/interpretations`, { targetType: "finding", targetId: fb.id })).status === 403, "process owner cannot request an interpretation");
  check((await a.post(`${P}/interpretations`, { targetType: "finding", targetId: "00000000-0000-4000-8000-000000000000" })).status === 404, "unknown target is rejected");

  // Fixture fault: attempt 1 types a raw number, the checker rejects it, attempt 2 passes after repair.
  const d1 = await interpret(a, P, { targetType: "finding", targetId: fb.id, audience: "analyst" });
  check(d1.status === "passed" && d1.attempts.length === 2, "draft passes after one repair attempt", { status: d1.status, attempts: d1.attempts?.length, report: d1.checkReport });
  check(!d1.attempts[0].ok && d1.attempts[0].violations.some((v: any) => v.check === "numeric_literal"), "raw number rejected by the numeric check", d1.attempts[0]?.violations);
  check(d1.modelGenerated === true && d1.provider === "fixture" && d1.templateVersion === 1 && d1.checkerVersion === "checker-v1", "draft labelled model-generated with template/checker versions");
  const claims = d1.sections.flatMap((x: any) => x.claims);
  check(claims.length > 0 && claims.every((c: any) => c.citations.length >= 1 && c.citations.every((x: any) => x.itemType && x.itemId)), "every claim cites an included evidence item");
  const facts = d1.sections.find((x: any) => x.key === "measured_facts").claims;
  check(facts.length > 0 && facts.every((c: any) => c.metrics.length && !c.text.includes("{{")), "measured facts use rendered placeholders", facts.map((c: any) => c.text));
  check(facts.every((c: any) => c.metrics.every((m: any) => finding.metrics[m.metric] === m.value)), "rendered values come from the exact finding metric", facts.map((c: any) => c.metrics));
  check(["summary", "measured_facts", "evidence_basis", "interpretation", "open_hypotheses", "follow_up"].every((k) => d1.sections.some((x: any) => x.key === k)) && d1.uncertainties.length && d1.assumptions.length && d1.followUpQuestions.length, "all required sections present");
  if (finding.population.smallSample) check(d1.uncertainties.some((u: string) => u.includes("sampel kecil")), "small sample caveat in uncertainty");
  const raw = (await s.db.query("SELECT raw_key FROM interpretation_attempts WHERE interpretation_id = $1 ORDER BY attempt", [d1.id])).rows.map((x) => x.raw_key);
  check(raw.length === 2 && raw[0].endsWith(`/model-output/llm/${d1.id}/1.json`), "raw prompt/response stored per attempt", raw);
  const usage = (await s.db.query("SELECT count(*)::int AS n FROM model_usage_events WHERE subject_id = $1 AND kind = 'llm'", [d1.id])).rows[0].n;
  check(usage === 2 && d1.inputTokens > 0, "token usage recorded per attempt", { usage, tokens: d1.inputTokens });
  check((await s.db.query("SELECT count(*)::int AS n FROM check_reports WHERE interpretation_id = $1", [d1.id])).rows[0].n === 2, "check report stored for every attempt");

  const d2 = await interpret(a, P, { targetType: "finding", targetId: fb.id, audience: "analyst" });
  check(d2.id !== d1.id && d2.reusedFrom === d1.id && d2.attempts.length === 0 && d2.status === "passed", "same interpretation key reuses the passed result", { reused: d2.reusedFrom, attempts: d2.attempts?.length });
  const d3 = await interpret(a, P, {}, `${P}/interpretations/${d1.id}/regenerate`);
  check(d3.id !== d1.id && !d3.reusedFrom && d3.attempts.length === 2 && d3.status === "passed", "regenerate makes a new run instead of reusing");

  const acc = await a.post(`${P}/interpretations/${d1.id}/accept`, { note: "Sesuai bukti" });
  const d1a = (await a.get(`${P}/interpretations/${d1.id}`)).body;
  check(acc.status === 200 && d1a.status === "accepted" && d1a.modelGenerated === false && d1a.versions.map((v: any) => v.kind).join() === "model_draft,accepted_summary", "accept writes a new version", d1a.versions);
  check(JSON.stringify(d1a.sections) === JSON.stringify(d1.sections) && d1a.checkReport.ok, "original draft and check report kept after accept");
  check((await a.post(`${P}/interpretations/${d1.id}/accept`, {})).status === 409, "accept is not repeated");
  check((await owner.post(`${P}/interpretations/${d3.id}/accept`, {})).status === 403, "process owner cannot accept");
  check((await a.post(`${P}/interpretations/${d3.id}/flag`, { reason: "Ringkasan terlalu umum" })).body.status === "flagged", "flag issue");
  let immutable = false;
  try { await s.db.query("UPDATE interpretations SET output = '{}' WHERE id = $1", [d1.id]); } catch { immutable = true; }
  check(immutable, "checked draft is immutable");
  const other = await otherProjectUser(s);
  check((await other.get(`${P}/interpretations/${d1.id}`)).status === 404, "other project cannot read the interpretation");
  check((await owner.get(`${P}/interpretations?targetId=${fb.id}`)).body.interpretations.length === 3, "process owner can read the history");

  // Comparison of validated candidates: only validated ones may appear as recommendations.
  const rr = await a.post(`${P}/findings/${fb.id}/recommendations/refresh`, {});
  const rec = await waitFor("candidate set", async () => {
    const x = (await a.get(`${P}/findings/${fb.id}/recommendations`)).body;
    return x.set && x.set.id === rr.body.id && ["completed", "failed"].includes(x.set.status) ? x : null;
  }, 180_000);
  const by = Object.fromEntries(rec.candidates.map((c: any) => [c.candidateKey, c]));
  const cmp = (await a.get(`${P}/findings/${fb.id}/recommendations/compare?ids=${by.delegation.id},${by.generic.id}`)).body;
  const dc = await interpret(a, P, { targetType: "candidate_comparison", targetId: cmp.id, audience: "process_owner" });
  const recs = dc.sections.find((x: any) => x.key === "validated_recommendations");
  const validatedIds = rec.candidates.filter((c: any) => c.status === "validated").map((c: any) => c.id);
  check(dc.status === "passed" && recs && recs.claims.length === validatedIds.filter((id: string) => [by.delegation.id, by.generic.id].includes(id)).length, "comparison interpretation lists validated candidates", { status: dc.status, recs: recs?.claims?.length, validatedIds });
  check(recs.claims.every((c: any) => validatedIds.includes(c.candidateId) && c.type === "validated_recommendation"), "recommendation claims reference validated candidates only");
  check(dc.sections.flatMap((x: any) => x.claims).flatMap((c: any) => c.metrics).every((m: any) => typeof m.value === "number"), "comparison metrics rendered from the snapshot");

  const asm = (await a.get(`${P}/findings/${fb.id}/assessments`)).body.assessments.find((x: any) => x.status !== "failed");
  const da = await interpret(a, P, { targetType: "assessment", targetId: asm.id });
  check(da.status === "passed" && da.sections.find((x: any) => x.key === "measured_facts").claims.length > 0, "assessment summary interpretation passes");

  // A template whose fixture directive keeps every draft invalid ends in failed_check after three attempts.
  const tpl = await a.post(`${P}/prompt-templates`, { targetType: "finding", audience: "process_owner", body: { ...defaultPromptTemplate("finding", "process_owner"), example: "fixture:invalid" } });
  check(tpl.status === 201 && tpl.body.version === 2, "prompt template saved as a new version", tpl.body);
  const tpls = (await a.get(`${P}/prompt-templates`)).body;
  check(tpls.active.length === 6 && tpls.active.find((t: any) => t.targetType === "finding" && t.audience === "process_owner").version === 2, "active templates per target and audience");
  const df = await interpret(a, P, { targetType: "finding", targetId: fb.id, audience: "process_owner" });
  check(df.status === "failed_check" && df.attempts.length === 3 && df.sections.length === 0 && df.checkReport.violations.length > 0, "failing draft ends as failed_check with violations only", { status: df.status, attempts: df.attempts?.length });
  check((await a.post(`${P}/interpretations/${df.id}/accept`, {})).status === 409, "failed draft cannot be accepted");

  // Unconfigured provider: no key, no model call, no local draft.
  const saved = { mode: process.env.LLM_MODE, key: process.env.ANTHROPIC_API_KEY };
  delete process.env.LLM_MODE;
  delete process.env.ANTHROPIC_API_KEY;
  const { llmAdapter } = await import("../../../worker/src/adapters/llm.ts");
  let notConfigured = "";
  try { llmAdapter(); } catch (err) { notConfigured = (err as { type?: string }).type ?? ""; }
  check(notConfigured === "LlmNotConfigured", "unconfigured provider fails instead of drafting locally", notConfigured);
  Object.assign(process.env, { ...(saved.mode ? { LLM_MODE: saved.mode } : {}), ...(saved.key ? { ANTHROPIC_API_KEY: saved.key } : {}) });

  const actions = (await admin.get(`${P}/audit`)).body.events.map((e: any) => e.action);
  check(["interpretation.request", "interpretation.generate", "interpretation.regenerate", "interpretation.accept", "interpretation.flag", "interpretation.template"].every((x) => actions.includes(x)), "interpretation actions audited");
  const page = await a.get(`/lite/projects/${projectId}/findings/${fb.id}`);
  check(page.status === 200 && String(page.body).includes("Interpretasi temuan"), "finding page renders the interpretation panel");
  const cpage = await a.get(`/lite/projects/${projectId}/recommendations/${fb.id}/compare?ids=${by.delegation.id},${by.generic.id}`);
  check(cpage.status === 200 && String(cpage.body).includes("Interpretasi perbandingan"), "compare page renders the interpretation panel");
}, { workers: true, env: { JEV_MODE: "fixture", LLM_MODE: "fixture", LLM_FIXTURE_FAULT: "first_attempt", GRAPH_SWEEP_INTERVAL: "2s" } });
