import "server-only";
import { TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { AuthzError } from "@nora/authz";
import { isUniqueViolation } from "@nora/db";
import { ZodError } from "zod";

// tRPC has no 410; the original status still reaches the client in error.data.status.
const TRPC_CODE: Record<number, TRPC_ERROR_CODE_KEY> = {
  400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 410: "NOT_FOUND",
  422: "UNPROCESSABLE_CONTENT", 503: "SERVICE_UNAVAILABLE",
};

/** A user-facing error: HTTP-style status, a stable app code, an Indonesian message and optional per-field details. */
export class HttpError extends TRPCError {
  constructor(readonly status: number, readonly appCode: string, message: string, readonly details?: unknown) {
    super({ code: TRPC_CODE[status] ?? "INTERNAL_SERVER_ERROR", message });
  }
}

export const notFound = () => new HttpError(404, "not_found", "Tidak ditemukan");
export const badRequest = (message: string, details?: unknown) => new HttpError(400, "invalid_request", message, details);
export const conflict = (message: string, details?: unknown) => new HttpError(409, "conflict", message, details);

export const newCorrelationId = () => crypto.randomUUID();

const fieldIssues = (err: ZodError) => Object.fromEntries(err.issues.map((i) => [i.path.join(".") || "_", i.message]));

export function toHttpError(err: unknown): HttpError | null {
  if (err instanceof HttpError) return err;
  if (err instanceof AuthzError) {
    if (err.code === "not_found") return notFound();
    if (err.code === "forbidden") return new HttpError(403, "forbidden", "Peranmu tidak memiliki izin untuk aksi ini");
    return new HttpError(409, "project_inactive", "Proyek tidak aktif; data dan pekerjaan baru tidak diterima");
  }
  // Procedure input that fails its Zod schema.
  if (err instanceof ZodError) return badRequest("Input tidak valid", fieldIssues(err));
  // Unique violations surface as 409 so forms can show them next to the field.
  if (isUniqueViolation(err)) return conflict("Data dengan nilai ini sudah ada");
  return null;
}
