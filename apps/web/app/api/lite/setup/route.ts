import { audit } from "@/lib/lite/audit";
import { createSession, hashPassword, sessionCookie } from "@/lib/lite/auth";
import { withTx } from "@/lib/lite/db";
import { conflict, parseJson, route } from "@/lib/lite/http";
import { SetupInput } from "@/lib/lite/schemas";

/** Creates the first administrator; refused once any account exists. */
export const POST = route(async ({ req, correlationId }) => {
  const input = await parseJson(req, SetupInput);
  const passwordHash = await hashPassword(input.password);
  const session = await withTx(async (tx) => {
    await tx.query("LOCK TABLE users IN EXCLUSIVE MODE");
    if ((await tx.query("SELECT 1 FROM users LIMIT 1")).rows.length) throw conflict("Penyiapan awal sudah dilakukan");
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO users (email, name, password_hash, global_role, status) VALUES ($1, $2, $3, 'admin', 'active') RETURNING id",
      [input.email, input.name, passwordHash],
    );
    await audit(tx, { projectId: null, actorId: rows[0]!.id, action: "setup.admin", objectType: "user", objectId: rows[0]!.id, correlationId });
    return createSession(tx, rows[0]!.id);
  });
  return Response.json({ ok: true }, { status: 201, headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) } });
});
