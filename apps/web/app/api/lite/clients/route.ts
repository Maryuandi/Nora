import { requireViewer } from "@/lib/lite/auth";
import { parseJson, route } from "@/lib/lite/http";
import { createClient, listClients } from "@/lib/lite/projects";
import { ClientInput } from "@/lib/lite/schemas";

export const GET = route(async ({ req }) => Response.json({ clients: await listClients(await requireViewer(req)) }));

export const POST = route(async ({ req, correlationId }) => {
  const viewer = await requireViewer(req);
  return Response.json(await createClient(viewer, await parseJson(req, ClientInput), correlationId), { status: 201 });
});
