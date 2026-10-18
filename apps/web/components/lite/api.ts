"use client";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, string>;
  correlationId?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** JSON fetch against /api/lite; never throws, so forms can render the error next to the field. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/lite${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: { status: res.status, code: json.error ?? "error", message: json.message ?? "Permintaan gagal", details: json.details, correlationId: json.correlationId } };
  } catch {
    return { ok: false, error: { status: 0, code: "network", message: "Tidak dapat menghubungi server" } };
  }
}

export const errorText = (e: ApiError) => (e.correlationId ? `${e.message} (ID: ${e.correlationId.slice(0, 8)})` : e.message);
