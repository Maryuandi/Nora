import { requireViewer } from "@/lib/lite/auth";
import { listRunFindings } from "@/lib/lite/dashboard";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) =>
  Response.json({ findings: await listRunFindings(await requireViewer(req), params.projectId, params.runId) }),
);
