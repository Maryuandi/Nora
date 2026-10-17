import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, buildBaseline, compareRanks, priorityBreakdown, rankCandidates, validateCandidate, validateWeights, type Evaluated } from "./recommend";
import type { JevResult, RecCandidate, RecFinding, Role } from "./types";

const finding: RecFinding = {
  id: "f1", projectId: "p", title: "T", summary: "",
  metrics: [{ key: "wait_days_p90", label: "Waktu tunggu P90", value: 9.4, unit: "hari" }, { key: "approval_load", label: "Beban approver", value: 71, unit: "%" }],
  affectedShare: 0.6, waitShare: 0.5, supportCases: 15, activeRefs: { "kebijakan-approval": 3 },
};
const jev = (over: Partial<JevResult> = {}): JevResult => ({ status: "otomatis", score: 80, criteria: [], prob: 0.9, conclusion: "relevan", ...over });
const cand = (over: Partial<RecCandidate> = {}): RecCandidate => ({
  id: "k1", kind: "intervensi", origin: "katalog", proposeToCatalog: false, name: "K", description: "", addresses: "", successMetric: "",
  findingIds: ["f1"],
  conditions: [{ label: "Beban tinggi", metricKey: "approval_load", op: ">=", value: 50 }],
  refMetrics: [{ metricKey: "wait_days_p90", expected: 9.4 }],
  refs: [{ key: "kebijakan-approval", version: 3 }],
  ownerRole: "pemilik_proses", effort: 2, risk: 3, prerequisites: [], exclusions: [],
  jev: { f1: jev() }, ...over,
});
const roles: Role[] = ["analis", "pemilik_proses"];
const check = (c: RecCandidate, key: string, memberRoles = roles) => validateCandidate(c, finding, { memberRoles }).checks.find((x) => x.key === key)!;

describe("validateCandidate", () => {
  it("all pass -> tervalidasi with five ordered checks", () => {
    const v = validateCandidate(cand(), finding, { memberRoles: roles });
    expect(v.status).toBe("tervalidasi");
    expect(v.checks.map((c) => c.key)).toEqual(["syarat", "angka", "versi", "kewenangan", "jev"]);
    expect(v.checks.every((c) => c.result === "lolos")).toBe(true);
    expect(v.missing).toEqual([]);
  });
  it("syarat gagal -> tidak_memenuhi_syarat, even when jev is unrated", () => {
    const c = cand({ conditions: [{ label: "x", metricKey: "approval_load", op: ">=", value: 90 }] });
    expect(validateCandidate(c, finding, { memberRoles: roles }).status).toBe("tidak_memenuhi_syarat");
    const c2 = { ...c, jev: {} };
    const v = validateCandidate(c2, finding, { memberRoles: roles });
    expect(v.status).toBe("tidak_memenuhi_syarat");
    expect(v.checks[0].result).toBe("gagal");
  });
  it("syarat metric missing -> belum_layak_dinilai with M06 source", () => {
    const c = cand({ conditions: [{ label: "x", metricKey: "after_hours_share", op: ">", value: 0.1 }] });
    const v = validateCandidate(c, finding, { memberRoles: roles });
    expect(v.status).toBe("belum_layak_dinilai");
    expect(v.checks[0].result).toBe("tidak_dapat_diperiksa");
    expect(v.missing).toContainEqual({ what: "Metrik after_hours_share", from: "M06" });
  });
  it("jev belum_dinilai (or no entry) -> belum_layak_dinilai with M08 source", () => {
    for (const j of <Record<string, JevResult>[]>[{ f1: jev({ status: "belum_dinilai", score: null, prob: null, conclusion: null }) }, {}]) {
      const v = validateCandidate(cand({ jev: j }), finding, { memberRoles: roles });
      expect(v.status).toBe("belum_layak_dinilai");
      expect(v.missing.some((m) => m.from === "M08")).toBe(true);
    }
  });
  it("version mismatch -> perlu_review with updated-reference reason", () => {
    const c = cand({ refs: [{ key: "kebijakan-approval", version: 2 }] });
    const v = validateCandidate(c, finding, { memberRoles: roles });
    expect(v.status).toBe("perlu_review");
    expect(check(c, "versi").result).toBe("gagal");
    expect(check(c, "versi").reason).toContain("acuan telah diperbarui (v2 → v3)");
  });
  it("reference metric: >1% off fails, 0.5% passes, missing fails", () => {
    expect(check(cand({ refMetrics: [{ metricKey: "wait_days_p90", expected: 10 }] }), "angka").result).toBe("gagal");
    expect(check(cand({ refMetrics: [{ metricKey: "wait_days_p90", expected: 9.45 }] }), "angka").result).toBe("lolos");
    expect(check(cand({ refMetrics: [{ metricKey: "nope", expected: 1 }] }), "angka").result).toBe("gagal");
    expect(validateCandidate(cand({ refMetrics: [{ metricKey: "wait_days_p90", expected: 10 }] }), finding, { memberRoles: roles }).status).toBe("perlu_review");
  });
  it("kewenangan: null owner untestable, missing member fails, present passes", () => {
    expect(check(cand({ ownerRole: null }), "kewenangan").result).toBe("tidak_dapat_diperiksa");
    expect(check(cand(), "kewenangan", ["analis"]).result).toBe("gagal");
    expect(check(cand(), "kewenangan").result).toBe("lolos");
  });
  it("jev tidak_relevan or perlu_review -> perlu_review", () => {
    expect(validateCandidate(cand({ jev: { f1: jev({ conclusion: "tidak_relevan" }) } }), finding, { memberRoles: roles }).status).toBe("perlu_review");
    expect(validateCandidate(cand({ jev: { f1: jev({ status: "perlu_review" }) } }), finding, { memberRoles: roles }).status).toBe("perlu_review");
    expect(validateCandidate(cand({ jev: { f1: jev({ status: "dikonfirmasi", conclusion: "sebagian_relevan" }) } }), finding, { memberRoles: roles }).status).toBe("tervalidasi");
  });
});

describe("priorityBreakdown", () => {
  it("matches the hand calculation", () => {
    const b = priorityBreakdown(cand(), finding, DEFAULT_WEIGHTS);
    expect(b.components.map((c) => c.raw)).toEqual([0.8, expect.closeTo(0.3, 6), expect.closeTo(0.45, 6), 0.25, 0.5]);
    const contrib = b.components.map((c) => c.contribution!);
    [0.24, 0.09, 0.0675, -0.0375, -0.05].forEach((e, i) => expect(contrib[i]).toBeCloseTo(e, 6));
    expect(b.total).toBeCloseTo(0.31, 3);
    expect(b.partial).toBe(false);
    expect(b.available).toBe(5);
  });
  it("null effort and risk are excluded, not defaulted", () => {
    const b = priorityBreakdown(cand({ effort: null, risk: null }), finding, DEFAULT_WEIGHTS);
    expect(b.components[3].contribution).toBeNull();
    expect(b.components[4].contribution).toBeNull();
    expect(b.total).toBeCloseTo(0.3975, 2);
    expect(b.partial).toBe(true);
    expect(b.available).toBe(3);
  });
  it("no jev -> finite total from magnitude only", () => {
    const b = priorityBreakdown(cand({ jev: {}, effort: null, risk: null }), finding, DEFAULT_WEIGHTS);
    expect(Number.isFinite(b.total)).toBe(true);
    expect(b.available).toBe(1);
    expect(b.total).toBeCloseTo(0.09, 3);
  });
});

describe("rankCandidates", () => {
  const ev = (id: string, over: Partial<RecCandidate>): Evaluated => {
    const c = cand({ id, ...over });
    return { c, v: validateCandidate(c, finding, { memberRoles: roles }), b: priorityBreakdown(c, finding, DEFAULT_WEIGHTS) };
  };
  const items = [ev("b", {}), ev("a", {}), ev("c", { jev: { f1: jev({ score: 95 }) } }), ev("x", { refs: [{ key: "kebijakan-approval", version: 1 }] })];
  it("ranks only tervalidasi by total desc, ties by id", () => {
    const { ranked, unranked } = rankCandidates(items);
    expect(ranked.map((e) => e.c.id)).toEqual(["c", "a", "b"]);
    expect(unranked.map((e) => e.c.id)).toEqual(["x"]);
  });
  it("is independent of input order", () => {
    const expected = rankCandidates(items).ranked.map((e) => e.c.id);
    for (let i = 0; i < 5; i++) {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      expect(rankCandidates(shuffled).ranked.map((e) => e.c.id)).toEqual(expected);
    }
  });
});

describe("compareRanks", () => {
  it("reports movement, additions and removals", () => {
    const r = compareRanks(["a", "b", "c"], ["b", "a", "d"]);
    expect(r.find((x) => x.id === "b")).toEqual({ id: "b", from: 2, to: 1, delta: 1 });
    expect(r.find((x) => x.id === "a")).toEqual({ id: "a", from: 1, to: 2, delta: -1 });
    expect(r.find((x) => x.id === "c")).toEqual({ id: "c", from: 3, to: null, delta: 0 });
    expect(r.find((x) => x.id === "d")).toEqual({ id: "d", from: null, to: 3, delta: 0 });
  });
});

describe("validateWeights", () => {
  it("accepts defaults", () => expect(validateWeights(DEFAULT_WEIGHTS)).toMatchObject({ ok: true, sum: 1 }));
  it("rejects negative, >1 and NaN", () => {
    for (const bad of [-0.1, 1.2, NaN]) {
      const r = validateWeights({ ...DEFAULT_WEIGHTS, risk: bad });
      expect(r.ok).toBe(false);
      expect(r.message).toBeTruthy();
    }
  });
  it("warns but allows a sum other than 1", () => {
    const r = validateWeights({ ...DEFAULT_WEIGHTS, relevance: 0.5 });
    expect(r.ok).toBe(true);
    expect(r.message).toBeTruthy();
  });
});

describe("buildBaseline", () => {
  it("collects condition and reference metrics without duplicates", () => {
    const c = cand({ conditions: [{ label: "x", metricKey: "wait_days_p90", op: ">", value: 1 }, { label: "y", metricKey: "approval_load", op: ">", value: 1 }] });
    expect(buildBaseline(c, finding)).toEqual([
      { label: "Waktu tunggu P90", value: 9.4, unit: "hari" },
      { label: "Beban approver", value: 71, unit: "%" },
    ]);
  });
});
