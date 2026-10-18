import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { parseJson, route } from "@/lib/lite/http";
import { getPolicy, savePolicy } from "@/lib/lite/recommendations";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json(await getPolicy(await requireViewer(req), params.projectId)));

export const PUT = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await savePolicy(viewer, params.projectId, await parseJson(req, z.unknown()), correlationId));
});
