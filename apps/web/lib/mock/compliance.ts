import { hash } from "./mapping";
import type { CaseResult, CaseStatus, MappingVersion, MockCase, MockState, MonitoringRun, RuleVersion, Snapshot } from "./types";

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  patuh: "Patuh", tidak_patuh: "Tidak patuh", tidak_dapat_dievaluasi: "Tidak dapat dievaluasi",
};

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function mockCases(snapshot: Snapshot, periodFrom: string, periodTo: string): MockCase[] {
  const st = snapshot.stats;
  if (!st) return [];
  const from = periodFrom > st.timeFrom ? periodFrom : st.timeFrom;
  const to = periodTo < st.timeTo ? periodTo : st.timeTo;
  if (from > to) return [];
  const days = (toMs(to) - toMs(from)) / DAY + 1;
  const fullDays = (toMs(st.timeTo) - toMs(st.timeFrom)) / DAY + 1;
  // shortcut: case count capped at 20_000 for mock UI responsiveness, remove when real backend computes results
  const n = Math.min(20_000, Math.round(Math.round(st.rows / 6) * days / fullDays));
  const raw = Array.from({ length: n }, (_, i) => {
    const start = toMs(from) + (hash(snapshot.checksum + i) % days) * DAY;
    const open = hash(snapshot.checksum + i, 0x9e3779b1) % 10 === 0;
    const end = open ? null : toDate(start + (1 + (hash(snapshot.checksum + i, 0x85ebca6b) % 30)) * DAY);
    return { start: toDate(start), end };
  });
  raw.sort((a, b) => a.start.localeCompare(b.start)); // stable: ties keep index order
  return raw.map((c, i) => ({ id: `CASE-${String(i + 1).padStart(4, "0")}`, ...c }));
}

export function participatingVersions(state: MockState, projectId: string): RuleVersion[] {
  const rules = state.rules.filter((r) => r.projectId === projectId);
  const newest = new Map<string, RuleVersion>();
  for (const r of rules) if ((r.status === "disetujui" || r.status === "ditinjau") && (!newest.has(r.ruleKey) || newest.get(r.ruleKey)!.version < r.version)) newest.set(r.ruleKey, r);
  return rules.filter((r) => (r === newest.get(r.ruleKey) || r.approvedAt));
}

export function applicableVersion(versions: RuleVersion[], caseStart: string): RuleVersion | null {
  const ok = versions.filter((v) => v.effectiveFrom <= caseStart && (v.effectiveTo === null || v.effectiveTo >= caseStart));
  return ok.reduce<RuleVersion | null>((best, v) => (!best || v.version > best.version ? v : best), null);
}

const activityB = (v: RuleVersion): string | null =>
  v.params.type === "sla" ? v.params.to : v.params.type === "urutan" ? v.params.after : null;

// Whole days from start to refDate; "kerja" counts Mon-Fri days after start up to and including refDate (no holiday calendar in the mock).
function caseAge(start: string, refDate: string, unit: "kalender" | "kerja"): number {
  const total = Math.round((toMs(refDate) - toMs(start)) / DAY);
  if (unit === "kalender") return total;
  let n = 0;
  for (let i = 1; i <= total; i++) { const d = new Date(toMs(start) + i * DAY).getUTCDay(); if (d !== 0 && d !== 6) n++; }
  return n;
}

export function evaluateCase(version: RuleVersion, c: MockCase, mapping: MappingVersion, refDate?: string): CaseResult {
  const out = (status: CaseStatus, reason?: string, atRisk?: boolean): CaseResult =>
    ({ caseId: c.id, start: c.start, status, ...(reason ? { reason } : {}), ...(atRisk ? { atRisk: true } : {}), ruleVersionId: version.id });
  const roles = Object.values(mapping.roles);
  if (version.params.type === "pemisahan_tugas" && !roles.includes("resource")) return out("tidak_dapat_dievaluasi", "Kolom sumber daya belum dipetakan (M03)");
  if (version.scope) {
    const role = mapping.roles[version.scope.attribute];
    if (role !== "case_attr" && role !== "event_attr") return out("tidak_dapat_dievaluasi", `Atribut ${version.scope.attribute} belum dipetakan (M03)`);
  }
  const b = activityB(version);
  if (b && c.end === null && hash(version.id + c.id) % 2 === 0) {
    const p = version.params;
    return out("tidak_dapat_dievaluasi", `Kasus belum mencapai ${b}`, p.type === "sla" && !!refDate && caseAge(c.start, refDate, p.unit) > p.limit);
  }
  const p = 3 + (hash(version.id) % 43);
  return out(hash(version.id + c.id, 7) % 100 < p ? "tidak_patuh" : "patuh");
}

export function evaluateRun(state: MockState, run: MonitoringRun, ruleKey: string): CaseResult[] {
  const snapshot = state.snapshots.find((s) => s.id === run.snapshotId);
  const mapping = state.mappings.find((m) => m.id === run.mappingId);
  if (!snapshot || !mapping) return [];
  const versions = run.ruleVersions.filter((r) => r.ruleKey === ruleKey);
  return mockCases(snapshot, run.periodFrom, run.periodTo).map((c) => {
    const v = applicableVersion(versions, c.start);
    return v ? evaluateCase(v, c, mapping, run.periodTo)
      : { caseId: c.id, start: c.start, status: "tidak_dapat_dievaluasi", reason: "Tidak ada versi aturan yang berlaku pada awal kasus", ruleVersionId: null };
  });
}

export type ComplianceSummary = {
  total: number; patuh: number; tidakPatuh: number; tidakDapat: number;
  byMonth: { month: string; patuh: number; tidakPatuh: number; tidakDapat: number }[];
  reasons: { reason: string; count: number }[];
};

export function summarize(results: CaseResult[]): ComplianceSummary {
  const key = { patuh: "patuh", tidak_patuh: "tidakPatuh", tidak_dapat_dievaluasi: "tidakDapat" } as const;
  const s: ComplianceSummary = { total: results.length, patuh: 0, tidakPatuh: 0, tidakDapat: 0, byMonth: [], reasons: [] };
  const months = new Map<string, ComplianceSummary["byMonth"][number]>();
  const reasons = new Map<string, number>();
  for (const r of results) {
    s[key[r.status]]++;
    const month = r.start.slice(0, 7);
    if (!months.has(month)) months.set(month, { month, patuh: 0, tidakPatuh: 0, tidakDapat: 0 });
    months.get(month)![key[r.status]]++;
    if (r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  }
  s.byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  s.reasons = [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  return s;
}

export const termFor = (version: RuleVersion): "Pelanggaran" | "Tidak sesuai dengan acuan" =>
  version.status === "disetujui" ? "Pelanggaran" : "Tidak sesuai dengan acuan";

/** Highest version actually applied to cases, and the term from the versions that produced non-compliant cases. */
export function appliedRule(run: MonitoringRun, results: CaseResult[]): { top: RuleVersion | null; term: ReturnType<typeof termFor> } {
  const byId = (id: string) => run.ruleVersions.find((v) => v.id === id);
  const applied = new Set(results.flatMap((r) => (r.ruleVersionId ? [r.ruleVersionId] : [])));
  const top = [...applied].map(byId).reduce<RuleVersion | null>((a, v) => (v && (!a || v.version > a.version) ? v : a), null);
  const bad = new Set(results.flatMap((r) => (r.status === "tidak_patuh" && r.ruleVersionId ? [r.ruleVersionId] : [])));
  const approved = bad.size > 0 && [...bad].every((id) => byId(id)?.status === "disetujui");
  return { top, term: approved ? "Pelanggaran" : "Tidak sesuai dengan acuan" };
}
