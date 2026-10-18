import "server-only";
import { db } from "./db";

export interface DownstreamStatus {
  assessments: { total: number; needsReview: number; latestStatus: string | null } | null;
  recommendations: { total: number; validated: number } | null;
  interpretations: { total: number; latestStatus: string | null } | null;
}

/** Counts from later stages; a stage whose tables are not migrated yet reports null instead of failing the page. */
export async function downstreamStatus(projectId: string, findingId: string): Promise<DownstreamStatus> {
  const present = new Set((await db().query<{ n: string }>(
    "SELECT n FROM unnest(ARRAY['assessments', 'candidate_links', 'interpretations']) n WHERE to_regclass(n) IS NOT NULL",
  )).rows.map((r) => r.n));
  const out: DownstreamStatus = { assessments: null, recommendations: null, interpretations: null };
  if (present.has("assessments")) {
    out.assessments = (await db().query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'needs_review')::int AS "needsReview",
              (SELECT status FROM assessments WHERE project_id = $1 AND finding_id = $2 ORDER BY created_at DESC LIMIT 1) AS "latestStatus"
         FROM assessments WHERE project_id = $1 AND finding_id = $2`, [projectId, findingId],
    )).rows[0];
  }
  if (present.has("candidate_links")) {
    out.recommendations = (await db().query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE latest_status = 'validated')::int AS validated FROM candidate_links WHERE project_id = $1 AND finding_id = $2`, [projectId, findingId],
    )).rows[0];
  }
  if (present.has("interpretations")) {
    out.interpretations = (await db().query(
      `SELECT count(*)::int AS total, (SELECT status FROM interpretations WHERE project_id = $1 AND target_id = $2 ORDER BY created_at DESC LIMIT 1) AS "latestStatus"
         FROM interpretations WHERE project_id = $1 AND target_id = $2`, [projectId, findingId],
    )).rows[0];
  }
  return out;
}
