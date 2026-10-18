import "server-only";
import { initTRPC } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { z } from "zod";
import { viewerFromRequest } from "@/lib/lite/auth";
import { HttpError, newCorrelationId, toHttpError } from "@/lib/lite/http";

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  const correlationId = req.headers.get("x-correlation-id") ?? newCorrelationId();
  resHeaders.set("x-correlation-id", correlationId);
  return { req, resHeaders, correlationId, viewer: await viewerFromRequest(req) };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error, ctx }) {
    const http = error instanceof HttpError ? error : null;
    const internal = !http && shape.data.httpStatus >= 500;
    return {
      ...shape,
      // Unexpected errors never leak internals; the correlation ID points to the server log.
      message: internal ? "Terjadi kesalahan pada server" : shape.message,
      data: {
        code: shape.data.code,
        httpStatus: shape.data.httpStatus,
        path: shape.data.path,
        status: http?.status ?? shape.data.httpStatus,
        appCode: http?.appCode ?? (internal ? "internal_error" : shape.data.code.toLowerCase()),
        details: http?.details,
        correlationId: ctx?.correlationId,
      },
    };
  },
});

/** Domain errors (authz, validation, unique violations) become HttpErrors with their own status. */
const mapErrors = t.middleware(async ({ next }) => {
  const res = await next();
  if (!res.ok && !(res.error instanceof HttpError)) {
    const http = toHttpError(res.error.cause);
    if (http) return { ...res, error: http };
  }
  return res;
});

/** Session cookies are SameSite=Lax; this also blocks cross-site form posts to mutations. */
const sameOrigin = t.middleware(({ ctx, type, next }) => {
  if (type === "mutation") {
    const origin = ctx.req.headers.get("origin");
    // Compare with the Host header: req.url is normalised by Next and may name a different host.
    const host = ctx.req.headers.get("x-forwarded-host") ?? ctx.req.headers.get("host") ?? new URL(ctx.req.url).host;
    if (origin && new URL(origin).host !== host && origin !== process.env.NORA_PUBLIC_ORIGIN) {
      throw new HttpError(403, "cross_origin", "Permintaan lintas origin ditolak");
    }
  }
  return next();
});

export const router = t.router;
export const publicProcedure = t.procedure.use(mapErrors).use(sameOrigin);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.viewer) throw new HttpError(401, "unauthenticated", "Sesi tidak valid; silakan masuk kembali");
  return next({ ctx: { viewer: ctx.viewer } });
});

/** Authorization stays in the services, per action; an unknown or foreign project answers 404 there. */
export const projectProcedure = protectedProcedure.input(z.object({ projectId: z.string() }));
