import { dbJson } from "@nora/db";
import { ValidateBpmnResult } from "@nora/contracts";
import { audit, db } from "../db.ts";
import type { JobRef } from "./data.ts";

export async function saveBpmnValidation(job: JobRef & { modelId: string; result: unknown }): Promise<string> {
  const r = ValidateBpmnResult.parse(job.result);
  const status = r.valid ? "valid" : "invalid";
  await db().bpmnModel.updateMany({
    where: { id: job.modelId, projectId: job.projectId },
    data: { validationStatus: status, readable: r.readable, validationError: r.error, tasks: r.tasks, elementCount: r.elementCount, pm4pySummary: dbJson(r.pm4py) },
  });
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "bpmn.validate", objectType: "bpmn_model", objectId: job.modelId, result: r.valid ? "success" : "failed", correlationId: job.correlationId, metadata: { tasks: r.tasks.length, error: r.error } });
  return status;
}

export async function markBpmnInvalid(job: JobRef & { modelId: string; message: string }): Promise<void> {
  await db().bpmnModel.updateMany({ where: { id: job.modelId, projectId: job.projectId, validationStatus: "pending" }, data: { validationStatus: "invalid", validationError: job.message.slice(0, 500) } });
}
