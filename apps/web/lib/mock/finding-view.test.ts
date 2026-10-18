import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { attentionCount, fmtMeasure, resolveBaseline } from "./finding-view";

const [run1, run2] = ["run-1", "run-2"].map((id) => initialState.runs.find((r) => r.id === id)!);

describe("finding badges helpers", () => {
  it("counts baru + memburuk vs default baseline", () => {
    expect(attentionCount(initialState, run2)).toBeGreaterThan(0);
    expect(attentionCount(initialState, run1)).toBeGreaterThanOrEqual(0);
  });
  it("resolveBaseline: none, explicit, unknown fall back", () => {
    expect(resolveBaseline(initialState, run2, "none")).toBeNull();
    expect(resolveBaseline(initialState, run2, "run-1")?.id).toBe("run-1");
    expect(resolveBaseline(initialState, run2, "zzz")?.id).toBe("run-1");
    expect(resolveBaseline(initialState, run2, "run-2")?.id).toBe("run-1");
  });
  it("fmtMeasure", () => {
    expect(fmtMeasure(null, "%")).toBe("—");
    expect(fmtMeasure(12.34, "%")).toBe("12,3%");
  });
});
