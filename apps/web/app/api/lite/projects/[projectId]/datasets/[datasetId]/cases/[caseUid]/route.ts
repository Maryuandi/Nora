import { requireViewer } from "@/lib/lite/auth";
import { caseTimeline } from "@/lib/lite/analysis";
import { route } from "@/lib/lite/http";

/** One case only: its events with raw/canonical label, time, resource, attributes, quality flags and source row. */
export const GET = route<{ projectId: string; datasetId: string; caseUid: string }>(async ({ req, params }) =>
  Response.json(await caseTimeline(await requireViewer(req), params.projectId, params.datasetId, params.caseUid)),
);
