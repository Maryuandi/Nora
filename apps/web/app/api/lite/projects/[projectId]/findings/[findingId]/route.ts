import { requireViewer } from "@/lib/lite/auth";
import { getFinding } from "@/lib/lite/findings";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params }) =>
  Response.json(await getFinding(await requireViewer(req), params.projectId, params.findingId)),
);
