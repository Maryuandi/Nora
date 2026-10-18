import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { createSpec, listSpecs } from "@/lib/lite/assessments";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ specs: await listSpecs(await requireViewer(req), params.projectId) }));

export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await createSpec(viewer, params.projectId, await parseJson(req, z.unknown()), correlationId), { status: 201 });
});
