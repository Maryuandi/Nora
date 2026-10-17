import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUE_TS } from "@nora/contracts";

const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
});
const worker = await Worker.create({
  connection,
  taskQueue: TASK_QUEUE_TS,
  workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
});
await worker.run();
