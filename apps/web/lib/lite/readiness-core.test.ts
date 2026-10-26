import { describe, expect, it } from "vitest";
import { computeReadiness, computeState, type ReadinessFacts } from "./readiness-core";

const empty: ReadinessFacts = { sourceCount: 0, readySnapshotCount: 0, dataset: null, context: null, analysis: null, findings: { bottleneck: 0, rework: 0 } };
const dataset = { id: "d", name: "v1", publishedAt: "2026-01-01T00:00:00Z", qualityStatus: "ready" };
const context = { id: "c", name: "ctx", activatedAt: "2026-01-01T00:00:00Z", conformanceAvailable: false };

describe("computeState", () => {
  it.each([
    [empty, "needs_source"],
    [{ ...empty, sourceCount: 1 }, "needs_valid_snapshot"],
    [{ ...empty, sourceCount: 1, readySnapshotCount: 1 }, "needs_dataset"],
    [{ ...empty, sourceCount: 1, readySnapshotCount: 1, dataset }, "needs_context"],
    [{ ...empty, sourceCount: 1, readySnapshotCount: 1, dataset, context }, "ready_to_analyze"],
    [{ ...empty, sourceCount: 1, readySnapshotCount: 1, dataset, context, analysis: { id: "a", completedAt: "x" } }, "results_ready"],
  ] as const)("%#", (facts, state) => expect(computeState(facts)).toBe(state));
});

describe("computeReadiness", () => {
  it("asks an administrator to activate a draft project", () => {
    expect(computeReadiness(empty, "draft", true).cta.section).toBe("activate");
    expect(computeReadiness(empty, "draft", false).cta.section).toBeNull();
  });
  it("flags conformance as unavailable without BPMN", () => {
    expect(computeReadiness({ ...empty, context }, "active", true).conformanceUnavailable).toBe(true);
  });
  it("withholds the CTA when a dependency failed", () => {
    const r = computeReadiness(empty, "active", true, [{ component: "sources", correlationId: "x" }]);
    expect(r.cta.section).toBeNull();
    expect(r.state).toBe("needs_source");
  });
});
