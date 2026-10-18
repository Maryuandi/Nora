import "server-only";
import { AuthzError } from "@nora/authz";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "not_found", "Tidak ditemukan");
export const badRequest = (message: string, details?: unknown) => new HttpError(400, "invalid_request", message, details);
export const conflict = (message: string, details?: unknown) => new HttpError(409, "conflict", message, details);

export const newCorrelationId = () => crypto.randomUUID();

export function toHttpError(err: unknown): HttpError | null {
  if (err instanceof HttpError) return err;
  if (err instanceof AuthzError) {
    if (err.code === "not_found") return notFound();
    if (err.code === "forbidden") return new HttpError(403, "forbidden", "Peranmu tidak memiliki izin untuk aksi ini");
    return new HttpError(409, "project_inactive", "Proyek tidak aktif; data dan pekerjaan baru tidak diterima");
  }
  // Unique violations surface as 409 so forms can show them next to the field.
  if (typeof err === "object" && err && (err as { code?: string }).code === "23505") return conflict("Data dengan nilai ini sudah ada");
  return null;
}

export interface RequestContext {
  req: Request;
  correlationId: string;
}

/**
 * Wraps a route handler: JSON errors with a correlation ID, and a same-origin check on mutations
 * (session cookies are SameSite=Lax; this blocks cross-site form posts too).
 */
export function route<P>(handler: (ctx: RequestContext & { params: P }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const correlationId = req.headers.get("x-correlation-id") ?? newCorrelationId();
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        // Compare with the Host header: req.url is normalised by Next and may name a different host.
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
        if (origin && new URL(origin).host !== host && origin !== process.env.NORA_PUBLIC_ORIGIN) {
          throw new HttpError(403, "cross_origin", "Permintaan lintas origin ditolak");
        }
      }
      const res = await handler({ req, correlationId, params: await ctx.params });
      res.headers.set("x-correlation-id", correlationId);
      return res;
    } catch (err) {
      const http = toHttpError(err);
      if (!http) console.error(`[${correlationId}]`, err);
      const e = http ?? new HttpError(500, "internal_error", "Terjadi kesalahan pada server");
      return Response.json({ error: e.code, message: e.message, details: e.details, correlationId }, { status: e.status, headers: { "x-correlation-id": correlationId } });
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Body harus berupa JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Input tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "_", i.message])));
  }
  return parsed.data;
}
