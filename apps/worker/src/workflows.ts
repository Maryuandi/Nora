import { proxyActivities } from "@temporalio/workflow";
import { PingResult, TASK_QUEUE_PYTHON, type PingRequest } from "@nora/contracts";

const { pythonPing } = proxyActivities<{ pythonPing(input: PingRequest): Promise<unknown> }>({
  taskQueue: TASK_QUEUE_PYTHON,
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3 },
});

export async function pingWorkflow(input: PingRequest): Promise<PingResult> {
  return PingResult.parse(await pythonPing(input));
}
