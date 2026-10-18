import { gunzipSync } from "node:zlib";
import { withTx } from "@nora/db";
import { METRIC_DEFINITIONS, MonitoringConfig, MonitoringInput, ReworkDefinition, RulePayload } from "@nora/contracts";
import { getBytes, getJson } from "@nora/storage";
import { db } from "../db.ts";
import type { RunJob } from "./analysis.ts";

/** Everything the monitoring stage needs comes from the run's own context package, never from "current" config. */
export async function loadMonitoringInput(job: RunJob): Promise<MonitoringInput | null> {
  const r = (await db().query(
    `UPDATE analysis_runs r SET monitoring_status = 'running'
       FROM dataset_versions d, context_packages c
      WHERE r.id = $1 AND r.project_id = $2 AND d.id = r.dataset_version_id AND c.id = r.context_package_id
      RETURNING r.filter_spec, r.artifact_prefix, r.monitoring_config, d.events_key, c.id AS package_id, c.process_boundary_id,
                c.rework_definition_id, c.bpmn_model_id, c.bpmn_mapping_id, c.conformance_available`,
    [job.analysisRunId, job.projectId],
  )).rows[0];
  if (!r) return null;
  const boundary = (await db().query("SELECT payload FROM process_boundaries WHERE id = $1", [r.process_boundary_id])).rows[0]?.payload ?? null;
  const rework = r.rework_definition_id ? ReworkDefinition.parse((await db().query("SELECT payload FROM rework_definitions WHERE id = $1", [r.rework_definition_id])).rows[0].payload) : null;
  const rules = (await db().query(
    `SELECT x.id, x.item_key AS key, x.version, x.payload FROM context_package_refs p JOIN rules x ON x.id = p.ref_id
      WHERE p.package_id = $1 AND p.ref_type = 'rule' ORDER BY x.item_key`, [r.package_id],
  )).rows.map((x) => ({ id: x.id, key: x.key, version: x.version, payload: RulePayload.parse(x.payload) }));
  let bpmn: MonitoringInput["bpmn"] = null;
  let reason: string | null = null;
  if (!r.bpmn_model_id) reason = "Paket konteks tidak memuat model BPMN.";
  else {
    const m = (await db().query("SELECT object_key, tasks, validation_status, validation_error FROM bpmn_models WHERE id = $1", [r.bpmn_model_id])).rows[0];
    const map = r.bpmn_mapping_id ? (await db().query("SELECT id, version, mapping FROM bpmn_mappings WHERE id = $1", [r.bpmn_mapping_id])).rows[0] : null;
    if (m.validation_status !== "valid") reason = `Model BPMN hanya referensi visual: ${m.validation_error ?? "konversi PM4Py gagal"}.`;
    else if (!map || !Object.keys(map.mapping).length) reason = "Pemetaan task BPMN ke aktivitas belum ada.";
    else bpmn = { objectKey: m.object_key, modelId: r.bpmn_model_id, mappingId: map.id, mappingVersion: map.version, tasks: m.tasks, mapping: map.mapping };
  }
  return MonitoringInput.parse({
    projectId: job.projectId, analysisRunId: job.analysisRunId, eventsKey: r.events_key, artifactPrefix: r.artifact_prefix, filter: r.filter_spec,
    boundary, rework, rules, bpmn, bpmnUnavailableReason: reason, config: MonitoringConfig.parse(r.monitoring_config ?? {}),
  });
}

type Json = Record<string, any>;

export async function saveMonitoringResult(job: RunJob & { manifest: { resultKey: string; findingCasesKey: string } }): Promise<number> {
  const res = await getJson<Json>(job.projectId, job.manifest.resultKey);
  const caseRows = gunzipSync(Buffer.from(await getBytes(job.projectId, job.manifest.findingCasesKey))).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as [number, string, string, number, string, number | null]);
  const run = job.analysisRunId;
  return withTx(db(), async (tx) => {
    for (const d of METRIC_DEFINITIONS) {
      await tx.query(
        `INSERT INTO metric_definitions (key, version, name, description, formula, population, unit, implementation_version, reference_test)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (key, version) DO NOTHING`,
        [d.key, d.version, d.name, d.description, d.formula, d.population, d.unit, d.implementation, d.referenceTest],
      );
    }
    // A retried activity starts clean; the trigger only forbids UPDATE, so findings of an unfinished save can be removed.
    await tx.query("DELETE FROM finding_cases WHERE finding_id IN (SELECT id FROM findings WHERE analysis_run_id = $1)", [run]);
    await tx.query("DELETE FROM findings WHERE analysis_run_id = $1", [run]);
    for (const t of ["conformance_results", "rule_evaluations", "rework_results", "transition_metrics", "analysis_metric_series", "analysis_metrics"]) await tx.query(`DELETE FROM ${t} WHERE run_id = $1`, [run]);
    for (const m of res.metrics) {
      await tx.query(
        `INSERT INTO analysis_metrics (run_id, project_id, metric_key, metric_version, value, unit, available, reason, small_sample, population) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [run, job.projectId, m.key, m.version, m.value, m.unit, m.available, m.reason, m.smallSample, JSON.stringify(m.population)],
      );
    }
    for (const s of res.trend) {
      await tx.query("INSERT INTO analysis_metric_series (run_id, bucket, started, completed, median_duration_s) VALUES ($1, $2, $3, $4, $5)", [run, s.bucket, s.started, s.completed, s.medianDurationSeconds]);
    }
    for (const t of res.transitions) {
      await tx.query(
        `INSERT INTO transition_metrics (run_id, project_id, from_activity, to_activity, rank, occurrences, case_count, median_wait_s, p90_wait_s, total_wait_s, contribution_share, affected_case_share, delay_excess, severity, is_bottleneck)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [run, job.projectId, t.from, t.to, t.rank, t.occurrences, t.caseCount, t.medianSeconds, t.p90Seconds, t.totalSeconds, t.contributionShare, t.affectedCaseShare, t.delayExcess, t.severity, t.isBottleneck],
      );
    }
    await tx.query("INSERT INTO rework_results (run_id, project_id, result) VALUES ($1, $2, $3)", [run, job.projectId, JSON.stringify(res.rework)]);
    for (const r of res.rules) {
      await tx.query(
        `INSERT INTO rule_evaluations (run_id, project_id, rule_id, rule_key, rule_version, name, compliant, non_compliant, not_evaluable, reasons) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [run, job.projectId, r.ruleId, r.key, r.version, r.name, r.compliant, r.nonCompliant, r.notEvaluable, JSON.stringify(r.reasons)],
      );
    }
    const c = res.conformance;
    await tx.query(
      `INSERT INTO conformance_results (run_id, project_id, status, reason, bpmn_model_id, bpmn_mapping_id, mapping_version, fitness, variants, mismatches) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [run, job.projectId, c.status, c.reason, c.modelId ?? null, c.mappingId ?? null, c.mappingVersion ?? null, c.fitness, JSON.stringify(c.variants), JSON.stringify(c.mismatches)],
    );
    const ids = (await tx.query<{ dataset_version_id: string; context_package_id: string }>("SELECT dataset_version_id, context_package_id FROM analysis_runs WHERE id = $1", [run])).rows[0]!;
    const findingIds: string[] = [];
    for (const f of res.findings) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO findings (project_id, analysis_run_id, type, title, summary, metric_key, metric_version, metrics, population, thresholds, subject, severity_score, severity_label, dataset_version_id, context_package_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [job.projectId, run, f.type, f.title, f.summary, f.metricKey, f.metricVersion, JSON.stringify(f.metrics), JSON.stringify(f.population), JSON.stringify(f.thresholds),
          JSON.stringify(f.subject), f.severityScore, f.severityLabel, ids.dataset_version_id, ids.context_package_id],
      );
      findingIds.push(rows[0]!.id);
    }
    for (let i = 0; i < caseRows.length; i += 5000) {
      const chunk = caseRows.slice(i, i + 5000);
      await tx.query(
        `INSERT INTO finding_cases (finding_id, project_id, case_uid, case_id, rank, support_metric, support_value)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::int[], $6::text[], $7::float8[])`,
        [chunk.map((r) => findingIds[r[0]]), chunk.map(() => job.projectId), chunk.map((r) => r[1]), chunk.map((r) => r[2]), chunk.map((r) => r[3]), chunk.map((r) => r[4]), chunk.map((r) => r[5])],
      );
    }
    await tx.query("UPDATE analysis_runs SET monitoring_status = 'completed', monitoring_error = NULL WHERE id = $1", [run]);
    return findingIds.length;
  });
}

export async function markMonitoringFailed(job: RunJob & { message: string }): Promise<void> {
  await db().query("UPDATE analysis_runs SET monitoring_status = 'failed', monitoring_error = $2 WHERE id = $1", [job.analysisRunId, job.message.slice(0, 500)]);
}
