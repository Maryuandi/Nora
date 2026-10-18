import { requireViewer } from "@/lib/lite/auth";
import { getDashboard } from "@/lib/lite/dashboard";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) => {
  const d = await getDashboard(await requireViewer(req), params.projectId, params.runId);
  return Response.json({ rework: d.rework, metrics: { share: d.metrics.rework_case_share ?? null, repetitions: d.metrics.rework_repetitions ?? null } });
});
