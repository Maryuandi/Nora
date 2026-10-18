import { requireViewer } from "@/lib/lite/auth";
import { parseJson, route } from "@/lib/lite/http";
import { getProject, updateProject } from "@/lib/lite/projects";
import { ProjectPatch } from "@/lib/lite/schemas";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params, correlationId }) => Response.json(await getProject(await requireViewer(req), params.projectId, correlationId)));

export const PATCH = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await updateProject(viewer, params.projectId, await parseJson(req, ProjectPatch), correlationId));
});
