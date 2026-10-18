import { describe, expect, it } from "vitest";
import { bundleById, traceFindingsForProject, initialState, reduce } from "./reducer";
import type { MockState } from "./types";

const s0 = (): MockState => structuredClone(initialState);
// p-o2c is seeded ditangguhkan; make it aktif where a rebuild must be allowed.
const o2cActive = (): MockState => {
  const s = s0();
  s.projects = s.projects.map((p) => (p.id === "p-o2c" ? { ...p, status: "aktif" } : p));
  return s;
};

describe("rebuildGraph", () => {
  it("sets rebuilding and writes exactly one audit", () => {
    const s = s0();
    const r = reduce(s, { type: "rebuildGraph", projectId: "p-p2p" });
    expect(r.error).toBeUndefined();
    expect(r.state.graphStatus["p-p2p"].rebuilding).toBe(true);
    expect(r.state.audit.length).toBe(s.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "graf.bangun_ulang", objectType: "Graph", projectId: "p-p2p" });
  });

  it("second rebuildGraph while rebuilding is rejected without audit", () => {
    const first = reduce(s0(), { type: "rebuildGraph", projectId: "p-p2p" }).state;
    const r = reduce(first, { type: "rebuildGraph", projectId: "p-p2p" });
    expect(r.error).toBe("Pembangunan ulang sedang berjalan");
    expect(r.state.audit.length).toBe(first.audit.length);
  });

  it("rejects when project is not aktif", () => {
    const r = reduce(s0(), { type: "rebuildGraph", projectId: "p-o2c" });
    expect(r.error).toBe("Proyek ini tidak menerima data baru");
  });

  it("unknown project / no status entry -> Graph tidak ditemukan", () => {
    expect(reduce(s0(), { type: "rebuildGraph", projectId: "nope" }).error).toBe("Graph tidak ditemukan");
    expect(reduce(s0(), { type: "rebuildGraph", projectId: "p-hr" }).error).toBe("Graph tidak ditemukan");
    expect(reduce(s0(), { type: "finishGraphRebuild", projectId: "nope" }).error).toBe("Graph tidak ditemukan");
  });
});

describe("finishGraphRebuild", () => {
  it("bumps version, syncs projectedAt, clears failed, no extra audit", () => {
    const s = o2cActive();
    const started = reduce(s, { type: "rebuildGraph", projectId: "p-o2c" }).state;
    const r = reduce(started, { type: "finishGraphRebuild", projectId: "p-o2c" });
    const g = r.state.graphStatus["p-o2c"];
    expect(r.error).toBeUndefined();
    expect(g.version).toBe(4);
    expect(g.projectedAt).toBe(g.authoritativeAt);
    expect(g.failed).toEqual([]);
    expect(g.rebuilding).toBe(false);
    expect(r.state.audit.length).toBe(s.audit.length + 1);
  });

  it("errors when not rebuilding", () => {
    expect(reduce(s0(), { type: "finishGraphRebuild", projectId: "p-p2p" }).error).toBe("Tidak ada pembangunan ulang berjalan");
  });
});

describe("selectors", () => {
  it("traceFindingsForProject isolates by project", () => {
    expect(traceFindingsForProject(s0(), "p-o2c")).toEqual([]);
    expect(traceFindingsForProject(s0(), "p-p2p")).toHaveLength(2);
  });
  it("bundleById isolates by project", () => {
    expect(bundleById(s0(), "p-o2c", "b-1")).toBeNull();
    expect(bundleById(s0(), "p-p2p", "b-1")).not.toBeNull();
  });
});
