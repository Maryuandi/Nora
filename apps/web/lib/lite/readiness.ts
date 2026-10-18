import "server-only";
import { roleCan } from "@nora/authz";
import type { Viewer } from "./auth";
import { db } from "./db";
import { newCorrelationId } from "./http";
import { can } from "./projects";
import { computeReadiness, type Readiness, type ReadinessComponentError, type ReadinessFacts } from "./readiness-core";

/** Tables owned by later features; a table that is not migrated yet means "nothing there", not an error. */
async function tablesPresent(names: string[]): Promise<Set<string>> {
  const { rows } = await db().query<{ name: string }>("SELECT n AS name FROM unnest($1::text[]) n WHERE to_regclass(n) IS NOT NULL", [names]);
  return new Set(rows.map((r) => r.name));
}

export async function loadReadiness(viewer: Viewer, projectId: string): Promise<Readiness> {
  const grant = await can(viewer, "project.read", projectId);
  const present = await tablesPresent(["sources", "source_snapshots", "dataset_versions", "context_packages", "analysis_runs", "findings"]);
  const facts: ReadinessFacts = { sourceCount: 0, readySnapshotCount: 0, dataset: null, context: null, analysis: null, findings: { bottleneck: 0, rework: 0 } };
  const errors: ReadinessComponentError[] = [];

  async function load(component: string, table: string, fn: () => Promise<void>) {
    if (!present.has(table)) return;
    try {
      await fn();
    } catch (err) {
      const correlationId = newCorrelationId();
      console.error(`[${correlationId}] readiness ${component}`, err);
      errors.push({ component, correlationId });
    }
  }

  const q = db();
  await Promise.all([
    load("sources", "sources", async () => {
      facts.sourceCount = (await q.query<{ n: number }>("SELECT count(*) AS n FROM sources WHERE project_id = $1", [projectId])).rows[0]!.n;
    }),
    load("snapshots", "source_snapshots", async () => {
      facts.readySnapshotCount = (await q.query<{ n: number }>("SELECT count(*) AS n FROM source_snapshots WHERE project_id = $1 AND status = 'ready_for_mapping'", [projectId])).rows[0]!.n;
    }),
    load("dataset", "dataset_versions", async () => {
      facts.dataset = (await q.query(
        `SELECT id, name, published_at AS "publishedAt", quality_status AS "qualityStatus" FROM dataset_versions
          WHERE project_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1`, [projectId],
      )).rows[0] ?? null;
    }),
    load("context", "context_packages", async () => {
      facts.context = (await q.query(
        `SELECT id, name, activated_at AS "activatedAt", conformance_available AS "conformanceAvailable" FROM context_packages
          WHERE project_id = $1 AND status = 'active' ORDER BY activated_at DESC LIMIT 1`, [projectId],
      )).rows[0] ?? null;
    }),
  ]);

  if (facts.dataset && facts.context) {
    await load("analysis", "analysis_runs", async () => {
      facts.analysis = (await q.query(
        `SELECT id, completed_at AS "completedAt" FROM analysis_runs
          WHERE project_id = $1 AND dataset_version_id = $2 AND context_package_id = $3 AND status = 'completed'
          ORDER BY completed_at DESC LIMIT 1`, [projectId, facts.dataset!.id, facts.context!.id],
      )).rows[0] ?? null;
    });
  }
  if (facts.analysis) {
    await load("findings", "findings", async () => {
      const { rows } = await q.query<{ type: string; n: number }>(
        `SELECT type, count(*) AS n FROM findings WHERE project_id = $1 AND analysis_run_id = $2 AND type IN ('bottleneck_indication', 'high_rework') GROUP BY type`,
        [projectId, facts.analysis!.id],
      );
      for (const r of rows) facts.findings[r.type === "high_rework" ? "rework" : "bottleneck"] = r.n;
    });
  }

  return computeReadiness(facts, grant.projectStatus, roleCan(grant.role, "project.status"), errors);
}
