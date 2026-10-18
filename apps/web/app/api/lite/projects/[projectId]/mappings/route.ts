import { z } from "zod";
import { MappingConfig } from "@nora/contracts";
import { requireViewer } from "@/lib/lite/auth";
import { createMapping, listMappings } from "@/lib/lite/data";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => {
  const sourceId = new URL(req.url).searchParams.get("sourceId") ?? undefined;
  return Response.json({ mappings: await listMappings(await requireViewer(req), params.projectId, sourceId) });
});

export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({ sourceId: z.uuid(), config: MappingConfig, note: z.string().max(500).default("") }));
  const res = await createMapping(viewer, params.projectId, input.sourceId, input.config, input.note, correlationId);
  return Response.json(res, { status: res.created ? 201 : 200 });
});
