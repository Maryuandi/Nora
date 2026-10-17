import type { CheckKey, CheckResult, JevResult, PriorityWeights, RecCandidate, RecFinding, Role, TrialProposal, ValidationStatus } from "./types";

export const DEFAULT_WEIGHTS: PriorityWeights = { relevance: 0.3, magnitude: 0.3, certainty: 0.15, effort: 0.15, risk: 0.1 };

export const VALIDATION_LABEL: Record<ValidationStatus, string> = {
  tervalidasi: "Tervalidasi", belum_layak_dinilai: "Belum layak dinilai", tidak_memenuhi_syarat: "Tidak memenuhi syarat", perlu_review: "Perlu review",
};
export const CHECK_LABEL: Record<CheckKey, string> = {
  syarat: "Syarat penerapan", angka: "Angka rujukan", versi: "Versi sumber/aturan", kewenangan: "Kewenangan", jev: "Penilaian Jev",
};

export type ValidationResult = {
  status: ValidationStatus;
  checks: { key: CheckKey; result: CheckResult; reason: string }[];
  missing: { what: string; from: string }[];
};

const OPS = { ">": (a: number, b: number) => a > b, ">=": (a: number, b: number) => a >= b, "<": (a: number, b: number) => a < b, "<=": (a: number, b: number) => a <= b };
const NO_JEV: JevResult = { status: "belum_dinilai", score: null, criteria: [], prob: null, conclusion: null };
export const jevOf = (c: RecCandidate, findingId: string): JevResult => c.jev[findingId] ?? NO_JEV;

export function validateCandidate(c: RecCandidate, finding: RecFinding, ctx: { memberRoles: Role[] }): ValidationResult {
  const metric = (key: string) => finding.metrics.find((m) => m.key === key);
  const checks: ValidationResult["checks"] = [];
  const missing: ValidationResult["missing"] = [];
  const add = (key: CheckKey, result: CheckResult, reason: string) => checks.push({ key, result, reason });

  // 1. Syarat penerapan (M04)
  const unknown = c.conditions.filter((k) => !metric(k.metricKey));
  const failed = c.conditions.filter((k) => metric(k.metricKey) && !OPS[k.op](metric(k.metricKey)!.value, k.value));
  if (failed.length) add("syarat", "gagal", `Syarat tidak terpenuhi: ${failed.map((k) => k.label).join("; ")}`);
  else if (unknown.length) {
    add("syarat", "tidak_dapat_diperiksa", `Metrik belum tersedia: ${unknown.map((k) => k.metricKey).join(", ")}`);
    for (const k of unknown) missing.push({ what: `Metrik ${k.metricKey}`, from: "M06" });
  } else add("syarat", "lolos", c.conditions.length ? "Semua syarat terpenuhi" : "Tidak ada syarat penerapan");

  // 2. Angka rujukan (M06)
  const badRef = c.refMetrics.filter((r) => {
    const m = metric(r.metricKey);
    return !m || Math.abs(m.value - r.expected) > Math.abs(r.expected) * 0.01;
  });
  if (badRef.length) add("angka", "gagal", `Angka rujukan tidak cocok dengan analisis: ${badRef.map((r) => r.metricKey).join(", ")}`);
  else add("angka", "lolos", c.refMetrics.length ? "Angka rujukan cocok dengan analisis M06" : "Tidak ada angka rujukan");

  // 3. Versi sumber/aturan (paket konteks)
  const stale = c.refs.filter((r) => finding.activeRefs[r.key] !== r.version);
  if (stale.length) add("versi", "gagal", stale.map((r) => `${r.key}: acuan telah diperbarui (v${r.version} → v${finding.activeRefs[r.key] ?? "?"})`).join("; "));
  else add("versi", "lolos", "Semua acuan masih versi aktif");

  // 4. Kewenangan (M01)
  if (!c.ownerRole) {
    add("kewenangan", "tidak_dapat_diperiksa", "Peran pemilik tindakan belum ditentukan");
    missing.push({ what: "Peran pemilik tindakan", from: "M04" });
  } else if (!ctx.memberRoles.includes(c.ownerRole)) add("kewenangan", "gagal", `Tidak ada anggota proyek dengan peran ${c.ownerRole}`);
  else add("kewenangan", "lolos", `Ada anggota proyek dengan peran ${c.ownerRole}`);

  // 5. Penilaian Jev (M08)
  const j = jevOf(c, finding.id);
  if (j.status === "perlu_review") add("jev", "gagal", "Penilaian Jev menunggu review analis");
  else if (j.status === "belum_dinilai" || j.status === "informasi_tidak_cukup" || !j.conclusion) {
    add("jev", "tidak_dapat_diperiksa", j.status === "informasi_tidak_cukup" ? "Informasi tidak cukup untuk dinilai" : "Belum dinilai");
    missing.push({ what: "Penilaian Jev", from: "M08" });
  } else if (j.conclusion === "tidak_relevan") add("jev", "gagal", "Jev menilai kandidat tidak relevan");
  else add("jev", "lolos", `Jev: ${j.conclusion === "relevan" ? "relevan" : "sebagian relevan"}`);

  const r = (k: CheckKey) => checks.find((x) => x.key === k)!.result;
  const status: ValidationStatus =
    r("syarat") === "gagal" ? "tidak_memenuhi_syarat"
    : r("syarat") === "tidak_dapat_diperiksa" || r("jev") === "tidak_dapat_diperiksa" ? "belum_layak_dinilai"
    : checks.some((x) => x.result !== "lolos") ? "perlu_review"
    : "tervalidasi";
  return { status, checks, missing };
}

export type Breakdown = {
  components: { key: keyof PriorityWeights; label: string; raw: number | null; weight: number; contribution: number | null }[];
  total: number; partial: boolean; available: number;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function priorityBreakdown(c: RecCandidate, finding: RecFinding, weights: PriorityWeights): Breakdown {
  const j = jevOf(c, finding.id);
  const raws: Record<keyof PriorityWeights, number | null> = {
    relevance: j.score === null ? null : j.score / 100,
    magnitude: clamp(finding.affectedShare * finding.waitShare, 0, 1),
    certainty: j.prob === null ? null : j.prob * Math.min(1, finding.supportCases / 30),
    effort: c.effort === null ? null : (c.effort - 1) / 4,
    risk: c.risk === null ? null : (c.risk - 1) / 4,
  };
  const meta: [keyof PriorityWeights, string, 1 | -1][] = [
    ["relevance", "Relevansi", 1], ["magnitude", "Besaran masalah", 1], ["certainty", "Kepastian bukti", 1], ["effort", "Usaha", -1], ["risk", "Risiko", -1],
  ];
  const components = meta.map(([key, label, sign]) => {
    const raw = raws[key];
    return { key, label, raw, weight: weights[key], contribution: raw === null ? null : sign * weights[key] * raw };
  });
  const present = components.filter((x) => x.contribution !== null);
  const total = Math.round(present.reduce((s, x) => s + x.contribution!, 0) * 1000) / 1000;
  return { components, total, partial: present.length < 5, available: present.length };
}

export type Evaluated = { c: RecCandidate; v: ValidationResult; b: Breakdown };

export function rankCandidates(items: Evaluated[]): { ranked: Evaluated[]; unranked: Evaluated[] } {
  const byId = (a: Evaluated, b: Evaluated) => (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0);
  const ranked = items.filter((e) => e.v.status === "tervalidasi").sort((a, b) => b.b.total - a.b.total || byId(a, b));
  const unranked = items.filter((e) => e.v.status !== "tervalidasi").sort(byId);
  return { ranked, unranked };
}

export function compareRanks(before: string[], after: string[]): { id: string; from: number | null; to: number | null; delta: number }[] {
  const ids = [...new Set([...before, ...after])];
  return ids.map((id) => {
    const f = before.indexOf(id), t = after.indexOf(id);
    const from = f < 0 ? null : f + 1, to = t < 0 ? null : t + 1;
    return { id, from, to, delta: from !== null && to !== null ? from - to : 0 };
  });
}

export function validateWeights(w: PriorityWeights): { ok: boolean; sum: number; message?: string } {
  const vals = Object.values(w);
  const sum = Math.round(vals.reduce((a, b) => a + b, 0) * 1000) / 1000;
  if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return { ok: false, sum, message: "Setiap bobot harus angka antara 0 dan 1" };
  if (sum !== 1) return { ok: true, sum, message: `Jumlah bobot ${String(sum).replace(".", ",")}, bukan 1,00. Rumus tetap berjalan, tetapi skala total berubah.` };
  return { ok: true, sum };
}

export function buildBaseline(c: RecCandidate, finding: RecFinding): TrialProposal["baseline"] {
  const keys = [...new Set([...c.conditions.map((k) => k.metricKey), ...c.refMetrics.map((r) => r.metricKey)])];
  return keys.flatMap((k) => {
    const m = finding.metrics.find((x) => x.key === k);
    return m ? [{ label: m.label, value: m.value, unit: m.unit }] : [];
  });
}
