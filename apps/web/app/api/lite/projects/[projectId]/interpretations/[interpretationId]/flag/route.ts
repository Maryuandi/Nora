import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { flagInterpretation } from "@/lib/lite/interpretations";
import { parseJson, route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; interpretationId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const { reason } = await parseJson(req, z.object({ reason: z.string().trim().min(3, "Jelaskan masalahnya").max(1000) }));
  return Response.json(await flagInterpretation(viewer, params.projectId, params.interpretationId, reason, correlationId));
});
