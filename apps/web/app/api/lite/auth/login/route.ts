import { createSession, sessionCookie, verifyPassword } from "@/lib/lite/auth";
import { db } from "@/lib/lite/db";
import { HttpError, parseJson, route } from "@/lib/lite/http";
import { LoginInput } from "@/lib/lite/schemas";

export const POST = route(async ({ req }) => {
  const input = await parseJson(req, LoginInput);
  const user = (await db().query<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM users WHERE email = $1 AND status = 'active'", [input.email],
  )).rows[0];
  // One generic message: never reveal whether the email or the password was wrong.
  const ok = await verifyPassword(input.password, user?.password_hash ?? null);
  if (!ok || !user) throw new HttpError(401, "invalid_credentials", "Email atau kata sandi salah");
  const session = await createSession(db(), user.id);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) } });
});
