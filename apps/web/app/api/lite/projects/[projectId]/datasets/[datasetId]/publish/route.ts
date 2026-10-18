import { requireViewer } from "@/lib/lite/auth";
import { publishDataset } from "@/lib/lite/data";
import { route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; datasetId: string }>(async ({ req, params, correlationId }) =>
  Response.json(await publishDataset(await requireViewer(req), params.projectId, params.datasetId, correlationId)),
);
