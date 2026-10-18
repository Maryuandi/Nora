import { z } from "zod";
import { BuildDatasetInput, BuildDatasetReport, IngestReport, IngestSnapshotInput, PreviewMappingInput, PreviewMappingResult } from "./dataset.ts";
import { PreviewRuleInput, PreviewRuleResult, ValidateBpmnInput, ValidateBpmnResult } from "./context.ts";
import { PingRequest, PingResult } from "./ping.ts";

export * from "./context.ts";
export * from "./dataset.ts";
export * from "./ping.ts";
export * from "./queues.ts";

/** JSON Schema per contract, keyed by file name without extension. */
export function exportSchemas(): Record<string, object> {
  return {
    PingRequest: z.toJSONSchema(PingRequest),
    PingResult: z.toJSONSchema(PingResult),
    IngestSnapshotInput: z.toJSONSchema(IngestSnapshotInput),
    IngestReport: z.toJSONSchema(IngestReport),
    PreviewMappingInput: z.toJSONSchema(PreviewMappingInput),
    PreviewMappingResult: z.toJSONSchema(PreviewMappingResult),
    BuildDatasetInput: z.toJSONSchema(BuildDatasetInput),
    BuildDatasetReport: z.toJSONSchema(BuildDatasetReport),
    ValidateBpmnInput: z.toJSONSchema(ValidateBpmnInput),
    ValidateBpmnResult: z.toJSONSchema(ValidateBpmnResult),
    PreviewRuleInput: z.toJSONSchema(PreviewRuleInput),
    PreviewRuleResult: z.toJSONSchema(PreviewRuleResult),
  };
}
