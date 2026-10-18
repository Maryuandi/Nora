import { requireViewer } from "@/lib/lite/auth";
import { graphStatusFor } from "@/lib/lite/graph";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string }>(async ({ req, params }) => Response.json(await graphStatusFor(await requireViewer(req), params.projectId)));
