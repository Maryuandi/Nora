import { describe, expect, it } from "vitest";
import { candidates, findings } from "./assessment-data";
import { currentAssessments, deriveStatus, effective, hasModelVerdict, reviewQueue, runFixture, summarize, topTwo, totalScore } from "./assessment";
import { initialState } from "./data";
import type { Assessment, AssessmentCorrection, AssessmentStatus, Relevance } from "./types";

const crit = (weights: number[]) => weights.map((weight, i) => ({ key: `k${i + 1}`, label: `K${i + 1}`, weight, scale: [] }));
const sc = (levels: number[]) => levels.map((level, i) => ({ key: `k${i + 1}`, level, probs: [0.2, 0.2, 0.2, 0.2, 0.2] }));
const probs = (r: number, s: number, t: number, i: number): Record<Relevance, number> => ({ relevan: r, sebagian_relevan: s, tidak_relevan: t, informasi_tidak_cukup: i });

describe("totalScore", () => {
  it("computes weighted 0-100 with one decimal", () => {
    expect(totalScore(sc([4, 5, 4]), crit([0.5, 0.3, 0.2]))).toBe(82.5);
    expect(totalScore(sc([1, 1, 1]), crit([0.5, 0.3, 0.2]))).toBe(0);
    expect(totalScore(sc([5, 5, 5]), crit([0.5, 0.3, 0.2]))).toBe(100);
  });
  it("renormalises over scored criteria only", () => {
    expect(totalScore(sc([5]), crit([0.5, 0.3, 0.2]))).toBe(100);
    expect(totalScore(sc([1]), crit([0.5, 0.3, 0.2]))).toBe(0);
  });
  it("returns null without scores", () => {
    expect(totalScore([], crit([0.5, 0.5]))).toBeNull();
  });
});

describe("deriveStatus", () => {
  const ok = probs(0.8, 0.1, 0.05, 0.05);
  it("sufficient threshold is exclusive at 0.5", () => {
    expect(deriveStatus({ sufficientProb: 0.49, relevanceProbs: ok })).toBe("informasi_tidak_cukup");
    expect(deriveStatus({ sufficientProb: 0.5, relevanceProbs: ok })).toBe("otomatis");
  });
  it("top prob threshold at 0.6", () => {
    expect(deriveStatus({ sufficientProb: 1, relevanceProbs: probs(0.59, 0.1, 0.1, 0.21) })).toBe("perlu_review");
    expect(deriveStatus({ sufficientProb: 1, relevanceProbs: probs(0.6, 0.3, 0.05, 0.05) })).toBe("otomatis");
  });
  it("margin threshold at 0.15", () => {
    expect(deriveStatus({ sufficientProb: 1, relevanceProbs: probs(0.6, 0.46, 0, 0) })).toBe("perlu_review");
    expect(deriveStatus({ sufficientProb: 1, relevanceProbs: probs(0.75, 0.6, 0, 0) })).toBe("otomatis");
  });
  it("failed beats everything, pending next", () => {
    expect(deriveStatus({ sufficientProb: 0, relevanceProbs: ok, failed: true, pending: true })).toBe("gagal");
    expect(deriveStatus({ sufficientProb: 0, relevanceProbs: ok, pending: true })).toBe("tertunda");
  });
  it("tie gives perlu_review with margin 0", () => {
    const p = probs(0.4, 0.4, 0.1, 0.1);
    expect(deriveStatus({ sufficientProb: 1, relevanceProbs: p })).toBe("perlu_review");
    expect(topTwo(p).margin).toBe(0);
    expect(topTwo(p).top[0]).toBe("relevan");
  });
});

const mk = (id: string, status: AssessmentStatus, p: Record<Relevance, number>, over: Partial<Assessment> = {}): Assessment => ({
  id, projectId: "p-p2p", findingId: "f-bottleneck", candidateId: id, status, sufficient: { prob: 0.9 }, scores: [], relevance: { probs: p },
  modelId: "m", specVersion: 1, evidenceBundleId: "eb", runId: "r", createdAt: "2026-10-17T09:00:00Z", rawOutputRef: "raw", ...over,
});
const corr = (id: string, assessmentId: string, relevance: Relevance, at: string): AssessmentCorrection => ({
  id, assessmentId, actorId: "u-rina", at, relevance, reason: "x", addToGoldSet: false, confirmedOnly: false,
});

describe("effective", () => {
  const a = Object.freeze(mk("a", "otomatis", Object.freeze(probs(0.8, 0.1, 0.05, 0.05)) as Record<Relevance, number>)) as Assessment;
  it("uses model argmax without corrections", () => {
    expect(effective(a, [])).toEqual({ relevance: "relevan", source: "model" });
  });
  it("latest correction wins; time ties go to the later index", () => {
    const c1 = corr("c1", "a", "tidak_relevan", "2026-10-17T10:00:00Z");
    const c2 = corr("c2", "a", "sebagian_relevan", "2026-10-17T11:00:00Z");
    expect(effective(a, [c2, c1])).toEqual({ relevance: "sebagian_relevan", source: "analis", correction: c2 });
    const t1 = corr("t1", "a", "tidak_relevan", "2026-10-17T10:00:00Z");
    const t2 = corr("t2", "a", "relevan", "2026-10-17T10:00:00Z");
    expect(effective(a, [t1, t2]).correction).toBe(t2);
    expect(effective(a, [corr("o", "other", "tidak_relevan", "2026-10-18T00:00:00Z")]).source).toBe("model");
  });
});

describe("reviewQueue / currentAssessments / summarize", () => {
  const low = probs(0.5, 0.3, 0.1, 0.1);
  const lower = probs(0.4, 0.39, 0.11, 0.1);
  const rows = [
    mk("pend", "tertunda", low), mk("info", "informasi_tidak_cukup", low), mk("rev1", "perlu_review", low), mk("rev2", "perlu_review", lower),
    mk("fail", "gagal", low), mk("auto", "otomatis", probs(0.9, 0.05, 0.03, 0.02)), mk("fixed", "perlu_review", lower),
    mk("old", "perlu_review", lower, { supersededBy: "rev1" }), mk("other", "gagal", low, { findingId: "f-rework" }),
  ];
  const s = { ...initialState, assessments: rows, corrections: [corr("c", "fixed", "relevan", "2026-10-17T10:00:00Z")] };
  it("orders gagal, perlu_review by margin, info, tertunda; hides corrected and superseded", () => {
    expect(reviewQueue(s, "p-p2p", { findingId: "f-bottleneck" }).map((x) => x.id)).toEqual(["fail", "rev2", "rev1", "info", "pend"]);
  });
  it("filters by status and project", () => {
    expect(reviewQueue(s, "p-p2p", { status: "gagal" }).map((x) => x.id)).toEqual(["fail", "other"]);
    expect(reviewQueue(s, "p-none")).toEqual([]);
  });
  it("currentAssessments drops superseded", () => {
    expect(currentAssessments(s, "f-bottleneck").map((x) => x.id)).not.toContain("old");
  });
  it("summarize counts all statuses, corrections and unscored", () => {
    const r = summarize(s, "f-bottleneck");
    expect(r.byStatus).toEqual({ otomatis: 1, perlu_review: 3, informasi_tidak_cukup: 1, gagal: 1, tertunda: 1 });
    expect(r.corrected).toBe(1);
    expect(summarize(initialState, "f-rework")).toMatchObject({ unscored: 1, corrected: 0 });
  });
});

describe("runFixture", () => {
  const f = findings[0];
  const ctx = { runId: "r1", at: "2026-10-17T09:00:00Z" };
  const byId = (xs: Assessment[], c: string) => xs.find((x) => x.candidateId === c)!;
  it("skips non-applicable candidates and honours `only`", () => {
    const out = runFixture(f, candidates, ctx);
    expect(out.map((x) => x.candidateId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(runFixture(f, candidates, { ...ctx, only: ["c2"] }).map((x) => x.candidateId)).toEqual(["c2"]);
  });
  it("is deterministic apart from runId", () => {
    const strip = (xs: Assessment[]) => xs.map((x) => ({ ...x, id: "", runId: "", rawOutputRef: "" }));
    expect(strip(runFixture(f, candidates, ctx))).toEqual(strip(runFixture(f, candidates, { ...ctx, runId: "r2" })));
    expect(byId(runFixture(f, candidates, ctx), "c1").id).toBe("r1-c1");
  });
  it("derives statuses", () => {
    const out = runFixture(f, candidates, ctx);
    expect(byId(out, "c1").status).toBe("otomatis");
    expect(byId(out, "c3").status).toBe("perlu_review");
    expect(byId(out, "c5")).toMatchObject({ status: "informasi_tidak_cukup", scores: [] });
    const out2 = runFixture(findings[1], candidates, ctx);
    expect(byId(out2, "c8")).toMatchObject({ status: "gagal", scores: [] });
  });
});

describe("hasModelVerdict", () => {
  it.each([["otomatis", true], ["perlu_review", true], ["informasi_tidak_cukup", true], ["gagal", false], ["tertunda", false]] as const)(
    "%s -> %s", (status, expected) => expect(hasModelVerdict({ status })).toBe(expected),
  );
});
