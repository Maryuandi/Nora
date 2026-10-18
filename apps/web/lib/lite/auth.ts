import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { Queryable } from "@nora/db";
import { db } from "./db";
import { HttpError } from "./http";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export const SESSION_COOKIE = "nora_session";
const SESSION_DAYS = 14;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export interface Viewer {
  id: string;
  email: string;
  name: string;
  globalRole: "admin" | "member";
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") {
    // Spend comparable time so unknown accounts are not distinguishable by latency.
    await scrypt(password, randomBytes(16), 32, SCRYPT);
    return false;
  }
  const [, N, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(q: Queryable, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [userId, tokenHash(token), expiresAt]);
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

async function viewerForToken(token: string | undefined): Promise<Viewer | null> {
  if (!token) return null;
  const { rows } = await db().query<Viewer>(
    `SELECT u.id, u.email, u.name, u.global_role AS "globalRole"
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
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

/** For route handlers: 401 without a valid session. */
export async function requireViewer(req: Request): Promise<Viewer> {
  const viewer = await viewerForToken(tokenFromRequest(req));
  if (!viewer) throw new HttpError(401, "unauthenticated", "Sesi tidak valid; silakan masuk kembali");
  return viewer;
}

export async function revokeSession(req: Request): Promise<void> {
  const token = tokenFromRequest(req);
  if (token) await db().query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1", [tokenHash(token)]);
}

export async function hasAnyUser(): Promise<boolean> {
  const { rows } = await db().query("SELECT 1 FROM users LIMIT 1");
  return rows.length > 0;
}
