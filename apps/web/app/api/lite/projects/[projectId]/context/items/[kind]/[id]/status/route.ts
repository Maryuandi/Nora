import { z } from "zod";
import { CONTEXT_KINDS } from "@nora/contracts";
import { requireViewer } from "@/lib/lite/auth";
import { transitionItem } from "@/lib/lite/context";
import { badRequest, parseJson, route } from "@/lib/lite/http";

export const POST = route<{ projectId: string; kind: string; id: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const kind = z.enum(CONTEXT_KINDS).safeParse(params.kind);
  if (!kind.success) throw badRequest("Jenis konfigurasi tidak dikenal");
  const { to } = await parseJson(req, z.object({ to: z.enum(["reviewed", "approved", "obsolete"]) }));
  return Response.json(await transitionItem(viewer, params.projectId, kind.data, params.id, to, correlationId));
});
