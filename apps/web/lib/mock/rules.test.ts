import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import {
  canonicalLabels, isProposalBlocked, latestByKey, nextStatuses, previewDataset, previewRule, projectCanonicalLabels, ruleSummary, validateRule,
  type RuleInput,
} from "./rules";
import type { MappingVersion, MockState, RuleVersion, Snapshot } from "./types";

const LABELS = ["Create Purchase Order Item", "Record Goods Receipt", "Clear Invoice"];
const base = (over: Partial<RuleInput> = {}): RuleInput => ({
  name: "Aturan uji", description: "", params: { type: "sla", from: LABELS[0], to: LABELS[1], limit: 14, unit: "kerja" }, scope: null,
  effectiveFrom: "2026-05-01", effectiveTo: null, source: { docTitle: "", section: "", quote: "" }, ...over,
});
const fields = (i: RuleInput) => validateRule(i, LABELS).map((e) => e.field);

describe("canonicalLabels", () => {
  const l = canonicalLabels(s, "s-p2p-sap");
  it("applies rename rules, drops excluded, unique and sorted", () => {
    expect(l).toContain("Create Purchase Order Item");
    expect(l).toContain("Record Goods Receipt");
    expect(l).not.toContain("Cancel Invoice Receipt");
    expect(new Set(l).size).toBe(l.length);
    expect(l).toEqual([...l].sort());
    expect(l).not.toContain("create purchase order item");
    expect(l.some((x) => x !== x.trim())).toBe(false);
  });
  const withMappings = (mappings: MappingVersion[]): MockState => ({ ...s, mappings });
  const m1 = s.mappings[0];
  it("uses the latest mapping of a source", () => {
    const later: MappingVersion = { ...m1, id: "m-x", version: 2, createdAt: "2026-10-16T00:00:00Z", labels: [{ raw: "Clear Invoice", canonical: "Bayar Faktur" }] };
    const l2 = canonicalLabels(withMappings([later, m1]), "s-p2p-sap");
    expect(l2).toContain("Bayar Faktur");
    expect(l2).not.toContain("Clear Invoice");
    expect(l2).toContain("Cancel Invoice Receipt"); // not excluded by the later mapping
  });
  it("dedupes raws renamed to the same canonical and drops blank renames", () => {
    const m: MappingVersion = { ...m1, labels: [
      { raw: "Clear Invoice", canonical: "Satu" }, { raw: "Record Goods Receipt", canonical: "Satu" }, { raw: "Record Invoice Receipt", canonical: "   " } ] };
    const l2 = canonicalLabels(withMappings([m]), "s-p2p-sap");
    expect(l2.filter((x) => x === "Satu")).toHaveLength(1);
    expect(l2).not.toContain("");
    expect(l2).not.toContain("Record Invoice Receipt");
  });
  it("is empty for a source without mapping", () => {
    expect(canonicalLabels(s, "s-p2p-tiket")).toEqual([]);
    expect(canonicalLabels(s, "tidak-ada")).toEqual([]);
  });
  it("projectCanonicalLabels merges project sources", () => {
    expect(projectCanonicalLabels(s, "p-p2p")).toEqual(l);
    expect(projectCanonicalLabels(s, "p-o2c")).toEqual([]);
  });
});

describe("validateRule", () => {
  it("accepts a complete input", () => expect(validateRule(base(), LABELS)).toEqual([]));
  it("rejects blank name", () => {
    expect(fields(base({ name: "   " }))).toEqual(["name"]);
    expect(fields(base({ name: "" }))).toEqual(["name"]);
  });
  it("rejects unknown activity with the exact message", () => {
    const e = validateRule(base({ params: { type: "wajib", activity: "Bukan Label" } }), LABELS);
    expect(e).toEqual([{ field: "params.activity", message: "Aktivitas tidak ada di label kanonis" }]);
    expect(fields(base({ params: { type: "terlarang", activity: "" } }))).toEqual(["params.activity"]);
    expect(fields(base({ params: { type: "urutan", before: "x", after: "y" } }))).toEqual(["params.before", "params.after"]);
    expect(fields(base({ params: { type: "pemisahan_tugas", activityA: "x", activityB: LABELS[0] } }))).toEqual(["params.activityA"]);
  });
  it("rejects SLA limit that is not a finite number > 0", () => {
    for (const limit of [0, -1, NaN, Infinity, -Infinity]) {
      expect(fields(base({ params: { type: "sla", from: LABELS[0], to: LABELS[1], limit, unit: "kerja" } }))).toEqual(["params.limit"]);
    }
    expect(fields(base({ params: { type: "sla", from: LABELS[0], to: LABELS[1], limit: 1e9, unit: "kerja" } }))).toEqual([]);
  });
  it("rejects bad SLA unit", () => {
    expect(fields(base({ params: { type: "sla", from: LABELS[0], to: LABELS[1], limit: 1, unit: "x" as never } }))).toEqual(["params.unit"]);
  });
  it("rejects identical activities per type", () => {
    expect(fields(base({ params: { type: "sla", from: LABELS[0], to: LABELS[0], limit: 3, unit: "kerja" } }))).toEqual(["params.to"]);
    expect(fields(base({ params: { type: "urutan", before: LABELS[0], after: LABELS[0] } }))).toEqual(["params.after"]);
    expect(fields(base({ params: { type: "pemisahan_tugas", activityA: LABELS[0], activityB: LABELS[0] } }))).toEqual(["params.activityB"]);
  });
  it("validates dates", () => {
    expect(fields(base({ effectiveFrom: "bukan-tanggal" }))).toEqual(["effectiveFrom"]);
    expect(fields(base({ effectiveFrom: "2026-02-30" }))).toEqual(["effectiveFrom"]);
    expect(fields(base({ effectiveTo: "2026-04-30" }))).toEqual(["effectiveTo"]);
    expect(fields(base({ effectiveTo: "2026-05-01" }))).toEqual([]);
    expect(fields(base({ effectiveTo: "ngawur" }))).toEqual(["effectiveTo"]);
    expect(fields(base({ effectiveFrom: "2024-02-29" }))).toEqual([]);
    expect(fields(base({ effectiveFrom: "2026-02-29" }))).toEqual(["effectiveFrom"]);
    expect(fields(base({ effectiveFrom: "2026-13-01" }))).toEqual(["effectiveFrom"]);
  });
  it("validates scope", () => {
    expect(fields(base({ scope: { attribute: "region", op: "=", value: "  " } }))).toEqual(["scope.value"]);
    expect(fields(base({ scope: { attribute: "", op: "=", value: "ID" } }))).toEqual(["scope.attribute"]);
    expect(fields(base({ scope: { attribute: "region", op: "=", value: "ID" } }))).toEqual([]);
  });
  it("does not throw on hostile strings and leaves them untouched", () => {
    expect(() => validateRule(base({ name: "a".repeat(5000) }), LABELS)).not.toThrow();
    const input = base({ description: "<script>alert(1)</script>" });
    expect(validateRule(input, LABELS)).toEqual([]);
    expect(input.description).toBe("<script>alert(1)</script>");
    expect(() => validateRule(base({ params: { type: "wajib", activity: "__proto__" } }), ["constructor"])).not.toThrow();
  });
});

describe("previewDataset / previewRule", () => {
  const ds = previewDataset(s, "p-p2p")!;
  const params = base().params;
  it("previewDataset picks the first source with mapping and ready snapshot", () => {
    expect(ds.sourceId).toBe("s-p2p-sap");
    expect(ds.snapshot.id).toBe("sn-1");
    expect(ds.mapping.id).toBe("m-1");
    expect(previewDataset(s, "p-o2c")).toBeNull();
    expect(previewDataset(s, "tidak-ada")).toBeNull();
  });
  it("is deterministic and consistent", () => {
    const a = previewRule({ params, scope: null }, ds);
    expect(previewRule({ params, scope: null }, ds)).toEqual(a);
    if (a.status !== "ok") throw new Error("expected ok");
    expect(a.compliant + a.nonCompliant).toBe(a.evaluable);
    expect(a.evaluable).toBeLessThanOrEqual(Math.round(ds.snapshot.stats!.rows / 6));
    expect(a.evaluable).toBeGreaterThan(0);
    for (const n of [a.evaluable, a.compliant, a.nonCompliant]) expect(Number.isInteger(n)).toBe(true);
  });
  it("reports non-evaluable reasons", () => {
    expect(previewRule({ params, scope: null }, null)).toEqual({ status: "tidak_dapat_dievaluasi", reason: "Belum ada pemetaan data (M03)" });
    const sod = { type: "pemisahan_tugas", activityA: LABELS[0], activityB: LABELS[1] } as const;
    const noRes: MappingVersion = { ...ds.mapping, roles: { case_id: "case_id", activity: "activity", timestamp: "timestamp_end" } };
    expect(previewRule({ params: sod, scope: null }, { ...ds, mapping: noRes })).toEqual({ status: "tidak_dapat_dievaluasi", reason: "Kolom sumber daya belum dipetakan (M03)" });
    expect(previewRule({ params: sod, scope: null }, ds).status).toBe("ok");
    expect(previewRule({ params, scope: { attribute: "region", op: "=", value: "ID" } }, ds)).toEqual({ status: "tidak_dapat_dievaluasi", reason: "Atribut region belum dipetakan (M03)" });
    const withAttr: MappingVersion = { ...ds.mapping, roles: { ...ds.mapping.roles, region: "case_attr" } };
    expect(previewRule({ params, scope: { attribute: "region", op: "=", value: "ID" } }, { ...ds, mapping: withAttr }).status).toBe("ok");
    // resource column is not a scope attribute
    expect(previewRule({ params, scope: { attribute: "resource", op: "=", value: "x" } }, ds).status).toBe("tidak_dapat_dievaluasi");
  });
  it("varies with params/checksum but not with key order", () => {
    const sig = (p: typeof params, sc: Parameters<typeof previewRule>[0]["scope"], d = ds) => JSON.stringify(previewRule({ params: p, scope: sc }, d));
    const variants = [10, 11, 12, 13, 14, 15, 16, 17].map((limit) => sig({ ...(params as object), limit } as typeof params, null));
    expect(new Set(variants).size).toBeGreaterThan(1);
    const checksums = ["a", "b", "c", "d", "e", "f"].map((c) => sig(params, null, { ...ds, snapshot: { ...ds.snapshot, checksum: c } }));
    expect(new Set(checksums).size).toBeGreaterThan(1);
    const reordered = { unit: "kerja", limit: 14, to: LABELS[1], from: LABELS[0], type: "sla" } as typeof params;
    expect(sig(reordered, null)).toBe(sig(params, null));
    const withAttr = { ...ds, mapping: { ...ds.mapping, roles: { ...ds.mapping.roles, region: "case_attr" as const } } };
    expect(sig(params, { value: "ID", op: "=", attribute: "region" }, withAttr)).toBe(sig(params, { attribute: "region", op: "=", value: "ID" }, withAttr));
    for (const rows of [NaN, -5]) {
      expect(previewRule({ params, scope: null }, { ...ds, snapshot: { ...ds.snapshot, stats: { ...ds.snapshot.stats!, rows } } })).toEqual({ status: "ok", evaluable: 0, compliant: 0, nonCompliant: 0 });
    }
  });
  it("handles huge limits", () => {
    const big = previewRule({ params: { type: "sla", from: LABELS[0], to: LABELS[1], limit: 1e9, unit: "kerja" }, scope: null }, ds);
    expect(big.status).toBe("ok");
    const snap: Snapshot = { ...ds.snapshot, stats: undefined };
    expect(previewRule({ params, scope: null }, { ...ds, snapshot: snap }).status).toBe("ok");
  });
});

describe("nextStatuses / latestByKey / ruleSummary", () => {
  it("follows the status graph", () => {
    expect(nextStatuses("draf")).toEqual(["ditinjau"]);
    expect(nextStatuses("ditinjau")).toEqual(["draf", "disetujui"]);
    expect(nextStatuses("disetujui")).toEqual(["usang"]);
    expect(nextStatuses("usang")).toEqual([]);
  });
  it("latestByKey keeps the highest version per key, newest first", () => {
    const mk = (id: string, ruleKey: string, version: number, createdAt: string): RuleVersion => ({ ...s.rules[0], id, ruleKey, version, createdAt });
    const out = latestByKey([mk("a1", "a", 1, "2026-01-01"), mk("a2", "a", 2, "2026-01-02"), mk("b1", "b", 1, "2026-03-01"), mk("c1", "c", 1, "2026-01-02")]);
    expect(out.map((r) => r.id)).toEqual(["b1", "c1", "a2"]);
  });
  it("ruleSummary mentions activities and limit", () => {
    const t = ruleSummary({ type: "sla", from: "A", to: "B", limit: 14, unit: "kerja" });
    expect(t).toBe("Dari A sampai B tidak lebih dari 14 hari kerja");
    expect(ruleSummary({ type: "sla", from: "A", to: "B", limit: 2, unit: "kalender" })).toContain("hari kalender");
    expect(ruleSummary({ type: "urutan", before: "A", after: "B" })).toContain("A");
    expect(ruleSummary({ type: "wajib", activity: "A" })).toContain("A");
    expect(ruleSummary({ type: "terlarang", activity: "A" })).toContain("A");
    expect(ruleSummary({ type: "pemisahan_tugas", activityA: "A", activityB: "B" })).toMatch(/A.*B/);
  });
});

describe("isProposalBlocked", () => {
  it("hanya draf dan ditinjau yang menghalangi usulan baru", () => {
    const r = s.rules[0];
    expect((["draf", "ditinjau", "disetujui", "usang"] as const).map((status) => isProposalBlocked({ ...r, status }))).toEqual([true, true, false, false]);
  });
});
