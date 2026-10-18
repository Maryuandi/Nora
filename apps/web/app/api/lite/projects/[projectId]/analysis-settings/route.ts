import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { getSettings, saveSettings } from "@/lib/lite/dashboard";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json(await getSettings(await requireViewer(req), params.projectId)));

export const PUT = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await saveSettings(viewer, params.projectId, await parseJson(req, z.unknown()), correlationId));
});
