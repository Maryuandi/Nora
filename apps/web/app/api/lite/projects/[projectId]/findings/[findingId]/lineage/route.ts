import { requireViewer } from "@/lib/lite/auth";
import { graphStatus } from "@/lib/lite/graph";
import { route } from "@/lib/lite/http";
import { findingLineage } from "@/lib/lite/lineage";

/** Tree from authoritative records plus the projection status, so the UI can flag a lagging graph. */
export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params }) => {
  const tree = await findingLineage(await requireViewer(req), params.projectId, params.findingId);
  const g = await graphStatus(params.projectId);
  return Response.json({ tree, source: "postgresql", graph: { stale: g.stale, pending: g.pending, lagSeconds: g.lagSeconds, projectedSequence: g.projectedSequence } });
});
