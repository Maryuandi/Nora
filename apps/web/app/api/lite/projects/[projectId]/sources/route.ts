import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { createSource, listSources } from "@/lib/lite/data";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ sources: await listSources(await requireViewer(req), params.projectId) }));

export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const { name } = await parseJson(req, z.object({ name: z.string().trim().min(1, "Nama sumber wajib diisi").max(160) }));
  return Response.json(await createSource(viewer, params.projectId, name, correlationId), { status: 201 });
});
