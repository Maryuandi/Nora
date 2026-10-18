import { requireViewer } from "@/lib/lite/auth";
import { completeUpload } from "@/lib/lite/data";
import { route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; snapshotId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const res = await completeUpload(viewer, params.projectId, params.snapshotId, correlationId);
  return Response.json({ snapshotId: res.snapshotId, status: "validating" }, { status: 202 });
});
