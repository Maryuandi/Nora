import { PingRequest, TASK_QUEUE_TS } from "@nora/contracts";
import { getTemporalClient } from "@/lib/temporal";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_request", issues: ["body must be JSON"] }, { status: 400 });
  }
  const parsed = PingRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const workflowId = `ping-${crypto.randomUUID()}`;
  try {
    const client = await getTemporalClient();
    await client.workflow.start("pingWorkflow", {
      taskQueue: TASK_QUEUE_TS,
      workflowId,
      args: [parsed.data],
    });
  } catch {
    return Response.json({ error: "temporal_unavailable" }, { status: 503 });
  }
  return Response.json({ workflowId, status: "running" }, { status: 202 });
}
