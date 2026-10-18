import { describe, expect, it } from "vitest";
import { evaluateRun, termFor } from "./compliance";
import { configFor, summaryCards } from "./metrics";
import { initialState, reduce, runsForProject, type MockAction } from "./reducer";
import type { RuleVersion } from "./types";

const ok = { type: "runMonitoring", projectId: "p-p2p", sourceId: "s-p2p-sap", periodFrom: "2026-05-01", periodTo: "2026-10-14" } as const;
const urutan = initialState.rules.find((x) => x.id === "r-urutan") as RuleVersion;
const urutanInput = {
  name: urutan.name, description: urutan.description, params: urutan.params, scope: urutan.scope,
  effectiveFrom: urutan.effectiveFrom, effectiveTo: urutan.effectiveTo, source: urutan.source,
};

describe("runMonitoring", () => {
  it("creates run with frozen versions and one audit", () => {
    const r = reduce(initialState, ok);
    expect(r.error).toBeUndefined();
    const run = r.state.runs.find((x) => x.id === r.runId)!;
    expect(run).toMatchObject({ snapshotId: "sn-1", mappingId: "m-1", calendar: "bawaan_tiruan" });
    expect(run.ruleVersionIds.sort()).toEqual(["r-sla-1", "r-sla-2", "r-urutan"]);
    expect(r.state.audit.length).toBe(initialState.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "monitoring.jalankan", objectType: "Monitoring", objectLabel: "Ekspor SAP P2P 2026-05-01–2026-10-14" });
  });
  it("rejects", () => {
    const susp = { ...initialState, projects: initialState.projects.map((p) => p.id === "p-p2p" ? { ...p, status: "ditangguhkan" as const } : p) };
    expect(reduce(susp, ok).error).toBe("Proyek ini tidak menerima data baru");
    expect(reduce(initialState, { ...ok, sourceId: "s-p2p-tiket" }).error).toBe("Sumber belum punya pemetaan dan snapshot siap");
    expect(reduce(initialState, { ...ok, periodFrom: "2026-10-14", periodTo: "2026-05-01" }).error).toBe("Periode tidak valid");
    expect(reduce(initialState, { ...ok, periodFrom: "bukan tanggal" }).error).toBe("Periode tidak valid");
    expect(reduce({ ...initialState, rules: [] }, ok).error).toBe("Belum ada aturan disetujui atau ditinjau");
    expect(reduce(initialState, { ...ok, projectId: "nope" }).error).toBe("Proyek tidak ditemukan");
    expect(reduce(initialState, { ...ok, sourceId: "s-o2c-erp" }).error).toBe("Sumber tidak ditemukan");
  });
  it("editing a reverted draf rule after the run does not change the old run", () => {
    const r = reduce(initialState, ok);
    const run = r.state.runs.find((x) => x.id === r.runId)!;
    const before = evaluateRun(r.state, run, "r-urutan");
    expect(before.some((c) => c.status !== "tidak_dapat_dievaluasi")).toBe(true);
    const back = reduce(r.state, { type: "changeRuleStatus", ruleId: "r-urutan", to: "draf" });
    expect(back.error).toBeUndefined();
    const edited = reduce(back.state, { type: "saveRule", projectId: "p-p2p", ruleKey: "r-urutan", input: { ...urutanInput, scope: { attribute: "zzz", op: "=", value: "x" } } });
    expect(edited.error).toBeUndefined();
    expect(edited.state.rules.find((x) => x.id === "r-urutan")!.scope).toEqual({ attribute: "zzz", op: "=", value: "x" });
    expect(evaluateRun(edited.state, run, "r-urutan")).toEqual(before);
  });
  it("approving a rule after the run keeps the frozen term", () => {
    const r = reduce(initialState, ok);
    const run = r.state.runs.find((x) => x.id === r.runId)!;
    const approved = reduce(r.state, { type: "changeRuleStatus", ruleId: "r-urutan", to: "disetujui" });
    expect(approved.error).toBeUndefined();
    expect(approved.state.rules.find((x) => x.id === "r-urutan")!.status).toBe("disetujui");
    const frozen = run.ruleVersions.find((v) => v.id === "r-urutan")!;
    expect(termFor(frozen)).toBe("Tidak sesuai dengan acuan");
  });
  it("runsForProject newest first, seeds two p-p2p runs", () => {
    expect(runsForProject(initialState, "p-p2p")).toHaveLength(2);
    expect(runsForProject(initialState, "p-o2c")).toEqual([]);
  });
});

describe("run config freeze", () => {
  it("runMonitoring deep-copies the current project config", () => {
    const r = reduce(initialState, ok);
    const run = r.state.runs.find((x) => x.id === r.runId)!;
    expect(run.config).toEqual(configFor(initialState, "p-p2p"));
    expect(run.config.reworkActivities).not.toBe(initialState.monitoringConfigs[0].reworkActivities);
    expect(run.config.bpmnModel!.activities).not.toBe(initialState.monitoringConfigs[0].bpmnModel!.activities);
  });
  it("a config change after the run leaves the run and its results unchanged", () => {
    const r = reduce(initialState, ok);
    const run = r.state.runs.find((x) => x.id === r.runId)!;
    const before = JSON.parse(JSON.stringify(run.config));
    const cards = summaryCards(r.state, run);
    const upd = reduce(r.state, { type: "updateMonitoringConfig", projectId: "p-p2p", patch: { backlogAgeDays: 99, ageBuckets: [1, 2] } });
    expect(upd.error).toBeUndefined();
    const same = upd.state.runs.find((x) => x.id === run.id)!;
    expect(same.config).toEqual(before);
    expect(configFor(upd.state, "p-p2p")).toMatchObject({ backlogAgeDays: 99, ageBuckets: [1, 2] });
    expect(summaryCards(upd.state, same)).toEqual(cards);
    expect(upd.state.runs.find((x) => x.id === "run-1")!.config.backlogAgeDays).toBe(30);
  });
});

describe("updateMonitoringConfig", () => {
  const upd = (patch: Extract<MockAction, { type: "updateMonitoringConfig" }>["patch"], state = initialState, projectId = "p-p2p") =>
    reduce(state, { type: "updateMonitoringConfig", projectId, patch });
  it("merges patch, bumps version, records viewer, time and one audit", () => {
    const r = upd({ bottleneckTopN: 5, reworkActivities: ["Clear Invoice"] });
    expect(r.error).toBeUndefined();
    expect(r.state.monitoringConfigs).toHaveLength(1);
    expect(r.state.monitoringConfigs[0]).toMatchObject({ version: 2, bottleneckTopN: 5, reworkActivities: ["Clear Invoice"], changePct: 20, updatedBy: initialState.viewerId, updatedAt: expect.stringContaining("2026-10-17") });
    expect(r.state.audit).toHaveLength(initialState.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "monitoring.ambang.ubah", objectType: "Monitoring", objectLabel: "Ambang monitoring v2", projectId: "p-p2p" });
  });
  it("adds an entry for a project without one, starting at version 1", () => {
    const s = { ...initialState, memberships: [...initialState.memberships, { userId: initialState.viewerId, projectId: "p-hr", role: "analis" as const, addedAt: "2026-01-01T00:00:00Z" }] };
    const r = upd({ minGroupCases: 7 }, s, "p-hr");
    expect(r.error).toBeUndefined();
    expect(configFor(r.state, "p-hr")).toMatchObject({ version: 1, minGroupCases: 7, reworkActivities: null });
    expect(r.state.monitoringConfigs).toHaveLength(2);
  });
  it("rejects with exact messages", () => {
    expect(upd({}, initialState, "nope").error).toBe("Proyek tidak ditemukan");
    expect(reduce({ ...initialState, viewerId: "u-bukan-anggota" }, { type: "updateMonitoringConfig", projectId: "p-p2p", patch: {} }).error).toBe("Hanya analis yang dapat mengubah ambang");
    for (const k of ["bottleneckTopN", "backlogAgeDays", "minCasesChange", "minGroupCases", "smallSampleCases"] as const)
      for (const v of [0, -1, 1.5, Number.NaN]) expect(upd({ [k]: v }).error, `${k}=${v}`).toBe("Nilai ambang harus bilangan positif");
    expect(upd({ bottleneckP90Days: 0 }).error).toBe("Nilai ambang harus bilangan positif");
    expect(upd({ bottleneckP90Days: 2.5 }).error).toBeUndefined();
    for (const k of ["reworkHighPct", "complianceHighPct", "changePct"] as const)
      for (const v of [-1, 101, Number.NaN]) expect(upd({ [k]: v }).error, `${k}=${v}`).toBe("Persentase harus 0–100");
    expect(upd({ changePct: 0 }).error).toBeUndefined();
    expect(upd({ fitnessMin: 1.1 }).error).toBe("Fitness minimum harus 0–1");
    expect(upd({ fitnessMin: -0.1 }).error).toBe("Fitness minimum harus 0–1");
    for (const b of [[], [1, 2, 3, 4, 5, 6], [7, 7], [30, 7], [0, 5], [1.5, 3]]) expect(upd({ ageBuckets: b }).error, JSON.stringify(b)).toBe("Kelompok umur harus naik dan positif");
    expect(upd({ ageBuckets: [1, 2, 3, 4, 5] }).error).toBeUndefined();
    expect(upd({ reworkActivities: [] }).error).toBe("Pilih minimal satu aktivitas rework");
    expect(upd({ reworkActivities: null }).error).toBeUndefined();
  });
  it("a failed update leaves state untouched", () => {
    const r = upd({ fitnessMin: 5 });
    expect(r.state).toBe(initialState);
  });
});
