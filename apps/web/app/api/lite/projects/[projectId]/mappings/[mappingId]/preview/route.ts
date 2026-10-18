import { z } from "zod";
import { MappingConfig } from "@nora/contracts";
import { requireViewer } from "@/lib/lite/auth";
import { previewMapping } from "@/lib/lite/data";
import { badRequest, parseJson, route } from "@/lib/lite/http";

/** Preview of 50 mapped events. `mappingId = draft` previews an unsaved config passed in the body. */
export const POST = route<{ projectId: string; mappingId: string }>(async ({ req, params }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({ snapshotId: z.uuid(), config: MappingConfig.optional() }));
  if (params.mappingId === "draft" && !input.config) throw badRequest("config wajib untuk pratinjau draft");
  return Response.json(await previewMapping(viewer, params.projectId, params.mappingId, input.snapshotId, params.mappingId === "draft" ? input.config : undefined));
});
