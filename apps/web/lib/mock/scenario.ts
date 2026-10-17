import type { RecCase } from "./rec-cases";
import type { ScenarioResult, ScenarioSpec } from "./types";

export const SCENARIO_DISCLAIMER = "Estimasi aritmetika pada kasus historis; mengabaikan efek kapasitas, antrean, dan perubahan perilaku.";

/** Linear interpolation between the two nearest ranks (R type 7). */
export function percentile(values: number[], p: number): number {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const idx = ((v.length - 1) * p) / 100;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

const stats = (d: number[]) => ({ median: percentile(d, 50), p90: percentile(d, 90) });

export function runScenario(spec: ScenarioSpec, cases: RecCase[]): ScenarioResult {
  // Only the aggregate case duration is adjusted, never event timestamps.
  let cut: (c: RecCase, i: number) => number;
  if (spec.kind === "kurangi_jeda") cut = (c) => (c.gaps[spec.transition] ?? 0) * (spec.pct / 100);
  else if (spec.kind === "batasi_jeda") cut = (c) => Math.max(0, (c.gaps[spec.transition] ?? 0) - spec.maxDays);
  else if (spec.kind === "hapus_rework") {
    const withRework = cases.filter((c) => (c.rework[spec.activity] ?? 0) > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
    const chosen = new Set(withRework.slice(0, Math.round((withRework.length * spec.pct) / 100)).map((c) => c.id));
    cut = (c) => (chosen.has(c.id) ? c.rework[spec.activity] : 0);
  } else {
    const f = spec.filter;
    cut = (c) => ((!f || (f.attribute === "unit" ? c.unit : c.kategori) === f.value) ? (c.activityDays[spec.activity] ?? 0) : 0);
  }
  const before = cases.map((c) => c.durationDays);
  const after = cases.map((c, i) => Math.max(0, c.durationDays - cut(c, i)));
  const affected = after.filter((d, i) => d !== before[i]).length;
  return { n: cases.length, affected, before: stats(before), after: stats(after), smallSample: affected < 30 };
}

export function describeSpec(spec: ScenarioSpec): string {
  switch (spec.kind) {
    case "kurangi_jeda": return `Jeda ${spec.transition} turun ${spec.pct}%`;
    case "batasi_jeda": return `Jeda ${spec.transition} dibatasi maksimum ${spec.maxDays} hari`;
    case "hapus_rework": return `Rework ${spec.activity} dihilangkan pada ${spec.pct}% kasus`;
    case "lewati_aktivitas": return `Aktivitas ${spec.activity} dilewati ${spec.filter ? `untuk ${spec.filter.attribute} = ${spec.filter.value}` : "untuk semua kasus"}`;
  }
}
