import { requireViewer } from "@/lib/lite/auth";
import { listFindings } from "@/lib/lite/findings";
import { route } from "@/lib/lite/http";

/** ?run=&type=a,b&sort=severity|contribution|cases|newest — default types: bottleneck and rework. */
export const GET = route<{ projectId: string }>(async ({ req, params }) => {
  const q = new URL(req.url).searchParams;
  return Response.json(await listFindings(await requireViewer(req), params.projectId, {
    runId: q.get("run"), types: q.get("type")?.split(",").filter(Boolean), sort: q.get("sort") ?? undefined,
  }));
});
