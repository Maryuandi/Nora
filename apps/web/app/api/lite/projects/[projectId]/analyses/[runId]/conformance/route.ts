import { requireViewer } from "@/lib/lite/auth";
import { getDashboard } from "@/lib/lite/dashboard";
import { route } from "@/lib/lite/http";

/** BPMN token-replay result and rule evaluations for the run. */
export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) => {
  const d = await getDashboard(await requireViewer(req), params.projectId, params.runId);
  return Response.json({ bpmn: d.conformance, rules: d.rules });
});
