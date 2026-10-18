import { requireViewer } from "@/lib/lite/auth";
import { listBundles } from "@/lib/lite/graph";
import { badRequest, route } from "@/lib/lite/http";

/** Read-only list for a target; bundles are created by the worker's internal retrieval service only. */
export const GET = route<{ projectId: string }>(async ({ req, params }) => {
  const targetId = new URL(req.url).searchParams.get("targetId");
  if (!targetId || !/^[0-9a-f-]{36}$/i.test(targetId)) throw badRequest("targetId wajib diisi");
  return Response.json({ bundles: await listBundles(await requireViewer(req), params.projectId, targetId) });
});
