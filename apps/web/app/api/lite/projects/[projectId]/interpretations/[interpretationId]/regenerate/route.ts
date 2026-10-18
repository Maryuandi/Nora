import { requireViewer } from "@/lib/lite/auth";
import { regenerateInterpretation } from "@/lib/lite/interpretations";
import { route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; interpretationId: string }>(async ({ req, params, correlationId }) =>
  Response.json(await regenerateInterpretation(await requireViewer(req), params.projectId, params.interpretationId, correlationId), { status: 202 }),
);
