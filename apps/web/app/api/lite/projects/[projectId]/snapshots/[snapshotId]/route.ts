import { requireViewer } from "@/lib/lite/auth";
import { getSnapshot } from "@/lib/lite/data";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; snapshotId: string }>(async ({ req, params }) =>
  Response.json(await getSnapshot(await requireViewer(req), params.projectId, params.snapshotId)),
);
