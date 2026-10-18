import type { Db } from "./index.ts";

/** Moves active/suspended projects whose contract ended before today (project time zone) to `ended`, with one audit row each. */
export async function expireContracts(db: Db, correlationId: string, projectIds?: string[]): Promise<string[]> {
  // Raw: "today" is per-row in each project's time zone, and update + audit must be one statement.
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH ended AS (
      UPDATE projects SET status = 'ended', status_changed_at = now(), updated_at = now()
       WHERE status IN ('active', 'suspended')
         AND contract_end < (now() AT TIME ZONE timezone)::date
         AND (${projectIds ?? null}::uuid[] IS NULL OR id = ANY(${projectIds ?? null}::uuid[]))
      RETURNING id
    ), audit AS (
      INSERT INTO audit_events (project_id, actor_id, action, object_type, object_id, result, correlation_id, metadata_json)
      SELECT id, NULL, 'project.status.expire', 'project', id::text, 'success', ${correlationId}, '{"to":"ended","reason":"contract_end"}'::jsonb FROM ended
    )
    SELECT id::text FROM ended`;
  return rows.map((r) => r.id);
}
