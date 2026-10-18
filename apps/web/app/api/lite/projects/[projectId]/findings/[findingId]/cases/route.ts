import { requireViewer } from "@/lib/lite/auth";
import { listFindingCases } from "@/lib/lite/findings";
import { route } from "@/lib/lite/http";

/** sort=support|duration|events|start|additional (rework), dir, page, size ≤ 100. */
export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params }) => {
  const q = new URL(req.url).searchParams;
  return Response.json(await listFindingCases(await requireViewer(req), params.projectId, params.findingId, {
    sort: q.get("sort") ?? undefined, dir: q.get("dir") ?? undefined, page: Number(q.get("page")) || 1, size: Number(q.get("size")) || 25,
  }));
});
