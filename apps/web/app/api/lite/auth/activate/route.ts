import { audit } from "@/lib/lite/audit";
import { createSession, hashPassword, sessionCookie, tokenHash } from "@/lib/lite/auth";
import { withTx } from "@/lib/lite/db";
import { HttpError, parseJson, route } from "@/lib/lite/http";
import { ActivateInput } from "@/lib/lite/schemas";

/** Single-use: the token is marked used in the same transaction that sets the password. */
export const POST = route(async ({ req, correlationId }) => {
  const input = await parseJson(req, ActivateInput);
  const passwordHash = await hashPassword(input.password);
  const session = await withTx(async (tx) => {
    const t = (await tx.query<{ user_id: string }>(
      "UPDATE activation_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id",
      [tokenHash(input.token)],
    )).rows[0];
    if (!t) throw new HttpError(410, "token_invalid", "Tautan aktivasi tidak berlaku atau sudah dipakai");
    await tx.query("UPDATE users SET name = $2, password_hash = $3, status = 'active', updated_at = now() WHERE id = $1 AND status = 'invited'", [t.user_id, input.name, passwordHash]);
    await audit(tx, { projectId: null, actorId: t.user_id, action: "user.activate", objectType: "user", objectId: t.user_id, correlationId });
    return createSession(tx, t.user_id);
  });
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) } });
});
