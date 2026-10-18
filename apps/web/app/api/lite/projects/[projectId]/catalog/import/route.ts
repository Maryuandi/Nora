import { requireViewer } from "@/lib/lite/auth";
import { importCatalog } from "@/lib/lite/context";
import { parseJson, route } from "@/lib/lite/http";
import { z } from "zod";

/** Imports a user-supplied reference catalog (JSON). Imported items start as drafts for review. */
export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await importCatalog(viewer, params.projectId, await parseJson(req, z.unknown()), correlationId), { status: 201 });
});
