import "server-only";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { TASK_QUEUE_TS } from "@nora/contracts";
import { getTemporalClient } from "@/lib/temporal";
import { HttpError } from "./http";

/** Starts a workflow whose ID is the domain object ID; a repeat start is a no-op, not an error. */
export async function startJob(workflow: string, workflowId: string, args: unknown[]): Promise<void> {
  let client;
  try {
    client = await getTemporalClient();
  } catch {
    throw new HttpError(503, "temporal_unavailable", "Layanan pemrosesan (Temporal) tidak tersedia; coba lagi nanti");
  }
  try {
    await client.workflow.start(workflow, { taskQueue: TASK_QUEUE_TS, workflowId, args });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) return;
    throw err;
  }
}

/** Runs a short workflow and waits for its result (mapping preview). */
export async function runJob<T>(workflow: string, workflowId: string, args: unknown[], timeoutMs = 30_000): Promise<T> {
  let client;
  try {
    client = await getTemporalClient();
  } catch {
    throw new HttpError(503, "temporal_unavailable", "Layanan pemrosesan (Temporal) tidak tersedia; coba lagi nanti");
  }
  const handle = await client.workflow.start(workflow, { taskQueue: TASK_QUEUE_TS, workflowId, args, workflowExecutionTimeout: timeoutMs });
  try {
    return (await handle.result()) as T;
  } catch (err) {
    const cause = (err as { cause?: { cause?: { message?: string }; message?: string } }).cause;
    throw new HttpError(422, "job_failed", cause?.cause?.message ?? cause?.message ?? "Pemrosesan gagal");
  }
}
