import type { LineageNode } from "../../lib/lite/lineage.ts";
import { activateContext, addAnalyst, bootstrapProject, check, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, run, waitRun } from "./harness.ts";

const flat = (n: LineageNode): LineageNode[] => [n, ...n.children.flatMap(flat)];

await run("f06", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const list = (q: { types?: string; sort?: string } = {}) => a.call((t) => t.findings.list.query({ projectId, ...q }));
  check((await list()).body.runId === null, "no findings before analysis");
  const ds = await publishCsv(a, projectId, p2pCsv(120), P2P_CONFIG);
  const doc = await a.call((t) => t.context.createDocument.mutate({ projectId, title: "Kebijakan SoD", reference: "POL-7" }));
  const rule = await a.call((t) => t.context.save.mutate({ projectId, kind: "rule", key: "sod", payload: { name: "SoD approve/bayar", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } }, sourceDocumentId: doc.body.id }));
  await a.call((t) => t.context.transition.mutate({ projectId, kind: "rule", id: rule.body.id, to: "approved" }));
  await activateContext(a, projectId, { rework: true });
  const r = await a.call((t) => t.analyses.request.mutate({ projectId }));
  await waitRun(a, projectId, r.body.id);

  const first = (await list()).body;
  check(first.runId === r.body.id && first.findings.length > 0, "list defaults to latest run", first.runId);
  check(first.findings.every((f) => ["bottleneck_indication", "high_rework"].includes(f.type)), "default filter shows bottleneck and rework only");
  check(first.findings.every((f, i) => i === 0 || first.findings[i - 1]!.severityScore >= f.severityScore), "sorted by severity");
  const all = (await list({ types: "rule_non_compliance" })).body.findings;
  check(all.length === 1 && all[0]!.type === "rule_non_compliance", "advanced filter opens other types");
  const byCases = (await list({ sort: "cases" })).body.findings;
  check(byCases.every((f, i) => i === 0 || byCases[i - 1]!.caseCount >= f.caseCount), "sort by affected cases");

  const fb = first.findings.find((f) => f.type === "bottleneck_indication")!;
  const detail = (await a.call((t) => t.findings.get.query({ projectId, findingId: fb.id }))).body;
  check(detail.metricKey === "transition_wait" && detail.formula && detail.population.cases === 120 && detail.thresholds.topK, "detail carries metric definition, population, thresholds");
  const cases = (q: { findingId: string; sort?: string; size?: number }) => a.call((t) => t.findings.cases.query({ projectId, ...q }));
  const fc = (await cases({ findingId: fb.id, size: 100 })).body;
  check(fc.total === detail.caseCount && fc.total === detail.metrics.caseCount, "case total equals finding_cases and metric", { t: fc.total, m: detail.metrics.caseCount });
  const waits = fc.cases.map((c) => c.supportValue ?? 0);
  check(waits.every((w, i) => i === 0 || waits[i - 1]! >= w), "bottleneck cases ranked by transition wait");
  const tl = (await a.call((t) => t.datasets.caseTimeline.query({ projectId, datasetId: ds.id, caseUid: fc.cases[0]!.caseUid }))).body;
  check(tl.events?.length >= 4 && tl.events.every((e) => e.source_row_number > 0), "timeline traces to source rows");

  const fr = first.findings.find((f) => f.type === "high_rework")!;
  const rc = (await cases({ findingId: fr.id, sort: "additional", size: 50 })).body;
  check(rc.total === 30 && rc.cases.every((c, i) => i === 0 || rc.cases[i - 1]!.additionalSeconds! >= c.additionalSeconds!), "rework cases sortable by additional duration");
  check((await cases({ findingId: fb.id, sort: "additional" })).status === 400, "additional duration only for rework");

  const lineage = async (findingId: string) => (await a.call((t) => t.findings.lineage.query({ projectId, findingId }))).body.tree;
  const types = flat(await lineage(fb.id)).map((n) => n.type);
  check(["finding", "analysis", "metric_definition", "dataset_version", "mapping_version", "snapshot", "source", "context_package"].every((t) => types.includes(t)), "lineage reaches snapshot and context", types);
  const rlin = flat(await lineage(all[0]!.id));
  const ruleNode = rlin.find((n) => n.type === "rule");
  check(ruleNode?.relation === "EVALUATED_AGAINST" && ruleNode.children[0]?.type === "document", "rule finding lineage reaches source document", ruleNode);

  const owner = await addAnalyst(s, admin, projectId, "po6@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "po6@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.findings.get.query({ projectId, findingId: fb.id }))).status === 200, "process owner reads findings");
  const other = await otherProjectUser(s);
  check((await other.call((t) => t.findings.get.query({ projectId, findingId: fb.id }))).status === 404 && (await other.call((t) => t.findings.cases.query({ projectId, findingId: fb.id }))).status === 404, "other project gets 404");
  const page = await a.page(`/lite/projects/${projectId}/findings/${fb.id}`);
  check(page.status === 200 && page.body.includes("Observasi terukur") && page.body.includes("belum terbukti"), "detail page renders summary panels");
  const listPage = await a.page(`/lite/projects/${projectId}/findings`);
  check(listPage.status === 200 && listPage.body.includes(fb.title.replace("→", "").slice(0, 20)), "list page renders");
}, { workers: true });
