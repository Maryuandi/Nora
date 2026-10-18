import { requireViewer } from "@/lib/lite/auth";
import { listVariants } from "@/lib/lite/analysis";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) =>
  Response.json({ variants: await listVariants(await requireViewer(req), params.projectId, params.runId) }),
);
