import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { compareCandidates } from "@/lib/lite/recommendations";

/** ?ids=a,b[,c,d] — returns (and stores once) an immutable comparison snapshot. */
export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params, correlationId }) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  return Response.json(await compareCandidates(await requireViewer(req), params.projectId, params.findingId, ids, correlationId));
});
