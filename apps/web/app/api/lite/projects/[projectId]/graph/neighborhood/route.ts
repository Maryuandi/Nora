import { requireViewer } from "@/lib/lite/auth";
import { graphNeighborhood } from "@/lib/lite/graph";
import { route } from "@/lib/lite/http";

/** ?type=Finding&id=…&depth=1..3 — bounded and project-scoped; no query language is accepted. */
export const GET = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const q = new URL(req.url).searchParams;
  return Response.json(await graphNeighborhood(await requireViewer(req), params.projectId, q.get("type") ?? "", q.get("id") ?? "", Number(q.get("depth")) || 2, correlationId));
});
