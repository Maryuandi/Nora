import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { findingRecommendations } from "@/lib/lite/recommendations";

/** ?status=validated,needs_review (default: all) */
export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params }) => {
  const statuses = new URL(req.url).searchParams.get("status")?.split(",").filter(Boolean);
  return Response.json(await findingRecommendations(await requireViewer(req), params.projectId, params.findingId, statuses));
});
