import { requireViewer } from "@/lib/lite/auth";
import { getDashboard } from "@/lib/lite/dashboard";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) => Response.json(await getDashboard(await requireViewer(req), params.projectId, params.runId)));
