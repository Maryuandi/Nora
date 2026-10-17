import { describe, expect, it } from "vitest";
import { initialState, findingsForProject, interpretationsForProject, reduce, type MockAction } from "./reducer";
import type { MockState } from "./types";

const s0 = (): MockState => structuredClone(initialState);
const req = (over: Partial<Extract<MockAction, { type: "requestInterpretation" }>> = {}): MockAction =>
  ({ type: "requestInterpretation", projectId: "p-p2p", findingId: "finding_42", audience: "analis", ...over });
const seed63 = (s: MockState) => s.interpretations.find((i) => i.findingId === "finding_63")!;
const lastViolation = (s: MockState) => {
  const att = seed63(s).attempts;
  return att[att.length - 1].violations.find((v) => v.check === "bahasa_keputusan")!;
};
const override = (s: MockState, over: Partial<Extract<MockAction, { type: "overrideCheck" }>> = {}): MockAction =>
  ({ type: "overrideCheck", interpretationId: seed63(s).id, check: "bahasa_keputusan", claimId: lastViolation(s).claimId, reason: "positif palsu", ...over });

describe("requestInterpretation", () => {
  it("adds a passing draft and exactly one audit event", () => {
    const before = s0();
    const r = reduce(before, req());
    expect(r.error).toBeUndefined();
    expect(r.state.interpretations.length).toBe(before.interpretations.length + 1);
    const made = r.state.interpretations.find((i) => i.id === r.interpretationId)!;
    expect(made).toMatchObject({ projectId: "p-p2p", findingId: "finding_42", audience: "analis", status: "lolos_pemeriksaan", overrides: [], createdBy: before.viewerId, templateVersion: "tiruan-1", model: "model-tiruan" });
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "interpretation.minta", objectType: "Interpretation", objectLabel: "Antrean persetujuan PO melebihi SLA · Analis", projectId: "p-p2p" });
  });
  it("adds a new draft on an identical repeat request", () => {
    const before = s0();
    const a = reduce(before, req());
    const b = reduce(a.state, req());
    expect(b.state.interpretations.length).toBe(before.interpretations.length + 2);
    expect(b.interpretationId).not.toBe(a.interpretationId);
  });
  it.each([
    ["suspended project", (s: MockState) => { s.projects.find((p) => p.id === "p-p2p")!.status = "ditangguhkan"; return req(); }],
    ["unknown finding", () => req({ findingId: "finding_nope" })],
    ["finding of another project", (s: MockState) => { s.findings.push({ ...s.findings[0], id: "finding_x", projectId: "p-lain" }); return req({ findingId: "finding_x" }); }],
    ["bad audience", () => req({ audience: "x" as never })],
  ])("rejects %s without changing state", (_n, setup) => {
    const before = s0();
    const action = setup(before);
    const r = reduce(before, action);
    expect(r.error).toBeTruthy();
    expect(r.state).toBe(before);
    expect(r.interpretationId).toBeUndefined();
  });
});

describe("overrideCheck", () => {
  it("overrides a heuristic violation, recomputes status, adds one audit", () => {
    const before = s0();
    expect(seed63(before).status).toBe("gagal_pemeriksaan");
    const r = reduce(before, override(before));
    expect(r.error).toBeUndefined();
    const after = seed63(r.state);
    expect(after.status).toBe("lolos_pemeriksaan");
    expect(after.overrides).toHaveLength(1);
    expect(after.overrides[0]).toMatchObject({ check: "bahasa_keputusan", reason: "positif palsu", by: before.viewerId });
    expect(r.interpretationId).toBe(after.id);
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "interpretation.kesampingkan", objectType: "Interpretation", projectId: "p-p2p" });
  });
  it.each([
    ["non-overridable check", (s: MockState) => override(s, { check: "angka_literal" })],
    ["blank reason", (s: MockState) => override(s, { reason: "   " })],
    ["claim that does not violate", (s: MockState) => override(s, { claimId: "tidak-ada" })],
    ["already passing draft", (s: MockState) => ({ type: "overrideCheck", interpretationId: s.interpretations[0].id, check: "bahasa_keputusan", reason: "x" }) as MockAction],
    ["unknown id", (s: MockState) => override(s, { interpretationId: "i-nope" })],
    ["inactive project", (s: MockState) => { s.projects.find((p) => p.id === "p-p2p")!.status = "ditangguhkan"; return override(s); }],
  ])("rejects %s without changing state", (_n, setup) => {
    const before = s0();
    const action = setup(before);
    const r = reduce(before, action);
    expect(r.error).toBeTruthy();
    expect(r.state).toBe(before);
  });
  it("rejects a violation that is already overridden", () => {
    const a = reduce(s0(), override(s0()));
    const again = reduce(a.state, override(a.state));
    expect(again.error).toBeTruthy();
    expect(again.state).toBe(a.state);
  });
});

describe("selectors", () => {
  it("lists newest first and scopes by project", () => {
    const s = s0();
    expect(interpretationsForProject(s, "p-p2p").map((i) => i.findingId)).toEqual(["finding_63", "finding_57", "finding_42"]);
    expect(interpretationsForProject(s, "p-lain")).toEqual([]);
    expect(findingsForProject(s, "p-p2p")).toHaveLength(3);
  });
});
