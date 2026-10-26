import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITY_WEIGHTS, finalValidationStatus, normalizeFiveScale, priorityScore } from "./recommendation.ts";

describe("priorityScore", () => {
  it("applies the default formula when every component is present", () => {
    const r = priorityScore({ relevance: 1, problemMagnitude: 0.5, evidenceConfidence: 0.8, effort: 0.25, risk: 0 }, DEFAULT_PRIORITY_WEIGHTS);
    // (0.30 + 0.15 + 0.12 − 0.0375 − 0) / 1.0
    expect(r.score).toBeCloseTo(0.5325, 4);
    expect(r.partial).toBe(false);
  });
  it("drops a missing component from numerator and denominator", () => {
    const r = priorityScore({ relevance: 1, problemMagnitude: 0.5, evidenceConfidence: 0.8, effort: null, risk: null }, DEFAULT_PRIORITY_WEIGHTS);
    expect(r.score).toBeCloseTo((0.3 + 0.15 + 0.12) / 0.75, 4);
    expect(r.missing).toEqual(["effort", "risk"]);
    expect(r.partial).toBe(true);
  });
  it("returns no score when nothing is available", () => {
    expect(priorityScore({ relevance: null, problemMagnitude: null, evidenceConfidence: null, effort: null, risk: null }, DEFAULT_PRIORITY_WEIGHTS).score).toBeNull();
  });
});

describe("finalValidationStatus", () => {
  it("lets the heaviest failure win", () => {
    expect(finalValidationStatus(["needs_review", "insufficient_information", null])).toBe("insufficient_information");
    expect(finalValidationStatus(["needs_review", "not_eligible"])).toBe("not_eligible");
    expect(finalValidationStatus([null, null])).toBe("validated");
  });
});

describe("normalizeFiveScale", () => {
  it("maps 1..5 to 0..1 and keeps unknowns missing", () => {
    expect(normalizeFiveScale(1)).toBe(0);
    expect(normalizeFiveScale(5)).toBe(1);
    expect(normalizeFiveScale(null)).toBeNull();
  });
});
