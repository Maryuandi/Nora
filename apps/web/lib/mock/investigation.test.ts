import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import {
  canDecide, canSetStatus, decisionHistory, detectRevalidation, extractMentions, latestDecisions, linkFreshness,
  nextAnalysisState, snapshotFor, decisionBlocker, splitMentions, unreviewedModelOutputs, validateDecision,
} from "./investigation";
import type {
  AnalysisState, Decision, DecisionStatus, EvidenceSnapshot, InvestigationLink, InvestigationStatus, LinkKind,
  MockState, ModelReview, Role, User,
} from "./types";

const INV = "inv-1";
const link = (id: string, kind: LinkKind, targetId = id, linkedVersion = "v1"): InvestigationLink => ({
  id, investigationId: INV, kind, targetId, linkedVersion, createdBy: "u-rina", createdAt: "2026-10-01",
});
const review = (id: string, linkId: string, outcome: ModelReview["outcome"] = "dikonfirmasi"): ModelReview => ({
  id, investigationId: INV, linkId, outcome, reason: "", forEvalSet: false, by: "u-rina", at: "2026-10-02",
});
const snap = (over: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
  datasetVersion: "ds-2", contextPackage: "ctx-4", analysis: "analisis-3", evidencePackage: "ep-1",
  narrativeVersion: null, metricValues: { "finding_42.p90_days": 18.4 }, ruleVersions: { "r-sla": "v2" }, ...over,
});
const decision = (version: number, targetLinkId = "k1", status: DecisionStatus = "ditolak", snapshot = snap()): Decision => ({
  id: `d-${targetLinkId}-${version}`, investigationId: INV, projectId: "p-1", targetLinkId, version, status,
  reason: "alasan", byId: "u-rina", byRole: "analis", at: "2026-10-03", snapshot,
});
const analysis = (over: Partial<AnalysisState> = {}): AnalysisState => ({ projectId: "p-1", ...snap(), ...over } as AnalysisState);

// State kecil dirakit tangan; tidak bergantung seed M11.
function build(status: InvestigationStatus = "siap_diputuskan", validated = true): MockState {
  const s = structuredClone(initialState);
  Object.assign(s, { investigations: [], links: [], notes: [], comments: [], notifications: [], reviews: [], decisions: [], flags: [], proposals: [], analysisStates: [] });
  s.investigations.push({
    id: INV, projectId: "p-1", title: "t", question: "q", originFindingId: null, status,
    ownerId: "u-rina", memberIds: [], createdAt: "2026-10-01",
  });
  s.links.push(link("k1", "kandidat"), link("k2", "kandidat"), link("kt", "temuan"));
  s.findings.push({
    id: "f-x", projectId: "p-1", title: "f", summary: "", limitedContext: false,
    evidence: [
      { id: "k1", kind: "kandidat", title: "K1", detail: "", measured: true, validated },
      { id: "k2", kind: "kandidat", title: "K2", detail: "", measured: true, validated: true },
    ],
  });
  return s;
}

describe("unreviewedModelOutputs", () => {
  it("menghitung hasil_jev dan interpretasi tanpa tinjauan, mengabaikan jenis lain", () => {
    const s = build();
    s.links.push(link("j1", "hasil_jev"), link("i1", "interpretasi"));
    expect(unreviewedModelOutputs(s, INV).map((l) => l.id)).toEqual(["j1", "i1"]);
    s.reviews.push(review("r1", "j1"));
    expect(unreviewedModelOutputs(s, INV).map((l) => l.id)).toEqual(["i1"]);
  });
  it("hanya menghitung tautan milik workspace itu", () => {
    const s = build();
    s.links.push({ ...link("j9", "hasil_jev"), investigationId: "inv-lain" });
    expect(unreviewedModelOutputs(s, INV)).toEqual([]);
  });
  it("memakai tinjauan terakhir bila ada beberapa", () => {
    const s = build();
    s.links.push(link("j1", "hasil_jev"));
    s.reviews.push(review("r1", "j1", "dikoreksi"), review("r2", "j1", "dikonfirmasi"));
    expect(unreviewedModelOutputs(s, INV)).toEqual([]);
  });
});

describe("canSetStatus", () => {
  it("siap_diputuskan ditolak bila ada keluaran belum ditinjau", () => {
    const s = build("terbuka");
    s.links.push(link("j1", "hasil_jev"));
    expect(canSetStatus(s, INV, "siap_diputuskan")).toBeTruthy();
    s.reviews.push(review("r1", "j1"));
    expect(canSetStatus(s, INV, "siap_diputuskan")).toBeNull();
  });
  it("selesai butuh minimal satu keputusan", () => {
    const s = build();
    expect(canSetStatus(s, INV, "selesai")).toBeTruthy();
    s.decisions.push(decision(1));
    expect(canSetStatus(s, INV, "selesai")).toBeNull();
  });
  it("status lain selalu boleh", () => {
    const s = build();
    s.links.push(link("j1", "hasil_jev"));
    expect(canSetStatus(s, INV, "terbuka")).toBeNull();
    expect(canSetStatus(s, INV, "menunggu_informasi")).toBeNull();
  });
});

describe("canDecide", () => {
  const statuses: DecisionStatus[] = ["perlu_investigasi", "usulan_uji_coba", "dipilih", "ditolak", "digantikan"];
  const roles: (Role | null)[] = ["analis", "pemilik_proses", "administrator", null];
  const cases = statuses.flatMap((st) =>
    roles.map((r) => [r, st, st === "dipilih" ? r === "pemilik_proses" : r === "analis"] as const),
  );
  it.each(cases)("%s / %s -> %s", (role, status, expected) => {
    expect(canDecide(role, status)).toBe(expected);
  });
});

describe("validateDecision", () => {
  const ok = { investigationId: INV, targetLinkId: "k1", status: "ditolak" as DecisionStatus, reason: "alasan" };
  it("lengkap -> null", () => expect(validateDecision(build(), ok)).toBeNull());
  it("alasan kosong -> galat", () => expect(validateDecision(build(), { ...ok, reason: "  " })).toBeTruthy());
  it("digantikan tanpa pengganti -> galat", () =>
    expect(validateDecision(build(), { ...ok, status: "digantikan" })).toBeTruthy());
  it("pengganti sama dengan target -> galat", () =>
    expect(validateDecision(build(), { ...ok, status: "digantikan", replacedByLinkId: "k1" })).toBeTruthy());
  it("pengganti bukan kandidat -> galat", () =>
    expect(validateDecision(build(), { ...ok, status: "digantikan", replacedByLinkId: "kt" })).toBeTruthy());
  it("digantikan dengan pengganti kandidat lain -> null", () =>
    expect(validateDecision(build(), { ...ok, status: "digantikan", replacedByLinkId: "k2" })).toBeNull());
  it("target bukan kandidat -> galat", () =>
    expect(validateDecision(build(), { ...ok, targetLinkId: "kt" })).toBeTruthy());
  it("dipilih pada kandidat tidak tervalidasi -> galat", () =>
    expect(validateDecision(build("siap_diputuskan", false), { ...ok, status: "dipilih" })).toBeTruthy());
  it("dipilih pada kandidat tervalidasi -> null", () =>
    expect(validateDecision(build(), { ...ok, status: "dipilih" })).toBeNull());
  it("dipilih saat workspace bukan siap_diputuskan -> galat", () =>
    expect(validateDecision(build("terbuka"), { ...ok, status: "dipilih" })).toBeTruthy());
  it("perlu_investigasi saat terbuka -> null", () =>
    expect(validateDecision(build("terbuka"), { ...ok, status: "perlu_investigasi" })).toBeNull());
});

describe("decisionBlocker", () => {
  it("usulan_uji_coba pada kandidat tidak tervalidasi -> galat", () =>
    expect(decisionBlocker("usulan_uji_coba", false, "siap_diputuskan")).toMatch(/tervalidasi/));
  it("ditolak saat terbuka -> galat status", () => expect(decisionBlocker("ditolak", true, "terbuka")).toMatch(/siap diputuskan/));
  it("perlu_investigasi kapan saja, tanpa validasi -> null", () => expect(decisionBlocker("perlu_investigasi", false, "terbuka")).toBeNull());
  it("dipilih tervalidasi saat siap_diputuskan -> null", () => expect(decisionBlocker("dipilih", true, "siap_diputuskan")).toBeNull());
});

describe("snapshotFor", () => {
  it("menyalin AnalysisState proyek dan versi narasi", () => {
    const s = build();
    s.analysisStates.push(analysis());
    const sn = snapshotFor(s, "p-1", "n-2");
    expect(sn).toEqual(snap({ narrativeVersion: "n-2" }));
    expect(sn.metricValues).not.toBe(s.analysisStates[0].metricValues);
  });
});

describe("latestDecisions / decisionHistory", () => {
  it("versi tertinggi per target; riwayat menurun", () => {
    const s = build();
    s.decisions.push(decision(1), decision(3), decision(2), decision(1, "k2"));
    expect(latestDecisions(s, INV).map((d) => d.id).sort()).toEqual(["d-k1-3", "d-k2-1"]);
    expect(decisionHistory(s, INV, "k1").map((d) => d.version)).toEqual([3, 2, 1]);
  });
});

describe("detectRevalidation", () => {
  const d = decision(1);
  it("tanpa perubahan -> []", () => expect(detectRevalidation(d, analysis())).toEqual([]));
  it("dataset berubah", () =>
    expect(detectRevalidation(d, analysis({ datasetVersion: "ds-3" }))).toContain("Dataset ds-2 → ds-3"));
  it("paket konteks berubah", () =>
    expect(detectRevalidation(d, analysis({ contextPackage: "ctx-5" }))).toContain("Paket konteks ctx-4 → ctx-5"));
  it("versi aturan berubah", () =>
    expect(detectRevalidation(d, analysis({ ruleVersions: { "r-sla": "v3" } }))).toContain("Aturan r-sla v2 → v3"));
  it("metrik berubah > 5%", () =>
    expect(detectRevalidation(d, analysis({ metricValues: { "finding_42.p90_days": 22.1 } }))).toContain(
      "P90 berubah dari 18,4 ke 22,1 hari kerja",
    ));
  it("metrik berubah < 5% diabaikan", () =>
    expect(detectRevalidation(d, analysis({ metricValues: { "finding_42.p90_days": 18.9 } }))).toEqual([]));
  it("metrik lain memakai label generik", () =>
    expect(detectRevalidation(decision(1, "k1", "ditolak", snap({ metricValues: { "x.y": 10 } })), analysis({ metricValues: { "x.y": 20 } }))).toEqual(
      ["Metrik x.y berubah dari 10 ke 20"],
    ));
});

describe("linkFreshness", () => {
  it("aturan usang bila versi terbaru lebih baru", () => {
    const s = build();
    s.analysisStates.push(analysis({ ruleVersions: { "r-sla": "v3" } }));
    expect(linkFreshness(s, link("a1", "aturan", "r-sla", "v2"))).toEqual({ latest: "v3", stale: true });
    expect(linkFreshness(s, link("a2", "aturan", "r-sla", "v3"))).toEqual({ latest: "v3", stale: false });
  });
  it("tautan non-aturan dibandingkan dengan versi analisis", () => {
    const s = build();
    s.analysisStates.push(analysis());
    expect(linkFreshness(s, link("t1", "temuan", "f-x", "analisis-2"))).toEqual({ latest: "analisis-3", stale: true });
  });
});

describe("extractMentions", () => {
  const members = [
    { id: "u-dimas", name: "Dimas Pratama" },
    { id: "u-sari", name: "Sari Wulandari" },
  ] as User[];
  it("mencocokkan nama depan tanpa peka huruf, tanpa ganda, abaikan tak dikenal", () => {
    expect(extractMentions("cc @dimas dan @SARI, @tidakada @Dimas", members)).toEqual(["u-dimas", "u-sari"]);
  });
});

describe("nextAnalysisState", () => {
  it("menaikkan semua versi, r-sla, dan P90 18,4 -> 22,1; tidak mengubah masukan", () => {
    const prev = analysis({ datasetVersion: "ds-2", contextPackage: "ctx-4", analysis: "analisis-3", evidencePackage: "bukti-7", ruleVersions: { "r-sla": "v2", "r-urutan": "v1" } });
    const before = structuredClone(prev);
    expect(nextAnalysisState(prev)).toEqual({
      ...prev, datasetVersion: "ds-3", contextPackage: "ctx-5", analysis: "analisis-4", evidencePackage: "bukti-8",
      ruleVersions: { "r-sla": "v3", "r-urutan": "v1" }, metricValues: { "finding_42.p90_days": 22.1 },
    });
    expect(prev).toEqual(before);
  });
  it("P90 selain 18,4 dikali 1,2 dibulatkan satu desimal", () =>
    expect(nextAnalysisState(analysis({ metricValues: { "finding_42.p90_days": 22.1 } })).metricValues["finding_42.p90_days"]).toBe(26.5));
});

describe("splitMentions", () => {
  it("memisahkan sebutan dari teks biasa dan menjaga urutan", () => {
    expect(splitMentions("cc @Dimas, lihat <b>ini</b> @sari")).toEqual([
      { text: "cc ", mention: false }, { text: "@Dimas", mention: true },
      { text: ", lihat <b>ini</b> ", mention: false }, { text: "@sari", mention: true },
    ]);
  });
  it("tanpa sebutan menghasilkan satu potongan; kosong menghasilkan larik kosong", () => {
    expect(splitMentions("halo")).toEqual([{ text: "halo", mention: false }]);
    expect(splitMentions("")).toEqual([]);
  });
  it("@ kosong di awal bukan sebutan", () =>
    expect(splitMentions("@ tolong cek")).toEqual([{ text: "@ tolong cek", mention: false }]));
  it("alamat surel bukan sebutan", () =>
    expect(splitMentions("kirim ke a@b.com ya")).toEqual([{ text: "kirim ke a@b.com ya", mention: false }]));
  it("tanda baca setelah nama tidak ikut ditebalkan", () =>
    expect(splitMentions("@Dimas, lihat")).toEqual([{ text: "@Dimas", mention: true }, { text: ", lihat", mention: false }]));
  it("nama tak dikenal tetap token sebutan (reducer yang memutuskan notifikasi)", () =>
    expect(splitMentions("cc @tidakada")).toEqual([{ text: "cc ", mention: false }, { text: "@tidakada", mention: true }]));
  it("@@Dimas: hanya @Dimas yang ditebalkan", () =>
    expect(splitMentions("@@Dimas")).toEqual([{ text: "@", mention: false }, { text: "@Dimas", mention: true }]));
  it("@Dimas@Sari dibaca satu sebutan; @Sari menempel pada kata sehingga dianggap seperti surel", () =>
    expect(splitMentions("@Dimas@Sari")).toEqual([{ text: "@Dimas", mention: true }, { text: "@Sari", mention: false }]));
  it("extractMentions memakai aturan yang sama (surel dan token menempel diabaikan)", () => {
    const members = [{ id: "u-dimas", name: "Dimas Pratama" }, { id: "u-sari", name: "Sari Hartono" }] as User[];
    expect(extractMentions("a@sari.com @Dimas@Sari", members)).toEqual(["u-dimas"]);
  });
});
