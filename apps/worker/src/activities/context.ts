import { ValidateBpmnResult } from "@nora/contracts";
import { audit, db } from "../db.ts";
import type { JobRef } from "./data.ts";

export async function saveBpmnValidation(job: JobRef & { modelId: string; result: unknown }): Promise<string> {
  const r = ValidateBpmnResult.parse(job.result);
  const status = r.valid ? "valid" : "invalid";
  await db().query(
    `UPDATE bpmn_models SET validation_status = $3, readable = $4, validation_error = $5, tasks = $6, element_count = $7, pm4py_summary = $8
      WHERE id = $1 AND project_id = $2`,
    [job.modelId, job.projectId, status, r.readable, r.error, JSON.stringify(r.tasks), r.elementCount, r.pm4py ? JSON.stringify(r.pm4py) : null],
  );
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "bpmn.validate", objectType: "bpmn_model", objectId: job.modelId, result: r.valid ? "success" : "failed", correlationId: job.correlationId, metadata: { tasks: r.tasks.length, error: r.error } });
  return status;
}

export async function markBpmnInvalid(job: JobRef & { modelId: string; message: string }): Promise<void> {
  await db().query("UPDATE bpmn_models SET validation_status = 'invalid', validation_error = $3 WHERE id = $1 AND project_id = $2 AND validation_status = 'pending'", [job.modelId, job.projectId, job.message.slice(0, 500)]);
}
