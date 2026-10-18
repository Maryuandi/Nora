import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { requestAssessmentRun } from "@/lib/lite/assessments";
import { parseJson, route } from "@/lib/lite/http";

/** Manual trigger; the worker runs preconditions, evidence bundle and Jev calls in the background. */
export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const { findingId } = await parseJson(req, z.object({ findingId: z.uuid() }));
  const res = await requestAssessmentRun(viewer, params.projectId, findingId, correlationId);
  return Response.json(res, { status: res.reused ? 200 : 202 });
});
