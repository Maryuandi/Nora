import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { acceptInterpretation } from "@/lib/lite/interpretations";
import { parseJson, route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; interpretationId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const { note } = await parseJson(req, z.object({ note: z.string().max(1000).nullish() }));
  return Response.json(await acceptInterpretation(viewer, params.projectId, params.interpretationId, note?.trim() || null, correlationId));
});
