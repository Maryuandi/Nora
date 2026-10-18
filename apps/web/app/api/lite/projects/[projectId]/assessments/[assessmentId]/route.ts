import { requireViewer } from "@/lib/lite/auth";
import { getAssessment } from "@/lib/lite/assessments";
import { route } from "@/lib/lite/http";

/** Detail with criteria, bundle link and raw-response metadata (keys only; provider secrets never leave the worker). */
export const GET = route<{ projectId: string; assessmentId: string }>(async ({ req, params }) =>
  Response.json(await getAssessment(await requireViewer(req), params.projectId, params.assessmentId)),
);
