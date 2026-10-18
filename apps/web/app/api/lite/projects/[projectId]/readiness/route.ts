import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { loadReadiness } from "@/lib/lite/readiness";

export const GET = route<{ projectId: string }>(async ({ req, params }) => Response.json(await loadReadiness(await requireViewer(req), params.projectId)));
