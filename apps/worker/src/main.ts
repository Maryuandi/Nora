import { fileURLToPath } from "node:url";
import { Client, Connection, ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUE_TS } from "@nora/contracts";
import * as analysis from "./activities/analysis.ts";
import * as assessment from "./activities/assessment.ts";
import * as context from "./activities/context.ts";
import * as data from "./activities/data.ts";
import * as evidence from "./activities/evidence.ts";
import * as graph from "./activities/graph.ts";
import * as monitoring from "./activities/monitoring.ts";

const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
});
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  taskQueue: TASK_QUEUE_TS,
  workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
  activities: { ...data, ...context, ...analysis, ...monitoring, ...graph, ...evidence, ...assessment },
});
// Graph projection runs on a schedule in this namespace; creating it again is a no-op.
const client = new Client({ connection: await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" }), namespace: process.env.TEMPORAL_NAMESPACE ?? "default" });
try {
  await client.schedule.create({
    scheduleId: "graph-projection-sweep",
    spec: { intervals: [{ every: process.env.GRAPH_SWEEP_INTERVAL ?? "10s" }] },
    action: { type: "startWorkflow", workflowType: "graphProjectionSweepWorkflow", taskQueue: TASK_QUEUE_TS, workflowExecutionTimeout: "5 minutes" },
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
  });
} catch (err) {
  if (!(err instanceof ScheduleAlreadyRunning)) throw err;
}
await worker.run();
