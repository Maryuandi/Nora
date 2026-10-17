import { WorkflowNotFoundError } from "@temporalio/client";
import { getTemporalClient } from "@/lib/temporal";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const handle = (await getTemporalClient()).workflow.getHandle(id);
    const { status } = await handle.describe();
    switch (status.name) {
      case "RUNNING":
        return Response.json({ status: "running" });
      case "COMPLETED":
        return Response.json({ status: "completed", result: await handle.result() });
      default:
        // FAILED, TERMINATED, TIMED_OUT, CANCELLED: result() rejects with the cause.
        return Response.json({ status: "failed", error: await handle.result().then(() => status.name, errorMessage) });
    }
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ error: "temporal_unavailable" }, { status: 503 });
  }
}

// Walk to the deepest cause: the top-level message is just "Activity task failed".
const errorMessage = (err: unknown): string => {
  let e = err;
  while (e instanceof Error && e.cause instanceof Error) e = e.cause;
  return e instanceof Error ? e.message : String(e);
};
