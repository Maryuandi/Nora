import { baselineFor, compareFindings, findingsFor, type Finding, type FindingChange } from "./findings";
import type { MockState, MonitoringRun } from "./types";

export function fmtMeasure(n: number | null, unit: Finding["unit"]): string {
  if (n === null) return "—";
  const s = n.toLocaleString("id-ID", { maximumFractionDigits: unit === "fitness" ? 2 : 1 });
  return unit === "%" ? `${s}%` : unit === "fitness" ? s : `${s} ${unit}`;
}

/** `param`: a baseline run id, "none", or absent/unknown → the default baseline. */
export function resolveBaseline(state: MockState, run: MonitoringRun, param: string | null): MonitoringRun | null {
  if (param === "none") return null;
  return state.runs.find((r) => r.id === param && r.projectId === run.projectId && r.id !== run.id) ?? baselineFor(state, run);
}

export function changesFor(state: MockState, run: MonitoringRun, baseline: MonitoringRun | null): FindingChange[] {
  return compareFindings(findingsFor(state, run), baseline ? findingsFor(state, baseline) : null, run.config);
}

/** Tab badge: new + worsened findings vs the default baseline. */
export function attentionCount(state: MockState, run: MonitoringRun): number {
  return changesFor(state, run, baselineFor(state, run)).filter((c) => c.status === "baru" || c.status === "memburuk").length;
}
