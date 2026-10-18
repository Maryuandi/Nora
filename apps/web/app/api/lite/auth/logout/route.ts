import { clearSessionCookie, revokeSession } from "@/lib/lite/auth";
import { route } from "@/lib/lite/http";

export const POST = route(async ({ req }) => {
  await revokeSession(req);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});
