import { CONTEXT_KINDS } from "@nora/contracts";
import { requireViewer } from "@/lib/lite/auth";
import { contextSummary } from "@/lib/lite/context";
import { itemRoutes } from "@/lib/lite/context-routes";
import { route } from "@/lib/lite/http";

/** GET: wizard summary; POST: save any context item (body.kind). */
export const GET = route<{ projectId: string }>(async ({ req, params }) => Response.json(await contextSummary(await requireViewer(req), params.projectId)));
export const { POST } = itemRoutes(CONTEXT_KINDS);
