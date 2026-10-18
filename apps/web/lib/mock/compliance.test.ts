import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { applicableVersion, evaluateCase, evaluateRun, mockCases, participatingVersions, summarize, termFor } from "./compliance";

const sn1 = initialState.snapshots.find((s) => s.id === "sn-1")!;
const m1 = initialState.mappings.find((m) => m.id === "m-1")!;
const rule = (id: string) => initialState.rules.find((r) => r.id === id)!;
const slaV1 = rule("r-sla-1"), slaV2 = rule("r-sla-2"), urutan = rule("r-urutan"), sod = rule("r-sod");
const closedCase = { id: "CASE-9999", start: "2026-06-01", end: "2026-06-05" };

describe("compliance", () => {
  it("mockCases deterministic and inside period", () => {
    const a = mockCases(sn1, "2026-05-01", "2026-07-31");
    expect(a).toEqual(mockCases(sn1, "2026-05-01", "2026-07-31"));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((c) => c.start >= "2026-05-01" && c.start <= "2026-07-31")).toBe(true);
    expect(a[0].id).toBe("CASE-0001");
    expect(a.some((c) => c.end === null)).toBe(true);
  });
  it("mockCases empty when period misses data or no stats", () => {
    expect(mockCases(sn1, "2025-01-01", "2025-02-01")).toEqual([]);
    expect(mockCases({ ...sn1, stats: undefined }, "2026-05-01", "2026-07-31")).toEqual([]);
  });
  it("participatingVersions skips draf, keeps ditinjau, disetujui and once-approved usang", () => {
    const ids = participatingVersions(initialState, "p-p2p").map((v) => v.id).sort();
    expect(ids).toEqual(["r-sla-1", "r-sla-2", "r-urutan"]);
  });
  it("participatingVersions keeps ditinjau v1 when a newer draf v2 exists", () => {
    const draf = { ...urutan, id: "r-urutan-2", version: 2, status: "draf" as const };
    const ids = participatingVersions({ ...initialState, rules: [...initialState.rules, draf] }, "p-p2p").map((v) => v.id);
    expect(ids).toContain("r-urutan");
    expect(ids).not.toContain("r-urutan-2");
  });
  it("applicableVersion by case start", () => {
    const vs = [slaV1, slaV2];
    expect(applicableVersion(vs, "2026-06-01")?.id).toBe("r-sla-1");
    expect(applicableVersion(vs, "2026-10-01")?.id).toBe("r-sla-2");
    expect(applicableVersion(vs, "2026-03-01")).toBeNull();
  });
  it("evaluateCase reasons", () => {
    const noRes = { ...m1, roles: { ...m1.roles, resource: "ignore" as const } };
    expect(evaluateCase(sod, closedCase, noRes)).toMatchObject({ status: "tidak_dapat_dievaluasi", reason: "Kolom sumber daya belum dipetakan (M03)" });
    expect(evaluateCase({ ...urutan, scope: { attribute: "plant", op: "=", value: "A" } }, closedCase, m1))
      .toMatchObject({ status: "tidak_dapat_dievaluasi", reason: "Atribut plant belum dipetakan (M03)" });
    const open = mockCases(sn1, "2026-05-01", "2026-07-31").filter((c) => c.end === null);
    const reasons = open.map((c) => evaluateCase(slaV1, c, m1).reason);
    expect(reasons).toContain("Kasus belum mencapai Record Goods Receipt");
  });
  it("summarize counts add up", () => {
    const run = { id: "x", projectId: "p-p2p", sourceId: "s-p2p-sap", snapshotId: "sn-1", mappingId: "m-1", periodFrom: "2026-03-01", periodTo: "2026-10-14",
      ruleVersionIds: ["r-sla-1", "r-sla-2", "r-urutan"], ruleVersions: ["r-sla-1", "r-sla-2", "r-urutan"].map(rule), calendar: "bawaan_tiruan" as const, config: initialState.runs[0].config, createdBy: "u-dimas", createdAt: "2026-10-17T09:30:00Z" };
    const res = evaluateRun(initialState, run, "r-sla");
    const s = summarize(res);
    expect(s.total).toBe(res.length);
    expect(s.patuh + s.tidakPatuh + s.tidakDapat).toBe(s.total);
    expect(s.byMonth.reduce((n, m) => n + m.patuh + m.tidakPatuh + m.tidakDapat, 0)).toBe(s.total);
    expect(s.reasons.map((r) => r.reason)).toContain("Tidak ada versi aturan yang berlaku pada awal kasus");
    expect(res).toEqual(evaluateRun(initialState, run, "r-sla"));
  });
  it("termFor", () => {
    expect(termFor(slaV2)).toBe("Pelanggaran");
    expect(termFor(urutan)).toBe("Tidak sesuai dengan acuan");
  });
});

describe("atRisk (SLA)", () => {
  const sla = (unit: "kalender" | "kerja", limit: number) => ({ ...slaV1, params: { type: "sla" as const, from: "A", to: "B", limit, unit } });
  // find an open case that evaluates to "Kasus belum mencapai" for the given version
  const openCase = (v: typeof slaV1, start: string) => {
    for (let i = 0; i < 200; i++) {
      const c = { id: `CASE-${i}`, start, end: null };
      if (evaluateCase(v, c, m1).reason?.startsWith("Kasus belum mencapai")) return c;
    }
    throw new Error("no open case");
  };
  // 2026-06-05 is Friday; ref Tuesday 2026-06-09: 4 calendar days, 2 working days (Mon, Tue)
  it("calendar vs working days across a weekend", () => {
    const kal = sla("kalender", 3), ker = sla("kerja", 3);
    expect(evaluateCase(kal, openCase(kal, "2026-06-05"), m1, "2026-06-09").atRisk).toBe(true);
    expect(evaluateCase(ker, openCase(ker, "2026-06-05"), m1, "2026-06-09").atRisk).toBeUndefined();
    expect(evaluateCase(ker, openCase(ker, "2026-06-05"), m1, "2026-06-11").atRisk).toBe(true); // 4 working days
  });
  it("no atRisk for non-SLA rules, without refDate or on closed cases", () => {
    const sla1 = sla("kalender", 1);
    const c = openCase(sla1, "2026-01-01");
    expect(evaluateCase(sla1, c, m1).atRisk).toBeUndefined();
    expect(evaluateCase(sla1, closedCase, m1, "2026-12-31").atRisk).toBeUndefined();
    for (let i = 0; i < 50; i++) expect(evaluateCase(urutan, { id: `C${i}`, start: "2026-01-01", end: null }, m1, "2026-12-31").atRisk).toBeUndefined();
  });
  it("status and reason unchanged by refDate", () => {
    const v = sla("kalender", 1);
    for (let i = 0; i < 50; i++) {
      const c = { id: `C${i}`, start: "2026-01-01", end: i % 2 ? null : "2026-01-05" };
      const { atRisk, ...withRef } = evaluateCase(v, c, m1, "2026-12-31");
      void atRisk;
      expect(withRef).toEqual(evaluateCase(v, c, m1));
    }
  });
});

