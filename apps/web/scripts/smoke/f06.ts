import { activateContext, addAnalyst, bootstrapProject, check, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, run, waitRun } from "./harness.ts";

const flat = (n: any): any[] => [n, ...n.children.flatMap(flat)];

await run("f06", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const P = `/api/lite/projects/${projectId}`;
  check((await a.get(`${P}/findings`)).body.runId === null, "no findings before analysis");
  const ds = await publishCsv(a, projectId, p2pCsv(120), P2P_CONFIG);
  const doc = await a.post(`${P}/context/documents`, { title: "Kebijakan SoD", reference: "POL-7" });
  const rule = await a.post(`${P}/context/rules`, { key: "sod", payload: { name: "SoD approve/bayar", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } }, sourceDocumentId: doc.body.id });
  await a.patch(`${P}/context/rules`, { id: rule.body.id, to: "approved" });
  await activateContext(a, projectId, { rework: true });
  const r = await a.post(`${P}/analyses`, {});
  await waitRun(a, projectId, r.body.id);

  const list = (await a.get(`${P}/findings`)).body;
  check(list.runId === r.body.id && list.findings.length > 0, "list defaults to latest run", list.runId);
  check(list.findings.every((f: any) => ["bottleneck_indication", "high_rework"].includes(f.type)), "default filter shows bottleneck and rework only");
  check(list.findings.every((f: any, i: number) => i === 0 || list.findings[i - 1].severityScore >= f.severityScore), "sorted by severity");
  const all = (await a.get(`${P}/findings?type=rule_non_compliance`)).body.findings;
  check(all.length === 1 && all[0].type === "rule_non_compliance", "advanced filter opens other types");
  const byCases = (await a.get(`${P}/findings?sort=cases`)).body.findings;
  check(byCases.every((f: any, i: number) => i === 0 || byCases[i - 1].caseCount >= f.caseCount), "sort by affected cases");

  const fb = list.findings.find((f: any) => f.type === "bottleneck_indication");
  const detail = (await a.get(`${P}/findings/${fb.id}`)).body;
  check(detail.metricKey === "transition_wait" && detail.formula && detail.population.cases === 120 && detail.thresholds.topK, "detail carries metric definition, population, thresholds");
  const cases = (await a.get(`${P}/findings/${fb.id}/cases?size=100`)).body;
  check(cases.total === detail.caseCount && cases.total === detail.metrics.caseCount, "case total equals finding_cases and metric", { t: cases.total, m: detail.metrics.caseCount });
  const waits = cases.cases.map((c: any) => c.supportValue);
  check(waits.every((w: number, i: number) => i === 0 || waits[i - 1] >= w), "bottleneck cases ranked by transition wait");
  const tl = (await a.get(`${P}/datasets/${ds.id}/cases/${cases.cases[0].caseUid}`)).body;
  check(tl.events?.length >= 4 && tl.events.every((e: any) => e.source_row_number > 0), "timeline traces to source rows");

  const fr = list.findings.find((f: any) => f.type === "high_rework");
  const rc = (await a.get(`${P}/findings/${fr.id}/cases?sort=additional&size=50`)).body;
  check(rc.total === 30 && rc.cases.every((c: any, i: number) => i === 0 || rc.cases[i - 1].additionalSeconds >= c.additionalSeconds), "rework cases sortable by additional duration");
  check((await a.get(`${P}/findings/${fb.id}/cases?sort=additional`)).status === 400, "additional duration only for rework");

  const lin = (await a.get(`${P}/findings/${fb.id}/lineage`)).body.tree;
  const types = flat(lin).map((n: any) => n.type);
  check(["finding", "analysis", "metric_definition", "dataset_version", "mapping_version", "snapshot", "source", "context_package"].every((t) => types.includes(t)), "lineage reaches snapshot and context", types);
  const rf = all[0];
  const rlin = flat((await a.get(`${P}/findings/${rf.id}/lineage`)).body.tree);
  const ruleNode = rlin.find((n: any) => n.type === "rule");
  check(ruleNode?.relation === "EVALUATED_AGAINST" && ruleNode.children[0]?.type === "document", "rule finding lineage reaches source document", ruleNode);

  const owner = await addAnalyst(s, admin, projectId, "po6@example.test");
  await admin.post(`${P}/members`, { email: "po6@example.test", role: "process_owner" });
  check((await owner.get(`${P}/findings/${fb.id}`)).status === 200, "process owner reads findings");
  const other = await otherProjectUser(s);
  check((await other.get(`${P}/findings/${fb.id}`)).status === 404 && (await other.get(`${P}/findings/${fb.id}/cases`)).status === 404, "other project gets 404");
  const page = await a.get(`/lite/projects/${projectId}/findings/${fb.id}`);
  check(page.status === 200 && String(page.body).includes("Observasi terukur") && String(page.body).includes("belum terbukti"), "detail page renders summary panels");
  const listPage = await a.get(`/lite/projects/${projectId}/findings`);
  check(listPage.status === 200 && String(listPage.body).includes(fb.title.replace("→", "")?.slice(0, 20)), "list page renders");
}, { workers: true });
