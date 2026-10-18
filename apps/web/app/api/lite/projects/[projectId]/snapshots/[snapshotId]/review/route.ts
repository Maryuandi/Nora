import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { reviewSnapshot } from "@/lib/lite/data";
import { parseJson, route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; snapshotId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const { action } = await parseJson(req, z.object({ action: z.enum(["approve", "cancel"]) }));
  return Response.json(await reviewSnapshot(viewer, params.projectId, params.snapshotId, action, correlationId));
});
