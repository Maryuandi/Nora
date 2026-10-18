import { ApplicationFailure, executeChild, proxyActivities } from "@temporalio/workflow";
import { PingResult, PreviewMappingResult, PreviewRuleResult, TASK_QUEUE_PYTHON, type BuildDatasetInput, type IngestSnapshotInput, type PingRequest, type PreviewMappingInput, type MonitoringInput, type PreviewRuleInput, type ProcessAnalysisInput, type ValidateBpmnInput } from "@nora/contracts";
import type * as analysis from "./activities/analysis.ts";
import type * as assessment from "./activities/assessment.ts";
import type * as context from "./activities/context.ts";
import type * as monitoring from "./activities/monitoring.ts";
import type * as recommendation from "./activities/recommendation.ts";
import type * as data from "./activities/data.ts";
import type * as evidence from "./activities/evidence.ts";
import type * as graph from "./activities/graph.ts";

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
const ts = proxyActivities<typeof data & typeof context & typeof analysis & typeof monitoring & typeof graph & typeof evidence & typeof assessment & typeof recommendation>({ startToCloseTimeout: "30 minutes", retry: { maximumAttempts: 3, nonRetryableErrorTypes: ["Unauthorized", "NotFound", "SnapshotNotReady"] } });

const py = proxyActivities<{
  ingestSnapshot(input: IngestSnapshotInput): Promise<{ status: string }>;
  previewMapping(input: PreviewMappingInput): Promise<unknown>;
  buildDataset(input: BuildDatasetInput): Promise<{ qualityStatus: string }>;
  runProcessAnalysis(input: ProcessAnalysisInput): Promise<unknown>;
  runMonitoring(input: MonitoringInput): Promise<{ resultKey: string; findingCasesKey: string }>;
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

/** Workflow ID = analysis run ID. The map is result_ready before any later stage runs. */
export async function processAnalysisWorkflow(job: analysis.RunJob): Promise<string> {
  try {
    const input = await ts.loadAnalysisInput(job);
    if (!input) return "skipped";
    const manifest = await py.runProcessAnalysis(input);
    await ts.saveProcessResult({ ...job, manifest });
    // Second stage: a failure here leaves the map usable and marks only the dashboard section as failed.
    try {
      const mInput = await ts.loadMonitoringInput(job);
      if (mInput) await ts.saveMonitoringResult({ ...job, manifest: await py.runMonitoring(mInput) });
    } catch (err) {
      await ts.markMonitoringFailed({ ...job, message: message(err) });
    }
    await ts.markAnalysisCompleted(job);
    return "completed";
  } catch (err) {
    await ts.markAnalysisFailed({ ...job, message: message(err) });
    return "failed";
  }
}

/** Started by a Temporal Schedule every few seconds; projects every project with pending outbox events. */
export async function graphProjectionSweepWorkflow(): Promise<number> {
  let n = 0;
  for (const projectId of await ts.pendingGraphProjects()) n += (await ts.projectGraph(projectId)).projected;
  return n;
}

/** Internal retrieval service: model-facing features call this; there is no public free-form endpoint. */
export async function evidenceBundleWorkflow(request: unknown): Promise<Awaited<ReturnType<typeof evidence.buildEvidenceBundle>>> {
  return ts.buildEvidenceBundle(request);
}

const jev = proxyActivities<typeof assessment>({
  startToCloseTimeout: "10 minutes",
  // Provider outages and malformed responses retry a few times; config/budget/auth problems do not.
  retry: { maximumAttempts: 3, initialInterval: "2 seconds", nonRetryableErrorTypes: ["JevNotConfigured", "BudgetExceeded", "ProviderRejected", "Unauthorized", "NotFound"] },
});

/** Precondition check → evidence bundle → per-candidate Noul/Score/Choice → code aggregation. */
export async function assessmentWorkflow(job: assessment.AssessmentJob): Promise<string> {
  try {
    const { eligible } = await jev.startAssessmentRun(job);
    if (!eligible.length) {
      await jev.completeAssessmentRun(job);
      return "no_candidates";
    }
    const bundle = await ts.buildEvidenceBundle({ projectId: job.projectId, targetType: "finding", targetId: job.findingId, purpose: "jev_assessment", requestedBy: job.requestedBy, correlationId: job.correlationId });
    await jev.attachBundle({ ...job, bundleId: bundle.bundleId });
    for (const linkId of eligible) {
      const { assessmentId, reused } = await jev.createAssessment({ ...job, linkId, bundleId: bundle.bundleId });
      if (reused) continue;
      try {
        await jev.runAssessment({ ...job, assessmentId });
      } catch (err) {
        await jev.failAssessment({ ...job, assessmentId, message: message(err) });
      }
    }
    await jev.completeAssessmentRun(job);
    return "completed";
  } catch (err) {
    await jev.completeAssessmentRun({ ...job, error: message(err) });
    return "failed";
  }
}

/** Build/validate a finding's candidate set: Jev assessment first (child), then deterministic checks and scores. */
export async function recommendationRefreshWorkflow(job: recommendation.RefreshJob): Promise<string> {
  try {
    const { assessmentRunId } = await ts.startRefresh(job);
    await executeChild(assessmentWorkflow, {
      workflowId: `assessment-${assessmentRunId}`,
      args: [{ projectId: job.projectId, findingId: job.findingId, assessmentRunId, requestedBy: job.requestedBy, correlationId: job.correlationId }],
    });
    await ts.validateCandidates(job);
    return "completed";
  } catch (err) {
    await ts.failRefresh({ ...job, message: message(err) });
    return "failed";
  }
}
