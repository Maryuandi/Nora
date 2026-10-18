import { createPool } from "@nora/db";
import type pg from "pg";

let pool: pg.Pool | undefined;
export const db = () => (pool ??= createPool());

export async function audit(q: Pick<pg.Pool, "query">, e: { projectId: string; actorId?: string | null; action: string; objectType: string; objectId: string; result?: string; correlationId: string; metadata?: unknown }) {
  await q.query(
    `INSERT INTO audit_events (project_id, actor_id, action, object_type, object_id, result, correlation_id, metadata_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.projectId, e.actorId ?? null, e.action, e.objectType, e.objectId, e.result ?? "success", e.correlationId, JSON.stringify(e.metadata ?? {})],
  );
}
