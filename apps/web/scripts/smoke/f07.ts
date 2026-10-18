import { Connection, Client as TemporalClient } from "@temporalio/client";
import { neighborhood, closeGraph } from "@nora/graph";
import { TASK_QUEUE_TS } from "@nora/contracts";
import { activateContext, addAnalyst, bootstrapProject, check, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, run, waitFor, waitRun } from "./harness.ts";

await run("f07", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const P = `/api/lite/projects/${projectId}`;
  await publishCsv(a, projectId, p2pCsv(60), P2P_CONFIG);
  const imp = await a.post(`${P}/catalog/import`, {
    hypotheses: [
      { key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"] } },
      { key: "unrelated", payload: { statement: "Masalah gudang", findingTypes: ["high_rework"], activities: ["Receive Goods"] } },
    ],
  });
  for (const h of (await a.get(`${P}/catalog/hypotheses`)).body.items) await a.patch(`${P}/catalog/hypotheses`, { id: h.id, to: "approved" });
  void imp;
  await activateContext(a, projectId, { rework: true });
  const r = await a.post(`${P}/analyses`, {});
  await waitRun(a, projectId, r.body.id);
  const fb = (await a.get(`${P}/findings`)).body.findings.find((f: any) => f.type === "bottleneck_indication");
  check(!!fb, "bottleneck finding available");

  const projected = await waitFor("graph projection", async () => {
    const st = (await admin.get(`${P}/graph/status`)).body;
    return st.pending === 0 && st.projectedSequence > 0 ? st : null;
  }, 120_000);
  check(projected.counts?.nodes > 0 && projected.deadLetters.length === 0, "outbox projected to Neo4j without dead letters", projected);

  const nb = (await a.get(`${P}/graph/neighborhood?type=Finding&id=${fb.id}&depth=3`)).body;
  const types = new Set(nb.nodes.map((n: any) => n.type));
  check(["Finding", "Analysis", "DatasetVersion", "ContextPackage", "MetricDefinition", "Transition", "CaseRef"].every((t) => types.has(t)), "neighborhood reaches lineage and observations", [...types]);
  const may = nb.edges.find((e: any) => e.type === "MAY_EXPLAIN");
  check(may?.category === "hypothesis" && may.props.status === "unproven", "hypothesis relation is unproven", may);
  check(nb.edges.every((e: any) => e.props.creatorType && e.props.recordId), "relations carry creator type and record id");
  check((await a.get(`${P}/graph/neighborhood?type=Bogus&id=x`)).status === 400, "unknown node type rejected");

  // Isolation at the repository level: the same node id asked under another project returns nothing.
  const other = await otherProjectUser(s);
  const otherProject = (await other.get(`/api/lite/projects`)).body.projects[0].id;
  const leak = await neighborhood(otherProject, { type: "Finding", id: fb.id }, 3);
  check(leak.nodes.length === 0 && leak.edges.length === 0, "Neo4j query scoped to another project returns nothing");
  check((await other.get(`${P}/graph/neighborhood?type=Finding&id=${fb.id}`)).status === 404, "other project's user gets 404");

  // Evidence bundle through the internal service (Temporal), twice: same input -> same bundle and hash.
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  const tc = new TemporalClient({ connection: conn, namespace: s.env.TEMPORAL_NAMESPACE });
  const analystId = (await s.db.query("SELECT id FROM users WHERE email = 'analyst@example.test'")).rows[0].id;
  const req = { projectId, targetType: "finding", targetId: fb.id, purpose: "llm_interpretation", requestedBy: analystId, correlationId: "smoke-f07" };
  const b1: any = await tc.workflow.execute("evidenceBundleWorkflow", { taskQueue: TASK_QUEUE_TS, workflowId: `smoke-bundle-1-${Date.now()}`, args: [req] });
  const b2: any = await tc.workflow.execute("evidenceBundleWorkflow", { taskQueue: TASK_QUEUE_TS, workflowId: `smoke-bundle-2-${Date.now()}`, args: [req] });
  check(b1.hash === b2.hash && b1.bundleId === b2.bundleId && b2.reused, "same input gives the same bundle and hash", { b1, b2 });
  const bundle = (await a.get(`${P}/evidence-bundles/${b1.bundleId}`)).body;
  const metric = bundle.items.find((x: any) => x.itemType === "metric_value" && x.content?.metric === "p90Seconds");
  check(metric?.included && metric.content.unit === "seconds", "measured values are included with units", metric);
  check(bundle.items[0].itemType === "finding" && bundle.items[0].relationPath === "target", "target first, then by priority and graph distance");
  const unrelated = bundle.items.find((x: any) => x.itemType === "hypothesis" && !x.included);
  check(unrelated?.exclusionReason, "non-matching hypothesis excluded with reason", unrelated);
  check(bundle.items.filter((x: any) => x.itemType === "case_summary").every((x: any) => !JSON.stringify(x.content ?? {}).includes("PO-")), "case summaries use pseudonymous references");
  const small: any = await tc.workflow.execute("evidenceBundleWorkflow", { taskQueue: TASK_QUEUE_TS, workflowId: `smoke-bundle-3-${Date.now()}`, args: [{ ...req, maxEstimatedTokens: 300 }] });
  const sb = (await a.get(`${P}/evidence-bundles/${small.bundleId}`)).body;
  check(sb.contextLimited && sb.items.some((x: any) => x.exclusionReason === "melebihi anggaran token") && small.hash !== b1.hash, "budget limit flags context_limited and records exclusions");
  let immutable = false;
  try { await s.db.query("UPDATE evidence_bundles SET context_limited = false WHERE id = $1", [small.bundleId]); } catch { immutable = true; }
  check(immutable, "bundles are immutable");
  check((await other.get(`${P}/evidence-bundles/${b1.bundleId}`)).status === 404, "other project cannot read the bundle");
  await conn.close();

  // Rebuild: drop the projection and replay from PostgreSQL; authoritative rows untouched.
  const before = projected.counts.nodes;
  const findingsBefore = (await s.db.query("SELECT count(*)::int n FROM findings")).rows[0].n;
  check((await a.post(`${P}/graph/rebuild`)).status === 403, "only administrators rebuild the graph");
  check((await admin.post(`${P}/graph/rebuild`)).status === 202, "rebuild requested");
  const rebuilt = await waitFor("graph rebuild", async () => {
    const st = (await admin.get(`${P}/graph/status`)).body;
    return st.rebuiltAt && !st.rebuildRequestedAt && st.pending === 0 ? st : null;
  }, 120_000);
  check(rebuilt.counts.nodes >= before && (await s.db.query("SELECT count(*)::int n FROM findings")).rows[0].n === findingsBefore, "rebuild restores the graph without touching findings", { before, after: rebuilt.counts });
  const actions = (await admin.get(`${P}/audit`)).body.events.map((e: any) => e.action);
  check(["graph.read", "graph.rebuild", "evidence.bundle.create", "evidence.bundle.read"].every((x) => actions.includes(x)), "graph access, rebuild and bundles audited");
  const page = await a.get(`/lite/projects/${projectId}/findings/${fb.id}`);
  check(page.status === 200, "finding page renders with evidence panel");
  await closeGraph();
}, { workers: true, env: { GRAPH_SWEEP_INTERVAL: "2s" } });
