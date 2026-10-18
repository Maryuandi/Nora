import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { findingLineage } from "@/lib/lite/lineage";

export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params }) =>
  Response.json({ tree: await findingLineage(await requireViewer(req), params.projectId, params.findingId), source: "postgresql" }),
);
