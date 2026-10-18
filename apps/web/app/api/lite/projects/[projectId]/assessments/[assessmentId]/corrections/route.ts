import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { correctAssessment } from "@/lib/lite/assessments";
import { parseJson, route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; assessmentId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({
    kind: z.enum(["confirm", "correct"]), conclusion: z.string().nullish(), reason: z.string().max(1000), goldCandidate: z.boolean().default(false),
  }));
  return Response.json(await correctAssessment(viewer, params.projectId, params.assessmentId, input, correlationId), { status: 201 });
});
