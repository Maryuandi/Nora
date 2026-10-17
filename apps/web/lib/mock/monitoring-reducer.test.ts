import { describe, expect, it } from "vitest";
import { evaluateRun, termFor } from "./compliance";
import { initialState, reduce, runsForProject } from "./reducer";
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
