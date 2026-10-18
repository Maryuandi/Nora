import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { saveBpmnMapping } from "@/lib/lite/context";
import { parseJson, route } from "@/lib/lite/http";

export const PUT = route<{ projectId: string; modelId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const { mapping } = await parseJson(req, z.object({ mapping: z.record(z.string(), z.array(z.string().max(200)).max(20)) }));
  return Response.json(await saveBpmnMapping(viewer, params.projectId, params.modelId, mapping, correlationId));
});
