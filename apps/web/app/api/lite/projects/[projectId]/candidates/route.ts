import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { parseJson, route } from "@/lib/lite/http";
import { addAnalystCandidate } from "@/lib/lite/recommendations";

/** Analyst addition; it is checked and assessed on the next refresh like any catalog candidate. */
export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await addAnalystCandidate(viewer, params.projectId, await parseJson(req, z.unknown()), correlationId), { status: 201 });
});
