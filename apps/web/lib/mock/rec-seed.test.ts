import { describe, expect, it } from "vitest";
import { evaluateFinding, initialState, latestPolicy } from "./reducer";
import { DEFAULT_WEIGHTS } from "./recommend";

describe("M09 seed", () => {
  const ev = () => evaluateFinding(initialState, "f-approval")!;
  it("ranks validated candidates in a fixed order", () => {
    expect(ev().ranked.map((e) => e.c.id)).toEqual(["k-delegasi", "k-cadangan", "k-eskalasi", "k-otomatisasi"]);
    expect(ev().ranked.map((e) => e.c.id)).toEqual(evaluateFinding(initialState, "f-approval")!.ranked.map((e) => e.c.id));
  });
  it("shows each non-ranked status", () => {
    const by = Object.fromEntries(ev().unranked.map((e) => [e.c.id, e.v.status]));
    expect(by).toEqual({
      "k-audit": "belum_layak_dinilai", "k-vendor": "tidak_memenuhi_syarat", "k-rotasi": "perlu_review", "k-awalpekan": "perlu_review",
    });
    expect(ev().unranked.find((e) => e.c.id === "k-audit")!.v.missing.length).toBeGreaterThan(0);
  });
  it("flags the candidate without effort/risk and the analyst addition", () => {
    const esk = ev().ranked.find((e) => e.c.id === "k-eskalasi")!;
    expect(esk.b.partial).toBe(true);
    expect(esk.b.available).toBe(3);
    expect(ev().unranked.find((e) => e.c.id === "k-awalpekan")!.c.origin).toBe("analis");
  });
  it("ships default policy v1, one scenario and one trial draft", () => {
    expect(latestPolicy(initialState, "p-p2p")).toMatchObject({ version: 1, weights: DEFAULT_WEIGHTS });
    expect(initialState.scenarios).toHaveLength(1);
    expect(initialState.trials).toHaveLength(1);
    expect(initialState.trials[0].baseline.length).toBeGreaterThan(0);
  });
  it("second finding has validated candidates", () => {
    expect(evaluateFinding(initialState, "f-rework")!.ranked.length).toBe(2);
  });
});
