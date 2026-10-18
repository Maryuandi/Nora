import { requireViewer } from "@/lib/lite/auth";
import { getBpmnXml } from "@/lib/lite/context";
import { route } from "@/lib/lite/http";

/** Raw BPMN XML for the read-only viewer, served as text (never rendered as HTML). */
export const GET = route<{ projectId: string; modelId: string }>(async ({ req, params }) => {
  const xml = await getBpmnXml(await requireViewer(req), params.projectId, params.modelId);
  return new Response(xml, { headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
});
