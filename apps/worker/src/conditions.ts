import type { Condition } from "@nora/contracts";
import { db } from "./db.ts";

export type CheckStatus = "pass" | "fail" | "not_evaluable";
export interface ConditionResult { condition: Condition; status: CheckStatus; actual: unknown; reason: string }

/** Everything a condition may refer to for one finding, loaded once. */
export async function conditionFacts(findingId: string) {
  const f = (await db().query(
    `SELECT f.*, r.id AS run_id, d.mapping_version_id FROM findings f JOIN analysis_runs r ON r.id = f.analysis_run_id JOIN dataset_versions d ON d.id = f.dataset_version_id WHERE f.id = $1`, [findingId],
  )).rows[0];
  const caps = (await db().query("SELECT capabilities FROM capability_matrix WHERE dataset_version_id = $1", [f.dataset_version_id])).rows[0]?.capabilities ?? {};
  const metrics = Object.fromEntries((await db().query("SELECT metric_key, value FROM analysis_metrics WHERE run_id = $1 AND available", [f.run_id])).rows.map((r) => [r.metric_key, r.value]));
  const rules = Object.fromEntries((await db().query("SELECT rule_key, compliant, non_compliant FROM rule_evaluations WHERE run_id = $1", [f.run_id])).rows
    .map((r) => [r.rule_key, r.compliant + r.non_compliant ? r.compliant / (r.compliant + r.non_compliant) : null]));
  const activities = new Set((await db().query("SELECT activity FROM process_nodes WHERE run_id = $1", [f.run_id])).rows.map((r) => r.activity as string));
  const attrs = new Set<string>(((await db().query("SELECT config FROM mapping_versions WHERE id = $1", [f.mapping_version_id])).rows[0]?.config.columns.caseAttributes ?? []) as string[]);
  return { finding: f, caps, metrics, rules, activities, attrs };
}
export type Facts = Awaited<ReturnType<typeof conditionFacts>>;

function compare(actual: unknown, op: Condition["op"], expected: Condition["value"]): boolean {
  switch (op) {
    case "exists": return actual !== undefined && actual !== null && actual !== false;
    case "=": return actual === expected || String(actual) === String(expected);
    case "!=": return !(actual === expected || String(actual) === String(expected));
    case "in": return Array.isArray(expected) && expected.map(String).includes(String(actual));
    default: {
      const a = Number(actual), b = Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : a <= b;
    }
  }
}

/** A condition that cannot be computed is "not_evaluable", never false. */
export function evaluateCondition(c: Condition, facts: Facts): ConditionResult {
  let actual: unknown;
  switch (c.ref) {
    case "capability":
      if (!(c.key in facts.caps)) return { condition: c, status: "not_evaluable", actual: null, reason: `Kapabilitas ${c.key} tidak dikenal` };
      actual = facts.caps[c.key].available;
      break;
    case "metric":
      actual = facts.finding.metrics[c.key] ?? facts.metrics[c.key];
      if (actual == null) return { condition: c, status: "not_evaluable", actual: null, reason: `Metrik ${c.key} tidak tersedia` };
      break;
    case "finding":
      actual = c.key === "type" ? facts.finding.type : c.key === "severity" ? facts.finding.severity_score : facts.finding.subject[c.key];
      if (actual == null) return { condition: c, status: "not_evaluable", actual: null, reason: `Atribut temuan ${c.key} tidak ada` };
      break;
    case "rule_status":
      actual = facts.rules[c.key];
      if (actual == null) return { condition: c, status: "not_evaluable", actual: null, reason: `Aturan ${c.key} tidak dievaluasi pada run ini` };
      break;
    case "activity":
      actual = facts.activities.has(c.key);
      if (c.op === "exists") return { condition: c, status: actual ? "pass" : "fail", actual, reason: actual ? "Aktivitas muncul" : "Aktivitas tidak muncul" };
      break;
    case "case_attribute":
      if (!facts.attrs.has(c.key)) return { condition: c, status: "not_evaluable", actual: null, reason: `Atribut kasus ${c.key} tidak dipetakan` };
      actual = true;
      break;
  }
  const ok = compare(actual, c.op, c.value);
  return { condition: c, status: ok ? "pass" : "fail", actual, reason: ok ? "Terpenuhi" : `Nilai ${JSON.stringify(actual)} tidak memenuhi ${c.op} ${JSON.stringify(c.value ?? null)}` };
}
