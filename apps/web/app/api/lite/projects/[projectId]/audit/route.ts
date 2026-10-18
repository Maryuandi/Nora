import { requireViewer } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";
import { listAudit } from "@/lib/lite/projects";

export const GET = route<{ projectId: string }>(async ({ req, params }) => {
  const before = Number(new URL(req.url).searchParams.get("before")) || undefined;
  return Response.json({ events: await listAudit(await requireViewer(req), params.projectId, { before }) });
});
