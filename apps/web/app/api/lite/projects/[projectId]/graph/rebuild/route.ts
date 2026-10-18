import { requireViewer } from "@/lib/lite/auth";
import { requestRebuild } from "@/lib/lite/graph";
import { route } from "@/lib/lite/http";

export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) =>
  Response.json(await requestRebuild(await requireViewer(req), params.projectId, correlationId), { status: 202 }),
);
