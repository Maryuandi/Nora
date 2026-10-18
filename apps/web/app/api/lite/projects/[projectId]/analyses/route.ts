import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { listRuns, requestAnalysis } from "@/lib/lite/analysis";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ runs: await listRuns(await requireViewer(req), params.projectId) }));

/** 202 with the run ID; a run with the same analysis key is reused (200). */
export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({ filterSpec: z.unknown().optional(), datasetVersionId: z.uuid().optional(), contextPackageId: z.uuid().optional() }));
  const res = await requestAnalysis(viewer, params.projectId, input, correlationId);
  return Response.json(res, { status: res.reused ? 200 : 202 });
});
