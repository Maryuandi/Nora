import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { createUpload } from "@/lib/lite/data";
import { parseJson, route } from "@/lib/lite/http";

/** Returns a 15-minute signed PUT; the browser sends the file straight to object storage, never through Next.js. */
export const POST = route<{ projectId: string; sourceId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({ fileName: z.string().trim().min(1).max(260), size: z.number().int().positive() }));
  return Response.json(await createUpload(viewer, params.projectId, params.sourceId, input.fileName, input.size, correlationId), { status: 201 });
});
