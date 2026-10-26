import { describe, expect, it } from "vitest";
import { aggregateScore, ChoiceResult, uncertainty } from "./assessment.ts";

describe("aggregateScore", () => {
  it("normalises each criterion to its scale and weights it", () => {
    expect(aggregateScore([{ key: "a", weight: 0.6, score: 4, scale: [0, 4] }, { key: "b", weight: 0.4, score: 2, scale: [0, 4] }]).total).toBe(0.8);
  });
  it("never fills a missing criterion with a default", () => {
    expect(aggregateScore([{ key: "a", weight: 0.5, score: 4, scale: [0, 4] }, { key: "b", weight: 0.5, score: null, scale: [0, 4] }])).toEqual({ total: null, missing: ["b"] });
  });
});

describe("uncertainty", () => {
  it("flags a low top probability", () => expect(uncertainty([{ probability: 0.55 }, { probability: 0.45 }], 0.6, 0.15).uncertain).toBe(true));
  it("flags a small margin", () => expect(uncertainty([{ probability: 0.62 }, { probability: 0.5 }], 0.6, 0.15).uncertain).toBe(true));
  it("accepts a confident answer", () => expect(uncertainty([{ probability: 0.8 }, { probability: 0.1 }], 0.6, 0.15).uncertain).toBe(false));
});

describe("ChoiceResult", () => {
  it("rejects probabilities that do not sum to 1", () => {
    expect(ChoiceResult.safeParse({ requestId: "r", model: "m", modelVersion: "1", latencyMs: 1, cost: null, distribution: [{ option: "a", probability: 0.9 }, { option: "b", probability: 0.5 }] }).success).toBe(false);
  });
});
