import { requireViewer } from "@/lib/lite/auth";
import { parseJson, route } from "@/lib/lite/http";
import { createProject, listProjects } from "@/lib/lite/projects";
import { ProjectInput } from "@/lib/lite/schemas";

export const GET = route(async ({ req, correlationId }) => Response.json({ projects: await listProjects(await requireViewer(req), correlationId) }));

export const POST = route(async ({ req, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await createProject(viewer, await parseJson(req, ProjectInput), correlationId), { status: 201 });
});
