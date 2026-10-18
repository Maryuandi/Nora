import { requireViewer } from "@/lib/lite/auth";
import { listBottlenecks } from "@/lib/lite/dashboard";
import { route } from "@/lib/lite/http";

/** Transitions ranked by total wait contribution, with the bottleneck flag from the run's thresholds. */
export const GET = route<{ projectId: string; runId: string }>(async ({ req, params }) =>
  Response.json({ transitions: await listBottlenecks(await requireViewer(req), params.projectId, params.runId) }),
);
