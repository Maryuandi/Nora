import { ApplicationFailure, proxyActivities } from "@temporalio/workflow";
import { PingResult, PreviewMappingResult, PreviewRuleResult, TASK_QUEUE_PYTHON, type BuildDatasetInput, type IngestSnapshotInput, type PingRequest, type PreviewMappingInput, type PreviewRuleInput, type ValidateBpmnInput } from "@nora/contracts";
import type * as context from "./activities/context.ts";
import type * as data from "./activities/data.ts";

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

// Transient errors retry up to three times; corrupt files and schema errors are non-retryable in the activities.
const ts = proxyActivities<typeof data & typeof context>({ startToCloseTimeout: "30 minutes", retry: { maximumAttempts: 3, nonRetryableErrorTypes: ["Unauthorized", "NotFound", "SnapshotNotReady"] } });

const py = proxyActivities<{
  ingestSnapshot(input: IngestSnapshotInput): Promise<{ status: string }>;
  previewMapping(input: PreviewMappingInput): Promise<unknown>;
  buildDataset(input: BuildDatasetInput): Promise<{ qualityStatus: string }>;
}>({ taskQueue: TASK_QUEUE_PYTHON, startToCloseTimeout: "2 hours", retry: { maximumAttempts: 3, nonRetryableErrorTypes: ["ContractMismatch", "InvalidMapping", "ProjectKeyViolation"] } });

const pyPreview = proxyActivities<{ previewMapping(input: PreviewMappingInput): Promise<unknown>; previewRule(input: PreviewRuleInput): Promise<unknown>; validateBpmn(input: ValidateBpmnInput): Promise<unknown> }>({
  taskQueue: TASK_QUEUE_PYTHON, startToCloseTimeout: "60 seconds", retry: { maximumAttempts: 2, nonRetryableErrorTypes: ["ContractMismatch", "InvalidMapping"] },
});

const message = (err: unknown) => (err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err));

type Job = data.JobRef;

/** Workflow ID = snapshot ID, so a repeated "complete" call never starts a second ingest. */
export async function ingestSnapshotWorkflow(job: Job & { snapshotId: string }): Promise<string> {
  try {
    const v = await ts.verifySnapshot(job);
    if (v.kind === "reused") return "reused";
    if (v.kind === "rejected") return "rejected";
    await py.ingestSnapshot(v.input);
    return await ts.saveIngestReport({ ...job, stagingKey: v.input.stagingKey, reportKey: v.input.reportKey });
  } catch (err) {
    await ts.markSnapshotFailed({ ...job, message: message(err) });
    return "failed";
  }
}

export async function previewMappingWorkflow(input: PreviewMappingInput): Promise<PreviewMappingResult> {
  return PreviewMappingResult.parse(await pyPreview.previewMapping(input));
}

export async function prepareDatasetWorkflow(job: Job & { datasetVersionId: string }): Promise<string> {
  try {
    const input = await ts.loadDatasetBuild(job);
    if (!input) return "skipped";
    await py.buildDataset(input);
    return await ts.saveDatasetReport({ ...job, reportKey: input.reportKey });
  } catch (err) {
    await ts.markDatasetFailed({ ...job, message: message(err) });
    return "failed";
  }
}

export async function previewRuleWorkflow(input: PreviewRuleInput): Promise<PreviewRuleResult> {
  return PreviewRuleResult.parse(await pyPreview.previewRule(input));
}

export async function validateBpmnWorkflow(job: Job & ValidateBpmnInput): Promise<string> {
  try {
    const result = await pyPreview.validateBpmn({ projectId: job.projectId, modelId: job.modelId, objectKey: job.objectKey });
    return await ts.saveBpmnValidation({ ...job, result });
  } catch (err) {
    await ts.markBpmnInvalid({ ...job, message: message(err) });
    return "invalid";
  }
}
