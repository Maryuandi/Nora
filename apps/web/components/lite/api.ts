"use client";
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/lib/trpc/router";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, string>;
  correlationId?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** The server's error (status, code, field details, correlation ID) as forms render it. */
export function toApiError(err: unknown): ApiError {
  const data = err instanceof TRPCClientError ? (err as TRPCClientError<AppRouter>).data : undefined;
  if (!data) return { status: 0, code: "network", message: "Tidak dapat menghubungi server" };
  return {
    status: data.status, code: data.appCode, message: (err as Error).message || "Permintaan gagal",
    details: data.details as Record<string, string> | undefined, correlationId: data.correlationId,
  };
}

/** Awaits a tRPC call without throwing, so forms can render the error next to the field. */
export async function attempt<T>(call: Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await call };
  } catch (err) {
    return { ok: false, error: toApiError(err) };
  }
}

export const errorText = (e: ApiError) => (e.correlationId ? `${e.message} (ID: ${e.correlationId.slice(0, 8)})` : e.message);
