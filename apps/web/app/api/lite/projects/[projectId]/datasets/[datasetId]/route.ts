import { requireViewer } from "@/lib/lite/auth";
import { getDataset } from "@/lib/lite/data";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; datasetId: string }>(async ({ req, params }) =>
  Response.json(await getDataset(await requireViewer(req), params.projectId, params.datasetId)),
);
