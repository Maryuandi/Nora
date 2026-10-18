import { requireViewer } from "@/lib/lite/auth";
import { freezeAndActivate, listPackages } from "@/lib/lite/context";
import { route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ packages: await listPackages(await requireViewer(req), params.projectId) }));

/** Freezes the approved configuration into an immutable package and activates it. */
export const POST = route<P>(async ({ req, params, correlationId }) => {
  const res = await freezeAndActivate(await requireViewer(req), params.projectId, correlationId);
  return Response.json(res, { status: res.created ? 201 : 200 });
});
