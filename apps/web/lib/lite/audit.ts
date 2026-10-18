import "server-only";
import type { Queryable } from "@nora/db";

export interface AuditInput {
  projectId: string | null;
  actorId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  result?: "success" | "denied" | "failed";
  correlationId: string;
  metadata?: Record<string, unknown>;
}

/** Call inside the mutation's transaction: if this insert fails, the mutation is rolled back too. */
export async function audit(db: Queryable, e: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (project_id, actor_id, action, object_type, object_id, result, correlation_id, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.projectId, e.actorId, e.action, e.objectType, e.objectId ?? null, e.result ?? "success", e.correlationId, JSON.stringify(e.metadata ?? {})],
  );
  if (e.projectId && (e.result ?? "success") === "success") {
    await db.query("UPDATE projects SET last_activity_at = now() WHERE id = $1", [e.projectId]);
  }
}
