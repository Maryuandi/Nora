import { requireViewer } from "@/lib/lite/auth";
import { approveBpmn } from "@/lib/lite/context";
import { route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; modelId: string }>(async ({ req, params, correlationId }) =>
  Response.json(await approveBpmn(await requireViewer(req), params.projectId, params.modelId, correlationId)),
);
