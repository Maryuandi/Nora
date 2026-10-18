import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { getCandidate } from "@/lib/lite/recommendations";

export const GET = route<{ projectId: string; linkId: string }>(async ({ req, params }) => Response.json(await getCandidate(await requireViewer(req), params.projectId, params.linkId)));
