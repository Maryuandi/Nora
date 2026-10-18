import { activateContext, addAnalyst, bootstrapProject, check, P2P_CONFIG, p2pCsv, publishCsv, run, waitFor, waitRun } from "./harness.ts";

await run("f05", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const P = `/api/lite/projects/${projectId}`;
  await publishCsv(a, projectId, p2pCsv(120), P2P_CONFIG);
  const rule = await a.post(`${P}/context/rules`, { key: "sod", payload: { name: "Pemisahan approve dan bayar", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } }, sourceReference: "Kebijakan SoD" });
  await a.patch(`${P}/context/rules`, { id: rule.body.id, to: "approved" });
  await activateContext(a, projectId, { rework: true });

  const r = await a.post(`${P}/analyses`, {});
  const runRow = await waitRun(a, projectId, r.body.id);
  check(runRow.status === "completed" && runRow.monitoringStatus === "completed", "monitoring stage completed", { s: runRow.status, m: runRow.monitoringStatus, e: runRow.monitoringError });

  const d = (await a.get(`${P}/analyses/${r.body.id}/dashboard`)).body;
  const M = d.metrics;
  check(M.cases_started.value === 120 && M.cases_completed.value === 120 && M.cases_open.value === 0, "case volume metrics", { s: M.cases_started?.value, c: M.cases_completed?.value });
  check(M.case_duration_median.available && M.case_duration_median.formula && M.case_duration_median.version === 1 && M.case_duration_median.population.cases === 120, "metric carries definition, version and population");
  check(Math.abs(M.rework_case_share.value - 0.25) < 1e-9, "rework share follows the F03 definition", M.rework_case_share.value);
  check(M.rule_compliance.available && M.rule_compliance.value < 1, "rule compliance computed", M.rule_compliance.value);
  check(d.conformance.status === "unavailable" && /BPMN/.test(d.conformance.reason), "conformance unavailable without BPMN, with reason", d.conformance);
  check(d.series.length > 0 && d.series.reduce((n: number, x: any) => n + x.started, 0) === 120, "trend series sums to population");

  const bt = (await a.get(`${P}/analyses/${r.body.id}/bottlenecks`)).body.transitions;
  check(bt.length > 0 && bt.every((t: any, i: number) => i === 0 || bt[i - 1].totalSeconds >= t.totalSeconds), "transitions ranked by total wait");
  const flagged = bt.filter((t: any) => t.isBottleneck);
  check(flagged.length > 0 && flagged.every((t: any) => t.findingId), "bottleneck transitions linked to findings", flagged.length);

  const findings = (await a.get(`${P}/analyses/${r.body.id}/findings`)).body.findings;
  const types = new Set(findings.map((f: any) => f.type));
  check(types.has("bottleneck_indication") && types.has("high_rework") && types.has("rule_non_compliance"), "findings for bottleneck, rework and rule", [...types]);
  check(findings.every((f: any) => f.title.startsWith("Indikasi")), "finding titles say 'indikasi'");
  const fb = findings.find((f: any) => f.type === "bottleneck_indication");
  const tr = bt.find((t: any) => t.findingId === fb.id);
  check(Number(fb.caseCount) === tr.caseCount, "finding case count equals transition case count", { f: fb.caseCount, t: tr.caseCount });
  const fr = findings.find((f: any) => f.type === "high_rework");
  check(Number(fr.caseCount) === 30, "rework finding has the 30 rework cases", fr.caseCount);
  let immutable = false;
  try { await s.db.query("UPDATE findings SET title = 'x' WHERE id = $1", [fb.id]); } catch { immutable = true; }
  check(immutable, "findings are immutable");

  const ready = (await a.get(`${P}/readiness`)).body;
  check(ready.facts.findings.bottleneck === flagged.length && ready.facts.findings.rework === 1, "readiness counts bottleneck and rework findings", ready.facts.findings);

  // Thresholds are versioned, audited, and part of the analysis key.
  const settings = (await a.get(`${P}/analysis-settings`)).body;
  check(settings.version === 0 && settings.config.bottleneck.topK === 5, "default settings");
  const put = await a.call("PUT", `${P}/analysis-settings`, { ...settings.config, bottleneck: { ...settings.config.bottleneck, minP90Seconds: 10 ** 9 } });
  check(put.status === 200 && put.body.version === 1, "settings saved as version 1");
  const r2 = await a.post(`${P}/analyses`, {});
  check(r2.status === 202 && r2.body.id !== r.body.id, "changed thresholds give a new run");
  await waitRun(a, projectId, r2.body.id);
  const f2 = (await a.get(`${P}/analyses/${r2.body.id}/findings`)).body.findings;
  check(!f2.some((f: any) => f.type === "bottleneck_indication"), "strict threshold yields no bottleneck finding (valid result)");
  const old = (await a.get(`${P}/analyses/${r.body.id}/findings`)).body.findings;
  check(old.length === findings.length, "historical run keeps its findings");
  check((await a.get(`${P}/audit`)).body.events.some((e: any) => e.action === "analysis.settings"), "threshold change audited");
  const owner = await addAnalyst(s, admin, projectId, "po5@example.test");
  await admin.post(`${P}/members`, { email: "po5@example.test", role: "process_owner" });
  check((await owner.call("PUT", `${P}/analysis-settings`, settings.config)).status === 403, "process owner cannot change thresholds");
  const page = await a.get(`/lite/projects/${projectId}/analysis/dashboard?run=${r.body.id}`);
  check(page.status === 200 && String(page.body).includes("Indikasi bottleneck"), "dashboard page renders");
  void waitFor;
}, { workers: true });
