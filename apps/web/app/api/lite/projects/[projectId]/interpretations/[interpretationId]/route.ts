import { requireViewer } from "@/lib/lite/auth";
import { getInterpretation } from "@/lib/lite/interpretations";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; interpretationId: string }>(async ({ req, params }) =>
  Response.json(await getInterpretation(await requireViewer(req), params.projectId, params.interpretationId)),
);
