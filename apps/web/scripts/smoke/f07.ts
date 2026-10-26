import { Connection, Client as TemporalClient } from "@temporalio/client";
import { neighborhood, closeGraph } from "@nora/graph";
import { TASK_QUEUE_TS } from "@nora/contracts";
import { activateContext, addAnalyst, approveCatalog, bootstrapProject, check, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, rejects, run, waitFor, waitRun } from "./harness.ts";

interface BundleResult { bundleId: string; hash: string; reused: boolean }

await run("f07", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  await publishCsv(a, projectId, p2pCsv(60), P2P_CONFIG);
  await a.call((t) => t.context.importCatalog.mutate({ projectId, catalog: {
    hypotheses: [
      { key: "approver", payload: { statement: "Kapasitas approver terbatas", findingTypes: ["bottleneck_indication"] } },
      { key: "unrelated", payload: { statement: "Masalah gudang", findingTypes: ["high_rework"], activities: ["Receive Goods"] } },
    ],
  } }));
  await approveCatalog(a, projectId);
  await activateContext(a, projectId, { rework: true });
  const r = await a.call((t) => t.analyses.request.mutate({ projectId }));
  await waitRun(a, projectId, r.body.id);
  const fb = (await a.call((t) => t.findings.list.query({ projectId }))).body.findings.find((f) => f.type === "bottleneck_indication");
  check(!!fb, "bottleneck finding available");
  const findingId = fb!.id;
  const status = async () => (await admin.call((t) => t.graph.status.query({ projectId }))).body;

  const projected = await waitFor("graph projection", async () => {
    const st = await status();
    return st.pending === 0 && st.projectedSequence > 0 ? st : null;
  }, 120_000);
  check((projected.counts?.nodes ?? 0) > 0 && projected.deadLetters.length === 0, "outbox projected to Neo4j without dead letters", projected);

  const nb = (await a.call((t) => t.graph.neighborhood.query({ projectId, type: "Finding", id: findingId, depth: 3 }))).body;
  const types = new Set(nb.nodes.map((n) => n.type));
  check(["Finding", "Analysis", "DatasetVersion", "ContextPackage", "MetricDefinition", "Transition", "CaseRef"].every((t) => types.has(t as never)), "neighborhood reaches lineage and observations", [...types]);
  const may = nb.edges.find((e) => e.type === "MAY_EXPLAIN");
  check(may?.category === "hypothesis" && may.props.status === "unproven", "hypothesis relation is unproven", may);
  check(nb.edges.every((e) => e.props.creatorType && e.props.recordId), "relations carry creator type and record id");
  check((await a.call((t) => t.graph.neighborhood.query({ projectId, type: "Bogus", id: "x" }))).status === 400, "unknown node type rejected");

  // Isolation at the repository level: the same node id asked under another project returns nothing.
  const other = await otherProjectUser(s);
  const otherProject = (await other.call((t) => t.projects.list.query())).body.projects[0]!.id;
  const leak = await neighborhood(otherProject, { type: "Finding", id: findingId }, 3);
  check(leak.nodes.length === 0 && leak.edges.length === 0, "Neo4j query scoped to another project returns nothing");
  check((await other.call((t) => t.graph.neighborhood.query({ projectId, type: "Finding", id: findingId }))).status === 404, "other project's user gets 404");

  // Evidence bundle through the internal service (Temporal), twice: same input -> same bundle and hash.
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  const tc = new TemporalClient({ connection: conn, namespace: s.env.TEMPORAL_NAMESPACE });
  const analystId = (await s.db.user.findUniqueOrThrow({ where: { email: "analyst@example.test" } })).id;
  const req = { projectId, targetType: "finding", targetId: findingId, purpose: "llm_interpretation", requestedBy: analystId, correlationId: "smoke-f07" };
  const build = (workflowId: string, input: object): Promise<BundleResult> => tc.workflow.execute("evidenceBundleWorkflow", { taskQueue: TASK_QUEUE_TS, workflowId: `${workflowId}-${Date.now()}`, args: [input] });
  const b1 = await build("smoke-bundle-1", req);
  const b2 = await build("smoke-bundle-2", req);
  check(b1.hash === b2.hash && b1.bundleId === b2.bundleId && b2.reused, "same input gives the same bundle and hash", { b1, b2 });
  const bundle = async (bundleId: string) => (await a.call((t) => t.graph.bundle.query({ projectId, bundleId }))).body;
  const full = await bundle(b1.bundleId);
  const metric = full.items.find((x) => x.itemType === "metric_value" && x.content?.metric === "p90Seconds");
  check(metric?.included && metric.content?.unit === "seconds", "measured values are included with units", metric);
  check(full.items[0]!.itemType === "finding" && full.items[0]!.relationPath === "target", "target first, then by priority and graph distance");
  const unrelated = full.items.find((x) => x.itemType === "hypothesis" && !x.included);
  check(unrelated?.exclusionReason, "non-matching hypothesis excluded with reason", unrelated);
  check(full.items.filter((x) => x.itemType === "case_summary").every((x) => !JSON.stringify(x.content ?? {}).includes("PO-")), "case summaries use pseudonymous references");
  const small = await build("smoke-bundle-3", { ...req, maxEstimatedTokens: 300 });
  const sb = await bundle(small.bundleId);
  check(sb.contextLimited && sb.items.some((x) => x.exclusionReason === "melebihi anggaran token") && small.hash !== b1.hash, "budget limit flags context_limited and records exclusions");
  check(await rejects(s.db.evidenceBundle.update({ where: { id: small.bundleId }, data: { contextLimited: false } })), "bundles are immutable");
  check((await other.call((t) => t.graph.bundle.query({ projectId, bundleId: b1.bundleId }))).status === 404, "other project cannot read the bundle");
  await conn.close();

  // Rebuild: drop the projection and replay from PostgreSQL; authoritative rows untouched.
  const before = projected.counts!.nodes;
  const findingsBefore = await s.db.finding.count();
  check((await a.call((t) => t.graph.rebuild.mutate({ projectId }))).status === 403, "only administrators rebuild the graph");
  check((await admin.call((t) => t.graph.rebuild.mutate({ projectId }))).status === 200, "rebuild requested");
  const rebuilt = await waitFor("graph rebuild", async () => {
    const st = await status();
    return st.rebuiltAt && !st.rebuildRequestedAt && st.pending === 0 ? st : null;
  }, 120_000);
  check(rebuilt.counts!.nodes >= before && (await s.db.finding.count()) === findingsBefore, "rebuild restores the graph without touching findings", { before, after: rebuilt.counts });
  const actions = (await admin.call((t) => t.projects.audit.query({ projectId }))).body.events.map((e) => e.action);
  check(["graph.read", "graph.rebuild", "evidence.bundle.create", "evidence.bundle.read"].every((x) => actions.includes(x)), "graph access, rebuild and bundles audited");
  const page = await a.page(`/projects/${projectId}/findings/${findingId}`);
  check(page.status === 200, "finding page renders with evidence panel");
  await closeGraph();
}, { workers: true, env: { GRAPH_SWEEP_INTERVAL: "2s" } });
