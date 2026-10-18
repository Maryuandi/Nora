import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { listDatasets, prepareDataset } from "@/lib/lite/data";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ datasets: await listDatasets(await requireViewer(req), params.projectId) }));

export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({ snapshotId: z.uuid(), mappingVersionId: z.uuid() }));
  const res = await prepareDataset(viewer, params.projectId, input.snapshotId, input.mappingVersionId, correlationId);
  return Response.json(res, { status: res.reused ? 200 : 202 });
});
