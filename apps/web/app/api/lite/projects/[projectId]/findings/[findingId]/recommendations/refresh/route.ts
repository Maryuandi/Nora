import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { refreshRecommendations } from "@/lib/lite/recommendations";

export const POST = route<{ projectId: string; findingId: string }>(async ({ req, params, correlationId }) => {
  const res = await refreshRecommendations(await requireViewer(req), params.projectId, params.findingId, correlationId);
  return Response.json(res, { status: res.reused ? 200 : 202 });
});
