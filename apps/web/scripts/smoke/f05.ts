import { activateContext, addAnalyst, bootstrapProject, check, P2P_CONFIG, p2pCsv, publishCsv, rejects, run, waitRun } from "./harness.ts";

await run("f05", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  await publishCsv(a, projectId, p2pCsv(120), P2P_CONFIG);
  const rule = await a.call((t) => t.context.save.mutate({ projectId, kind: "rule", key: "sod", payload: { name: "Pemisahan approve dan bayar", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } }, sourceReference: "Kebijakan SoD" }));
  await a.call((t) => t.context.transition.mutate({ projectId, kind: "rule", id: rule.body.id, to: "approved" }));
  await activateContext(a, projectId, { rework: true });

  const r = await a.call((t) => t.analyses.request.mutate({ projectId }));
  const runRow = await waitRun(a, projectId, r.body.id);
  check(runRow.status === "completed" && runRow.monitoringStatus === "completed", "monitoring stage completed", { s: runRow.status, m: runRow.monitoringStatus, e: runRow.monitoringError });

  const d = (await a.call((t) => t.analyses.dashboard.query({ projectId, runId: r.body.id }))).body;
  const M = d.metrics;
  check(M.cases_started?.value === 120 && M.cases_completed?.value === 120 && M.cases_open?.value === 0, "case volume metrics", { s: M.cases_started?.value, c: M.cases_completed?.value });
  const median = M.case_duration_median;
  check(median?.available && median.formula && median.version === 1 && median.population.cases === 120, "metric carries definition, version and population");
  check(Math.abs((M.rework_case_share?.value ?? NaN) - 0.25) < 1e-9, "rework share follows the F03 definition", M.rework_case_share?.value);
  check(M.rule_compliance?.available && (M.rule_compliance.value ?? 1) < 1, "rule compliance computed", M.rule_compliance?.value);
  check(d.conformance?.status === "unavailable" && /BPMN/.test(d.conformance.reason ?? ""), "conformance unavailable without BPMN, with reason", d.conformance);
  check(d.series.length > 0 && d.series.reduce((n, x) => n + x.started, 0) === 120, "trend series sums to population");

  const bt = (await a.call((t) => t.analyses.bottlenecks.query({ projectId, runId: r.body.id }))).body.transitions;
  check(bt.length > 0 && bt.every((t, i) => i === 0 || bt[i - 1]!.totalSeconds! >= t.totalSeconds!), "transitions ranked by total wait");
  const flagged = bt.filter((t) => t.isBottleneck);
  check(flagged.length > 0 && flagged.every((t) => t.findingId), "bottleneck transitions linked to findings", flagged.length);

  const runFindings = async (runId: string) => (await a.call((t) => t.analyses.findings.query({ projectId, runId }))).body.findings;
  const findings = await runFindings(r.body.id);
  const types = new Set(findings.map((f) => f.type));
  check(types.has("bottleneck_indication") && types.has("high_rework") && types.has("rule_non_compliance"), "findings for bottleneck, rework and rule", [...types]);
  check(findings.every((f) => f.title.startsWith("Indikasi")), "finding titles say 'indikasi'");
  const fb = findings.find((f) => f.type === "bottleneck_indication")!;
  const tr = bt.find((t) => t.findingId === fb.id)!;
  check(fb.caseCount === tr.caseCount, "finding case count equals transition case count", { f: fb.caseCount, t: tr.caseCount });
  const fr = findings.find((f) => f.type === "high_rework")!;
  check(fr.caseCount === 30, "rework finding has the 30 rework cases", fr.caseCount);
  check(await rejects(s.db.finding.update({ where: { id: fb.id }, data: { title: "x" } })), "findings are immutable");

  const ready = (await a.call((t) => t.projects.readiness.query({ projectId }))).body;
  check(ready.facts.findings.bottleneck === flagged.length && ready.facts.findings.rework === 1, "readiness counts bottleneck and rework findings", ready.facts.findings);

  // Thresholds are versioned, audited, and part of the analysis key.
  const settings = (await a.call((t) => t.analyses.settings.query({ projectId }))).body;
  check(settings.version === 0 && settings.config.bottleneck.topK === 5, "default settings");
  const put = await a.call((t) => t.analyses.saveSettings.mutate({ projectId, config: { ...settings.config, bottleneck: { ...settings.config.bottleneck, minP90Seconds: 10 ** 9 } } }));
  check(put.status === 200 && put.body.version === 1, "settings saved as version 1");
  const r2 = await a.call((t) => t.analyses.request.mutate({ projectId }));
  check(!r2.body.reused && r2.body.id !== r.body.id, "changed thresholds give a new run");
  await waitRun(a, projectId, r2.body.id);
  const f2 = await runFindings(r2.body.id);
  check(!f2.some((f) => f.type === "bottleneck_indication"), "strict threshold yields no bottleneck finding (valid result)");
  const old = await runFindings(r.body.id);
  check(old.length === findings.length, "historical run keeps its findings");
  check((await a.call((t) => t.projects.audit.query({ projectId }))).body.events.some((e) => e.action === "analysis.settings"), "threshold change audited");
  const owner = await addAnalyst(s, admin, projectId, "po5@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "po5@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.analyses.saveSettings.mutate({ projectId, config: settings.config }))).status === 403, "process owner cannot change thresholds");
  const page = await a.page(`/lite/projects/${projectId}/analysis/dashboard?run=${r.body.id}`);
  check(page.status === 200 && page.body.includes("Indikasi bottleneck"), "dashboard page renders");
}, { workers: true });
