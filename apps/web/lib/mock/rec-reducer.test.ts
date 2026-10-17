import { describe, expect, it } from "vitest";
import { candidatesForFinding, evaluateFinding, initialState, latestPolicy, reduce, type MockAction } from "./reducer";
import { buildBaseline, DEFAULT_WEIGHTS } from "./recommend";
import { TRANSITIONS } from "./rec-cases";
import { runScenario } from "./scenario";
import { buildCases } from "./rec-cases";
import type { MockState } from "./types";

const s0 = (): MockState => structuredClone(initialState);
const newCand = (over = {}) => ({ kind: "hipotesis" as const, name: "Ide baru", description: "d", addresses: "h", successMetric: "m", proposeToCatalog: false, effort: null, risk: null, ...over });
const add = (over = {}): MockAction => ({ type: "rec/addCandidate", projectId: "p-p2p", findingId: "f-approval", input: newCand(over) });

describe("permissions and project state", () => {
  it.each([["u-sari", "pemilik_proses"], ["u-rina", "administrator"]])("rejects %s (%s)", (viewerId) => {
    const before = { ...s0(), viewerId };
    const r = reduce(before, add());
    expect(r.error).toBeTruthy();
    expect(r.state).toBe(before);
  });
  it("rejects an inactive project and unknown ids without throwing", () => {
    const s = s0();
    s.projects = s.projects.map((p) => (p.id === "p-p2p" ? { ...p, status: "ditangguhkan" as const } : p));
    expect(reduce(s, add()).error).toBeTruthy();
    expect(reduce(s0(), { type: "rec/addCandidate", projectId: "nope", findingId: "x", input: newCand() }).error).toBeTruthy();
    expect(reduce(s0(), { type: "rec/updateTrial", trialId: "nope", patch: {} }).error).toBeTruthy();
    expect(reduce(s0(), { type: "rec/createTrial", projectId: "p-p2p", findingId: "nope", candidateId: "x" }).error).toBeTruthy();
  });
});

describe("addCandidate", () => {
  it("adds an analyst candidate with one audit event, unrated by Jev", () => {
    const before = s0();
    const r = reduce(before, add({ proposeToCatalog: true }));
    expect(r.error).toBeUndefined();
    const c = r.state.recCandidates.find((x) => x.id === r.candidateId)!;
    expect(c).toMatchObject({ origin: "analis", findingIds: ["f-approval"], jev: {}, proposeToCatalog: true });
    expect(candidatesForFinding(r.state, "f-approval")).toContain(c);
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0].action).toBe("kandidat.tambah");
    const ev = evaluateFinding(r.state, "f-approval")!;
    expect(ev.unranked.find((e) => e.c.id === c.id)!.v.status).toBe("belum_layak_dinilai");
  });
  it("validates required text and effort/risk range", () => {
    expect(reduce(s0(), add({ name: "   " })).error).toBeTruthy();
    expect(reduce(s0(), add({ effort: 6 })).error).toBeTruthy();
    expect(reduce(s0(), add({ risk: 0 })).error).toBeTruthy();
    expect(reduce(s0(), add({ effort: 3, risk: 1 })).error).toBeUndefined();
  });
});

describe("savePolicy", () => {
  const save = (weights: typeof DEFAULT_WEIGHTS): MockAction => ({ type: "rec/savePolicy", projectId: "p-p2p", weights, note: "uji" });
  it("rejects identical and invalid weights", () => {
    expect(reduce(s0(), save({ ...DEFAULT_WEIGHTS })).error).toBe("Tidak ada perubahan");
    expect(reduce(s0(), save({ ...DEFAULT_WEIGHTS, risk: -0.1 })).error).toBeTruthy();
    expect(reduce(s0(), save({ ...DEFAULT_WEIGHTS, risk: NaN })).error).toBeTruthy();
  });
  it("adds version 2 and changes the ranking without touching candidates", () => {
    const before = s0();
    const r = reduce(before, save({ ...DEFAULT_WEIGHTS, relevance: 0.9, effort: 0 }));
    expect(r.error).toBeUndefined();
    expect(latestPolicy(r.state, "p-p2p").version).toBe(2);
    expect(r.state.audit[0].action).toBe("kebijakan.ubah");
    expect(r.state.recCandidates).toEqual(before.recCandidates);
    const a = evaluateFinding(before, "f-approval")!.ranked.map((e) => e.c.id);
    const b = evaluateFinding(r.state, "f-approval")!.ranked.map((e) => e.c.id);
    expect(b).not.toEqual(a);
  });
});

describe("runScenario", () => {
  const run = (spec: Extract<MockAction, { type: "rec/runScenario" }>["spec"], name = ""): MockAction => ({ type: "rec/runScenario", projectId: "p-p2p", name, spec });
  it("rejects invalid parameters without adding a scenario", () => {
    const bad = [
      { kind: "kurangi_jeda", transition: TRANSITIONS[0], pct: 0 }, { kind: "kurangi_jeda", transition: TRANSITIONS[0], pct: 150 },
      { kind: "batasi_jeda", transition: TRANSITIONS[0], maxDays: -1 }, { kind: "kurangi_jeda", transition: "nope", pct: 50 },
      { kind: "hapus_rework", activity: "nope", pct: 50 }, { kind: "lewati_aktivitas", activity: "Manual Review", filter: { attribute: "unit", value: "?" } },
    ] as const;
    for (const spec of bad) {
      const r = reduce(s0(), run(spec));
      expect(r.error).toBeTruthy();
      expect(r.state.scenarios.length).toBe(initialState.scenarios.length);
    }
  });
  it("stores an estimate matching the direct computation", () => {
    const spec = { kind: "batasi_jeda", transition: TRANSITIONS[0], maxDays: 3 } as const;
    const r = reduce(s0(), run(spec));
    const sc = r.state.scenarios.find((x) => x.id === r.scenarioId)!;
    expect(sc).toMatchObject({ status: "estimasi", datasetVersion: "snapshot-2026-09", contextPack: "ctx-v3" });
    expect(sc.result).toEqual(runScenario(spec, buildCases()));
    expect(sc.name).toContain("dibatasi");
    expect(r.state.audit[0].action).toBe("skenario.jalankan");
  });
});

describe("trials", () => {
  const create = (candidateId: string, findingId = "f-approval"): MockAction => ({ type: "rec/createTrial", projectId: "p-p2p", findingId, candidateId });
  it("only validated candidates, no duplicates", () => {
    expect(reduce(s0(), create("k-audit")).error).toBeTruthy();
    expect(reduce(s0(), create("k-delegasi")).error).toBeTruthy(); // already in the seed
  });
  it("creates a draft with automatic baseline", () => {
    const r = reduce(s0(), create("k-cadangan"));
    expect(r.error).toBeUndefined();
    const t = r.state.trials.find((x) => x.id === r.trialId)!;
    const c = r.state.recCandidates.find((x) => x.id === "k-cadangan")!;
    expect(t).toMatchObject({ status: "draf", target: "", successMetric: c.successMetric });
    expect(t.baseline).toEqual(buildBaseline(c, r.state.recFindings[0]));
    expect(r.state.audit[0].action).toBe("ujicoba.buat");
  });
  it("update keeps baseline and successMetric", () => {
    const before = s0();
    const t0 = before.trials[0];
    const r = reduce(before, { type: "rec/updateTrial", trialId: t0.id, patch: { target: "P90 ≤ 6 hari", baseline: [], successMetric: "x" } as never });
    const t = r.state.trials[0];
    expect(t.target).toBe("P90 ≤ 6 hari");
    expect(t.baseline).toEqual(t0.baseline);
    expect(t.successMetric).toBe(t0.successMetric);
    expect(r.state.audit[0].action).toBe("ujicoba.ubah");
    expect(reduce(before, { type: "rec/updateTrial", trialId: t0.id, patch: { durationWeeks: 0 } }).error).toBeTruthy();
  });
});
