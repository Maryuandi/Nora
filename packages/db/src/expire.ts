import type { Queryable } from "./index.ts";

/** Moves active/suspended projects whose contract ended before today (project time zone) to `ended`, with one audit row each. */
export async function expireContracts(db: Queryable, correlationId: string, projectIds?: string[]): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `WITH ended AS (
       UPDATE projects SET status = 'ended', status_changed_at = now(), updated_at = now()
        WHERE status IN ('active', 'suspended')
          AND contract_end < (now() AT TIME ZONE timezone)::date
          AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
       RETURNING id
     ), audit AS (
       INSERT INTO audit_events (project_id, actor_id, action, object_type, object_id, result, correlation_id, metadata_json)
       SELECT id, NULL, 'project.status.expire', 'project', id::text, 'success', $2, '{"to":"ended","reason":"contract_end"}'::jsonb FROM ended
     )
     SELECT id FROM ended`,
    [projectIds ?? null, correlationId],
  );
  return rows.map((r) => r.id);
}
