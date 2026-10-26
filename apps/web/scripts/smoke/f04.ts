import { activateContext, addAnalyst, bootstrapProject, check, otherProjectUser, P2P_CONFIG, p2pCsv, publishCsv, run, waitRun } from "./harness.ts";

await run("f04", async (s) => {
  const { admin, projectId } = await bootstrapProject(s);
  const a = await addAnalyst(s, admin, projectId);
  const request = (filterSpec?: unknown) => a.call((t) => t.analyses.request.mutate({ projectId, filterSpec }));
  check((await request()).status === 409, "analysis refused without published dataset");
  const ds = await publishCsv(a, projectId, p2pCsv(120), P2P_CONFIG);
  check((await request()).status === 409, "analysis refused without active context");
  await activateContext(a, projectId);

  const started = Date.now();
  const r = await request();
  check(r.status === 200 && !r.body.reused && r.body.status === "queued", "analysis queued", r.body);
  const runRow = await waitRun(a, projectId, r.body.id);
  check(runRow.status === "completed", "analysis completed", runRow);
  console.log(`       analysis took ${Date.now() - started} ms`);
  check(runRow.datasetVersionId === ds.id && runRow.coverage?.cases === 120, "run uses published dataset with full coverage", runRow.coverage);

  const again = await request({ completion: "all" });
  check(again.body.id === r.body.id && again.body.reused, "same analysis key reuses the run");

  const runId = r.body.id;
  const map = (await a.call((t) => t.analyses.map.query({ projectId, runId }))).body;
  check(map.mapAvailable && map.startSource === "context", "map available with context boundary", map.startSource);
  const ca = map.edges.find((e) => e.from === "Create PO" && e.to === "Approve PO");
  check(ca && ca.caseCount === 120 && ca.medianSeconds! > 0 && ca.p90Seconds! >= ca.medianSeconds!, "edge metrics computed", ca);
  const loop = map.edges.find((e) => e.from === "Request Change" && e.to === "Approve PO");
  check(loop && loop.caseCount === 30, "return transition present for rework cases", loop);

  const cases = (q: Partial<{ node: string; from: string; to: string; sort: string; size: number }>) => a.call((t) => t.analyses.cases.query({ projectId, runId, ...q }));
  const drill = (await cases({ from: "Request Change", to: "Approve PO", sort: "wait", size: 100 })).body;
  check(drill.total === loop!.caseCount && drill.cases.length === 30, "edge drill-down count equals edge case count", drill.total);
  const node = map.nodes.find((n) => n.id === "Approve PO")!;
  const nd = (await cases({ node: "Approve PO", size: 10 })).body;
  check(nd.total === node.caseCount && nd.cases.length === 10, "node drill-down count equals node case count", { total: nd.total, node: node.caseCount });
  const start = (await cases({ from: "__start", to: "Create PO" })).body;
  check(start.total === 120, "start marker drill-down");
  const waits = drill.cases.map((c) => c.selectedWaitSeconds ?? 0);
  check(waits.every((w, i) => i === 0 || waits[i - 1]! >= w), "cases sorted by selected edge wait");
  check((await cases({ node: "x", size: 500 })).body.size === 100, "case page size capped at 100");

  const tl = (await a.call((t) => t.datasets.caseTimeline.query({ projectId, datasetId: ds.id, caseUid: drill.cases[0]!.caseUid }))).body;
  check(tl.events?.length === 6 && tl.events[0]!.activity === "Create PO" && tl.events[0]!.source_row_number > 0, "timeline returns one case with source rows", tl.events?.length);
  check(tl.source?.snapshotId === ds.snapshotId && tl.source?.mappingVersion === 1, "timeline links snapshot and mapping");
  check(tl.events?.every((e) => e.case_id === tl.caseId), "timeline contains only the requested case");

  const filtered = await request({ attribute: { key: "branch", values: ["Bandung"] } });
  const fr = await waitRun(a, projectId, filtered.body.id);
  check(fr.coverage?.cases === 40 && fr.coverage?.datasetCases === 120, "attribute filter reduces coverage", fr.coverage);
  const none = await request({ period: { from: "2030-01-01", to: "2030-02-01" } });
  const nr = await waitRun(a, projectId, none.body.id);
  const nmap = (await a.call((t) => t.analyses.map.query({ projectId, runId: none.body.id }))).body;
  check(nr.status === "completed" && !nmap.mapAvailable && /0 kasus/.test(nmap.unavailableReason ?? ""), "zero-case filter explains instead of failing");
  check((await request({ period: { from: "bad" } })).status === 400, "invalid filter rejected");

  const owner = await addAnalyst(s, admin, projectId, "po@example.test");
  await admin.call((t) => t.members.add.mutate({ projectId, email: "po@example.test", role: "process_owner" }));
  check((await owner.call((t) => t.analyses.map.query({ projectId, runId }))).status === 200, "process owner reads the map");
  check((await owner.call((t) => t.analyses.request.mutate({ projectId }))).status === 403, "process owner cannot run analysis");

  const ready = (await a.call((t) => t.projects.readiness.query({ projectId }))).body;
  check(ready.state === "results_ready", "readiness reaches results_ready", ready.state);
  const page = await a.page(`/projects/${projectId}/analysis?run=${runId}`);
  check(page.status === 200 && page.body.includes("Peta proses"), "analysis page renders");

  const other = await otherProjectUser(s);
  check((await other.call((t) => t.analyses.map.query({ projectId, runId }))).status === 404, "other project cannot read the map");
  check((await other.call((t) => t.datasets.caseTimeline.query({ projectId, datasetId: ds.id, caseUid: drill.cases[0]!.caseUid }))).status === 404, "other project cannot read the timeline");
}, { workers: true });
