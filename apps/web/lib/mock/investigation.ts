// Aturan murni M11: keputusan, tinjauan keluaran model, validasi ulang. Tanpa React, tanpa I/O.
import type {
  AnalysisState, Decision, DecisionStatus, EvidenceSnapshot, HypothesisState, InvestigationLink, InvestigationStatus,
  LinkKind, MockState, NoteKind, RejectReason, Role, User,
} from "./types";

// ---------- Label ----------
export const DECISION_LABEL: Record<DecisionStatus, string> = {
  perlu_investigasi: "Perlu investigasi",
  usulan_uji_coba: "Usulan uji coba",
  dipilih: "Dipilih",
  ditolak: "Ditolak",
  digantikan: "Digantikan",
};
export const INVESTIGATION_STATUS_LABEL: Record<InvestigationStatus, string> = {
  terbuka: "Terbuka",
  menunggu_informasi: "Menunggu informasi",
  siap_diputuskan: "Siap diputuskan",
  selesai: "Selesai",
};
export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  wawancara: "Wawancara",
  bukti: "Bukti",
  hipotesis: "Hipotesis",
  pertanyaan: "Pertanyaan",
};
export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  temuan: "Temuan",
  kasus: "Kasus",
  aturan: "Aturan",
  kandidat: "Kandidat",
  hasil_jev: "Hasil Jev",
  interpretasi: "Interpretasi",
  skenario: "Skenario",
  uji_coba: "Uji coba",
};
export const HYPOTHESIS_LABEL: Record<HypothesisState, string> = {
  belum_diuji: "Belum diuji",
  didukung: "Didukung",
  dibantah: "Dibantah",
};
export const REJECT_LABEL: Record<RejectReason, string> = {
  klaim_tidak_didukung: "Klaim tidak didukung bukti",
  bahasa_tidak_sesuai: "Bahasa tidak sesuai",
  informasi_kurang: "Informasi kurang",
};

const REVALIDATION_THRESHOLD = 0.05; // perubahan relatif metrik yang memicu penanda
const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

// ---------- Tinjauan keluaran model ----------
// Semua hasil tinjauan (dikonfirmasi/dikoreksi/disetujui/ditolak) bersifat final; cukup ada satu.
export function unreviewedModelOutputs(s: MockState, investigationId: string): InvestigationLink[] {
  return s.links.filter(
    (l) =>
      l.investigationId === investigationId &&
      (l.kind === "hasil_jev" || l.kind === "interpretasi") &&
      !s.reviews.some((r) => r.linkId === l.id),
  );
}

export function canSetStatus(s: MockState, investigationId: string, to: InvestigationStatus): string | null {
  if (to === "siap_diputuskan" && unreviewedModelOutputs(s, investigationId).length > 0) {
    return "Masih ada keluaran model yang belum ditinjau.";
  }
  if (to === "selesai" && !s.decisions.some((d) => d.investigationId === investigationId)) {
    return "Belum ada keputusan pada workspace ini.";
  }
  return null;
}

// ---------- Keputusan ----------
export function canDecide(role: Role | null, status: DecisionStatus): boolean {
  return status === "dipilih" ? role === "pemilik_proses" : role === "analis";
}

export function validateDecision(
  s: MockState,
  input: { investigationId: string; targetLinkId: string; status: DecisionStatus; reason: string; replacedByLinkId?: string },
): string | null {
  const { investigationId, targetLinkId, status, replacedByLinkId } = input;
  if (!input.reason.trim()) return "Alasan wajib diisi.";
  const inv = s.investigations.find((i) => i.id === investigationId);
  if (!inv) return "Workspace tidak ditemukan.";
  const candidate = (id: string) =>
    s.links.find((l) => l.id === id && l.investigationId === investigationId && l.kind === "kandidat");
  const target = candidate(targetLinkId);
  if (!target) return "Target keputusan harus berupa kandidat pada workspace ini.";
  if (status === "digantikan") {
    if (!replacedByLinkId) return "Kandidat pengganti wajib dipilih.";
    if (replacedByLinkId === targetLinkId) return "Pengganti harus berbeda dari kandidat yang digantikan.";
    if (!candidate(replacedByLinkId)) return "Pengganti harus berupa kandidat pada workspace ini.";
  }
  const item = s.findings
    .filter((f) => f.projectId === inv.projectId)
    .flatMap((f) => f.evidence)
    .find((e) => e.id === target.targetId && e.kind === "kandidat");
  return decisionBlocker(status, !!item?.validated, inv.status);
}

// Syarat status yang bergantung pada kandidat dan workspace; dipakai reducer dan UI (opsi nonaktif).
export function decisionBlocker(status: DecisionStatus, validated: boolean, invStatus: InvestigationStatus): string | null {
  if ((status === "dipilih" || status === "usulan_uji_coba") && !validated) {
    return "Hanya kandidat yang sudah tervalidasi yang bisa dipilih atau diusulkan uji coba.";
  }
  if (status !== "perlu_investigasi" && invStatus !== "siap_diputuskan") return "Workspace harus berstatus siap diputuskan.";
  return null;
}

export function snapshotFor(s: MockState, projectId: string, narrativeVersion: string | null): EvidenceSnapshot {
  const a = s.analysisStates.find((x) => x.projectId === projectId);
  return {
    datasetVersion: a?.datasetVersion ?? "",
    contextPackage: a?.contextPackage ?? "",
    analysis: a?.analysis ?? "",
    evidencePackage: a?.evidencePackage ?? "",
    narrativeVersion,
    metricValues: { ...a?.metricValues },
    ruleVersions: { ...a?.ruleVersions },
  };
}

export function decisionHistory(s: MockState, investigationId: string, targetLinkId: string): Decision[] {
  return s.decisions
    .filter((d) => d.investigationId === investigationId && d.targetLinkId === targetLinkId)
    .sort((a, b) => b.version - a.version);
}

export function latestDecisions(s: MockState, investigationId: string): Decision[] {
  const latest = new Map<string, Decision>();
  for (const d of s.decisions) {
    if (d.investigationId !== investigationId) continue;
    const cur = latest.get(d.targetLinkId);
    if (!cur || d.version > cur.version) latest.set(d.targetLinkId, d);
  }
  return [...latest.values()];
}

// ---------- Validasi ulang ----------
function metricLabel(key: string, from: number, to: number): string {
  const range = `dari ${nf.format(from)} ke ${nf.format(to)}`;
  return key === "finding_42.p90_days" ? `P90 berubah ${range} hari kerja` : `Metrik ${key} berubah ${range}`;
}

export function detectRevalidation(decision: Decision, current: AnalysisState): string[] {
  const snap = decision.snapshot;
  const out: string[] = [];
  const pairs: [string, string, string][] = [
    ["Dataset", snap.datasetVersion, current.datasetVersion],
    ["Paket konteks", snap.contextPackage, current.contextPackage],
    ["Analisis", snap.analysis, current.analysis],
    ["Paket bukti", snap.evidencePackage, current.evidencePackage],
  ];
  for (const [label, from, to] of pairs) if (from !== to) out.push(`${label} ${from} → ${to}`);
  for (const [key, from] of Object.entries(snap.ruleVersions)) {
    const to = current.ruleVersions[key];
    if (to !== undefined && to !== from) out.push(`Aturan ${key} ${from} → ${to}`);
  }
  for (const [key, from] of Object.entries(snap.metricValues)) {
    const to = current.metricValues[key];
    if (to === undefined) continue;
    const rel = from === 0 ? (to === 0 ? 0 : Infinity) : Math.abs(to - from) / Math.abs(from);
    if (rel > REVALIDATION_THRESHOLD) out.push(metricLabel(key, from, to));
  }
  return out;
}

// Simulasi demo "analisis baru": semua versi naik satu, r-sla naik satu, P90 memburuk.
const bump = (v: string) => v.replace(/\d+$/, (n) => String(Number(n) + 1));
const P90 = "finding_42.p90_days";
export function nextAnalysisState(prev: AnalysisState): AnalysisState {
  const p90 = prev.metricValues[P90];
  return {
    ...prev,
    datasetVersion: bump(prev.datasetVersion),
    contextPackage: bump(prev.contextPackage),
    analysis: bump(prev.analysis),
    evidencePackage: bump(prev.evidencePackage),
    ruleVersions: { ...prev.ruleVersions, ...(prev.ruleVersions["r-sla"] ? { "r-sla": bump(prev.ruleVersions["r-sla"]) } : {}) },
    metricValues: { ...prev.metricValues, ...(p90 !== undefined ? { [P90]: p90 === 18.4 ? 22.1 : Math.round(p90 * 12) / 10 } : {}) },
  };
}

// Aturan: targetId = ruleKey, dibandingkan dengan ruleVersions; interpretasi tidak berversi;
// objek lain mengikuti versi analisis proyek.
export function linkFreshness(s: MockState, link: InvestigationLink): { latest: string; stale: boolean } {
  const projectId = s.investigations.find((i) => i.id === link.investigationId)?.projectId;
  const a = s.analysisStates.find((x) => x.projectId === projectId);
  const latest =
    link.kind === "interpretasi" ? undefined : link.kind === "aturan" ? a?.ruleVersions[link.targetId] : a?.analysis;
  return { latest: latest ?? link.linkedVersion, stale: latest !== undefined && latest !== link.linkedVersion };
}

// ---------- Sebutan ----------
// Token sebutan: `@nama` yang tidak menempel pada huruf/angka/_/. sebelumnya (jadi `a@b.com` dan `Dimas@Sari` bukan sebutan).
const MENTION = /(?<![\p{L}\p{N}_.])@([\p{L}\p{N}_]+)/gu;

export function extractMentions(body: string, members: User[]): string[] {
  const ids = new Set<string>();
  for (const [, handle] of body.matchAll(MENTION)) {
    const m = members.find((u) => u.name.split(/\s+/)[0].toLowerCase() === handle.toLowerCase());
    if (m) ids.add(m.id);
  }
  return [...ids];
}

// Pecah badan komentar menjadi potongan teks biasa dan sebutan `@nama` agar dirender tanpa HTML mentah.
export function splitMentions(body: string): { text: string; mention: boolean }[] {
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}
