import { requireViewer } from "@/lib/lite/auth";
import { findingAssessments } from "@/lib/lite/assessments";
import { route } from "@/lib/lite/http";

export const GET = route<{ projectId: string; findingId: string }>(async ({ req, params }) =>
  Response.json(await findingAssessments(await requireViewer(req), params.projectId, params.findingId)),
);
