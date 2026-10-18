import { requireViewer } from "@/lib/lite/auth";
import { getBundle } from "@/lib/lite/graph";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; bundleId: string }>(async ({ req, params, correlationId }) =>
  Response.json(await getBundle(await requireViewer(req), params.projectId, params.bundleId, correlationId)),
);
