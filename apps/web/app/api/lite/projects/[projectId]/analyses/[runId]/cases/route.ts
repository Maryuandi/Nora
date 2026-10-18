import { requireViewer } from "@/lib/lite/auth";
import { CASE_SORTS, listCases } from "@/lib/lite/analysis";
import { route } from "@/lib/lite/http";

/** ?node=A or ?from=A&to=B (with __start/__end markers), sort=duration|events|start|wait, dir, page, size (≤100). */
export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) => {
  const q = new URL(req.url).searchParams;
  const sort = q.get("sort");
  return Response.json(await listCases(await requireViewer(req), params.projectId, params.runId, {
    node: q.get("node"), from: q.get("from"), to: q.get("to"),
    sort: sort && sort in CASE_SORTS ? (sort as keyof typeof CASE_SORTS) : undefined,
    dir: q.get("dir") === "asc" ? "asc" : "desc", page: Number(q.get("page")) || 1, size: Number(q.get("size")) || 25,
  }));
});
