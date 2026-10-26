import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Db } from "@nora/db";
import type { z } from "zod";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { conflict, HttpError } from "./http";
import { hashPassword, verifyPassword } from "./password";
import type { ActivateInput, LoginInput, SetupInput } from "./schemas";

export const SESSION_COOKIE = "nora_session";
const SESSION_DAYS = 14;

export interface Viewer {
  id: string;
  email: string;
  name: string;
  globalRole: "admin" | "member";
}

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(q: Db, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

async function viewerForToken(token: string | undefined): Promise<Viewer | null> {
  if (!token) return null;
  const s = await db().session.findFirst({
    where: { tokenHash: tokenHash(token), revokedAt: null, expiresAt: { gt: new Date() }, user: { status: "active" } },
    select: { user: { select: { id: true, email: true, name: true, globalRole: true } } },
  });
  // global_role is CHECK-constrained to these two values.
  return s ? { ...s.user, globalRole: s.user.globalRole as Viewer["globalRole"] } : null;
}

function tokenFromRequest(req: Request): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=");
  }
  return undefined;
}

/** For server components and layouts. */
export async function currentViewer(): Promise<Viewer | null> {
  return viewerForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For the tRPC context; null without a valid session. */
export const viewerFromRequest = (req: Request): Promise<Viewer | null> => viewerForToken(tokenFromRequest(req));

export async function revokeSession(req: Request): Promise<void> {
  const token = tokenFromRequest(req);
  if (token) await db().session.updateMany({ where: { tokenHash: tokenHash(token) }, data: { revokedAt: new Date() } });
}

export async function hasAnyUser(): Promise<boolean> {
  return !!(await db().user.findFirst({ select: { id: true } }));
}

/** Creates the first administrator; refused once any account exists. */
export async function setupAdmin(input: z.infer<typeof SetupInput>, correlationId: string) {
  const passwordHash = await hashPassword(input.password);
  return withTx(async (tx) => {
    // Table lock: two concurrent setups must not both see an empty users table.
    await tx.$executeRaw`LOCK TABLE users IN EXCLUSIVE MODE`;
    if (await tx.user.findFirst({ select: { id: true } })) throw conflict("Penyiapan awal sudah dilakukan");
    const { id } = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash, globalRole: "admin", status: "active" }, select: { id: true } });
    await audit(tx, { projectId: null, actorId: id, action: "setup.admin", objectType: "user", objectId: id, correlationId });
    return createSession(tx, id);
  });
}

export async function login(input: z.infer<typeof LoginInput>) {
  const user = await db().user.findFirst({ where: { email: input.email, status: "active" }, select: { id: true, passwordHash: true } });
  // One generic message: never reveal whether the email or the password was wrong.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!ok || !user) throw new HttpError(401, "invalid_credentials", "Email atau kata sandi salah");
  return createSession(db(), user.id);
}

/** Single-use: the token is marked used in the same transaction that sets the password. */
export async function activate(input: z.infer<typeof ActivateInput>, correlationId: string) {
  const passwordHash = await hashPassword(input.password);
  return withTx(async (tx) => {
    const [t] = await tx.activationToken.updateManyAndReturn({
      where: { tokenHash: tokenHash(input.token), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
      select: { userId: true },
    });
    if (!t) throw new HttpError(410, "token_invalid", "Tautan aktivasi tidak berlaku atau sudah dipakai");
    await tx.user.updateMany({ where: { id: t.userId, status: "invited" }, data: { name: input.name, passwordHash, status: "active", updatedAt: new Date() } });
    await audit(tx, { projectId: null, actorId: t.userId, action: "user.activate", objectType: "user", objectId: t.userId, correlationId });
    return createSession(tx, t.userId);
  });
}
