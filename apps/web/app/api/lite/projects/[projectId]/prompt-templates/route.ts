import { requireViewer } from "@/lib/lite/auth";
import { createPromptTemplate, listPromptTemplates } from "@/lib/lite/interpretations";
import { route } from "@/lib/lite/http";

/** Advanced: versioned prompt templates per target type and audience. */
export const GET = route<{ projectId: string }>(async ({ req, params }) => Response.json(await listPromptTemplates(await requireViewer(req), params.projectId)));

export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const body = await req.json().catch(() => null);
  return Response.json(await createPromptTemplate(viewer, params.projectId, body, correlationId), { status: 201 });
});
