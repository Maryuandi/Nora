import { requireViewer } from "@/lib/lite/auth";
import { parseJson, route } from "@/lib/lite/http";
import { changeStatus } from "@/lib/lite/projects";
import { StatusInput } from "@/lib/lite/schemas";

export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await changeStatus(viewer, params.projectId, await parseJson(req, StatusInput), correlationId));
});
