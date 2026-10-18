import { requireViewer } from "@/lib/lite/auth";
import { listInterpretations, requestInterpretation } from "@/lib/lite/interpretations";
import { route } from "@/lib/lite/http";

/** History for one target (finding, assessment, or comparison snapshot), with the project's LLM usage. */
export const GET = route<{ projectId: string }>(async ({ req, params }) =>
  Response.json(await listInterpretations(await requireViewer(req), params.projectId, new URL(req.url).searchParams.get("targetId") ?? "")),
);

/** Queues a draft; generation and checks run on the Temporal worker. */
export const POST = route<{ projectId: string }>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const body = await req.json().catch(() => null);
  return Response.json(await requestInterpretation(viewer, params.projectId, body, correlationId), { status: 202 });
});
