import { ApplicationFailure, proxyActivities } from "@temporalio/workflow";
import { PingResult, TASK_QUEUE_PYTHON, type PingRequest } from "@nora/contracts";

const { pythonPing } = proxyActivities<{ pythonPing(input: PingRequest): Promise<unknown> }>({
  taskQueue: TASK_QUEUE_PYTHON,
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3 },
});

export async function pingWorkflow(input: PingRequest): Promise<PingResult> {
  const r = PingResult.safeParse(await pythonPing(input));
  // A ZodError would be retried forever as a workflow-task failure; fail the workflow instead.
  if (!r.success) throw ApplicationFailure.nonRetryable(r.error.message, "ContractMismatch");
  return r.data;
}
