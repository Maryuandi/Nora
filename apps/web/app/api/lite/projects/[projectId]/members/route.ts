import { requireViewer } from "@/lib/lite/auth";
import { badRequest, parseJson, route } from "@/lib/lite/http";
import { addMember, listMembers, removeMember } from "@/lib/lite/projects";
import { MemberInput } from "@/lib/lite/schemas";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ members: await listMembers(await requireViewer(req), params.projectId) }));

export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const res = await addMember(viewer, params.projectId, await parseJson(req, MemberInput), correlationId);
  const activationUrl = res.activationToken ? `${new URL(req.url).origin}/lite/activate?token=${res.activationToken}` : null;
  return Response.json({ userId: res.userId, activationUrl }, { status: 201 });
});

export const DELETE = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) throw badRequest("userId wajib diisi");
  await removeMember(viewer, params.projectId, userId, correlationId);
  return new Response(null, { status: 204 });
});
