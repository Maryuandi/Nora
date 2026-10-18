import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { listBpmn, uploadBpmn } from "@/lib/lite/context";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ models: await listBpmn(await requireViewer(req), params.projectId) }));

export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({ name: z.string().trim().min(1).max(160), fileName: z.string().trim().min(1).max(260), xml: z.string().min(20) }));
  return Response.json(await uploadBpmn(viewer, params.projectId, input, correlationId), { status: 202 });
});
