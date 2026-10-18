import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUE_TS } from "@nora/contracts";
import * as context from "./activities/context.ts";
import * as data from "./activities/data.ts";

const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
});
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  taskQueue: TASK_QUEUE_TS,
  workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
  activities: { ...data, ...context },
});
await worker.run();
