import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { fabricate } from "./fabricate";
import { activityLabels, detectTimeFormat, previewEvents, suggestGroups, suggestRoles, validateMapping } from "./mapping";
import type { ColumnRole, LabelRule, Snapshot } from "./types";

const sn1 = (): Snapshot => structuredClone(initialState.snapshots.find((s) => s.id === "sn-1")!);
const fab = (checksum = "ab12cd34ef56", rows = 1000): Snapshot => ({ ...sn1(), checksum, stats: { ...sn1().stats!, rows }, ...fabricate(rows, 0) });

describe("suggestRoles", () => {
  it("maps XES-style names", () => {
    const cols = ["case:concept:name", "concept:name", "time:timestamp", "org:resource", "lifecycle:transition", "Amount"].map((name) => ({ name, samples: [] }));
    expect(suggestRoles(cols)).toEqual({
      "case:concept:name": "case_id", "concept:name": "activity", "time:timestamp": "timestamp_end",
      "org:resource": "resource", "lifecycle:transition": "lifecycle", Amount: "event_attr",
    });
  });
  it("gives each role to the first matching column only", () => {
    const r = suggestRoles(["Case ID", "case_id", "Activity"].map((name) => ({ name, samples: [] })));
    expect(r).toEqual({ "Case ID": "case_id", case_id: "event_attr", Activity: "activity" });
  });
  it("does not throw on empty columns", () => {
    expect(suggestRoles([])).toEqual({});
  });
});

describe("detectTimeFormat", () => {
  it("detects both formats", () => {
    expect(detectTimeFormat(["2026-09-01 08:00:00"])).toBe("YYYY-MM-DD HH:mm:ss");
    expect(detectTimeFormat(["01/09/2026 08:00"])).toBe("DD/MM/YYYY HH:mm");
  });
  it("returns tidak dikenali otherwise", () => {
    expect(detectTimeFormat(["kemarin"])).toBe("tidak dikenali");
    expect(detectTimeFormat([])).toBe("tidak dikenali");
    expect(detectTimeFormat(["2026-09-01 08:00:00", "kemarin"])).toBe("tidak dikenali");
  });
});

describe("activityLabels", () => {
  it("is deterministic, sums to rows, 8-12 labels, sorted desc, has a case pair", () => {
    const s = fab();
    const a = activityLabels(s);
    expect(activityLabels(s)).toEqual(a);
    expect(a.reduce((n, l) => n + l.count, 0)).toBe(s.stats!.rows);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].count).toBeGreaterThanOrEqual(a[i].count);
    expect(new Set(a.map((l) => l.raw)).size).toBe(a.length);
    const lower = new Set(a.map((l) => l.raw));
    expect(a.some((l) => l.raw !== l.raw.toLowerCase() && lower.has(l.raw.toLowerCase()))).toBe(true);
  });
  it("uses the real activity values of seeded sn-1", () => {
    const s = initialState.snapshots.find((x) => x.id === "sn-1")!;
    const a = activityLabels(s);
    const raws = a.map((l) => l.raw);
    expect(raws).toContain("create purchase order item");
    expect(raws).toContain("Record Goods Receipt ");
    expect(raws).toContain("Cancel Invoice Receipt");
    expect(a.reduce((n, l) => n + l.count, 0)).toBe(s.stats!.rows);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
  it("falls back to generic activities without columns, empty without stats", () => {
    const s = { ...fab(), columns: undefined, preview: undefined };
    const a = activityLabels(s);
    expect(a.map((l) => l.raw)).toContain("Create Order");
    expect(a.reduce((n, l) => n + l.count, 0)).toBe(1000);
    expect(activityLabels({ ...s, stats: undefined })).toEqual([]);
  });
});

describe("suggestGroups", () => {
  it("groups spelling variants, canonical = most frequent, no singleton groups", () => {
    const g = suggestGroups([
      { raw: "Create Order", count: 50 }, { raw: "create order", count: 5 },
      { raw: "Create  Order.", count: 3 }, { raw: "Ship Goods", count: 9 },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].canonical).toBe("Create Order");
    expect([...g[0].raws].sort()).toEqual(["Create  Order.", "Create Order", "create order"].sort());
  });
});

describe("previewEvents", () => {
  const snap = (): Snapshot => ({
    ...sn1(),
    columns: [{ name: "Case", samples: [] }, { name: "Act", samples: [] }, { name: "When", samples: [] }, { name: "Who", samples: [] }],
    preview: [["C1", "Create Order", "2026-09-01 08:00:00", "u1"], ["C2", "Cancel", "kemarin", "u2"]],
  });
  const roles: Record<string, ColumnRole> = { Case: "case_id", Act: "activity", When: "timestamp_end", Who: "resource" };
  const run = (over: Partial<Parameters<typeof previewEvents>[0]> = {}) =>
    previewEvents({ snapshot: snap(), roles, timeFormat: "YYYY-MM-DD HH:mm:ss", timezone: "Asia/Jakarta", labels: [], ...over });

  it("converts Asia/Jakarta to UTC (-7h) and keeps fields", () => {
    const r = run();
    expect(r[0]).toEqual({ caseId: "C1", activityRaw: "Create Order", activity: "Create Order", excluded: false, timeSource: "2026-09-01 08:00:00", timeUtc: "2026-09-01T01:00:00Z", resource: "u1" });
  });
  it("UTC unchanged, other zones, DD/MM format", () => {
    expect(run({ timezone: "UTC" })[0].timeUtc).toBe("2026-09-01T08:00:00Z");
    expect(run({ timezone: "Asia/Makassar" })[0].timeUtc).toBe("2026-09-01T00:00:00Z");
    expect(run({ timezone: "Asia/Jayapura" })[0].timeUtc).toBe("2026-08-31T23:00:00Z");
    const s = snap(); s.preview = [["C1", "A", "01/09/2026 08:00", "u"]];
    expect(run({ snapshot: s, timeFormat: "DD/MM/YYYY HH:mm" })[0].timeUtc).toBe("2026-09-01T01:00:00Z");
  });
  it("non-date or wrong-format text gives null", () => {
    expect(run()[1].timeUtc).toBeNull();
    expect(run({ timeFormat: "DD/MM/YYYY HH:mm" })[0].timeUtc).toBeNull();
    expect(run({ timeFormat: "tidak dikenali" })[0].timeUtc).toBeNull();
  });
  it("rejects impossible dates and handles rollovers", () => {
    const at = (t: string, timeFormat: string, timezone = "Asia/Jakarta") => {
      const s = snap(); s.preview = [["C", "A", t, "u"]];
      return run({ snapshot: s, timeFormat, timezone })[0].timeUtc;
    };
    const iso = "YYYY-MM-DD HH:mm:ss", dmy = "DD/MM/YYYY HH:mm";
    expect(at("31/09/2026 08:00", dmy)).toBeNull();
    expect(at("01/13/2026 10:00", dmy)).toBeNull();
    expect(at("2026-02-29 08:00:00", iso)).toBeNull();
    expect(at("2024-02-29 08:00:00", iso)).toBe("2024-02-29T01:00:00Z");
    expect(at("2026-09-01 25:00:00", iso)).toBeNull();
    expect(at("2026-09-01 03:00:00", iso)).toBe("2026-08-31T20:00:00Z");
    expect(at("2026-01-01 05:00:00", iso, "Asia/Jayapura")).toBe("2025-12-31T20:00:00Z");
  });
  it("prototype-key format gives null instead of throwing", () => {
    expect(run({ timeFormat: "toString" })[0].timeUtc).toBeNull();
  });
  it("applies label rules", () => {
    const labels: LabelRule[] = [{ raw: "Create Order", canonical: "Buat Pesanan" }, { raw: "Cancel", canonical: null }];
    const r = run({ labels });
    expect(r[0].activity).toBe("Buat Pesanan");
    expect(r[0].activityRaw).toBe("Create Order");
    expect(r[1].excluded).toBe(true);
  });
  it("caps at 50 rows and passes hostile strings through untouched", () => {
    const s = snap();
    s.preview = Array.from({ length: 80 }, () => ["<script>x</script>", "<script>x</script>", "<script>x</script>", "<script>x</script>"]);
    const r = run({ snapshot: s });
    expect(r).toHaveLength(50);
    expect(r[0].caseId).toBe("<script>x</script>");
    expect(r[0].timeSource).toBe("<script>x</script>");
    expect(r[0].timeUtc).toBeNull();
  });
  it("does not throw without columns or preview", () => {
    expect(run({ snapshot: { ...snap(), columns: undefined, preview: undefined } })).toEqual([]);
  });
});

describe("validateMapping", () => {
  const ok = () => ({
    columns: ["c", "a", "t"],
    roles: { c: "case_id", a: "activity", t: "timestamp_end" } as Record<string, ColumnRole>,
    confirmed: ["case_id", "activity", "timestamp_end"] as ColumnRole[],
    timezoneConfirmed: true,
    timezone: "Asia/Jakarta",
    timeFormat: "YYYY-MM-DD HH:mm:ss",
    labels: [] as LabelRule[],
  });
  it("valid config gives no errors", () => expect(validateMapping(ok())).toEqual([]));
  it("missing case_id", () => {
    const i = ok(); i.roles.c = "event_attr";
    expect(validateMapping(i)).toContainEqual({ field: "role:case_id", message: "Pilih kolom untuk ID kasus" });
  });
  it("two activity columns", () => {
    const i = ok(); i.roles.c = "activity";
    expect(validateMapping(i)).toContainEqual({ field: "role:activity", message: "Satu peran hanya untuk satu kolom" });
  });
  it("timezone not confirmed", () => {
    const i = ok(); i.timezoneConfirmed = false;
    expect(validateMapping(i)).toEqual([{ field: "timezone", message: "Konfirmasi zona waktu sumber" }]);
  });
  it("role not confirmed", () => {
    const i = ok(); i.confirmed = ["case_id", "timestamp_end"];
    expect(validateMapping(i)).toEqual([{ field: "role:activity", message: "Konfirmasi kolom Aktivitas" }]);
  });
  it("unknown timezone", () => {
    const i = ok(); i.timezone = "Mars/Olympus";
    expect(validateMapping(i)).toEqual([{ field: "timezone", message: "Zona waktu tidak dikenali" }]);
  });
  it("unknown time format", () => {
    const i = ok(); i.timeFormat = "tidak dikenali";
    expect(validateMapping(i).map((e) => e.field)).toEqual(["timeFormat"]);
  });
  it("empty canonical and circular labels", () => {
    const i = ok(); i.labels = [{ raw: "x", canonical: "" }];
    expect(validateMapping(i).map((e) => e.field)).toEqual(["labels"]);
    i.labels = [{ raw: "A", canonical: "B" }, { raw: "B", canonical: "A" }];
    expect(validateMapping(i).map((e) => e.field)).toEqual(["labels"]);
    i.labels = [{ raw: "A", canonical: "A" }, { raw: "B", canonical: "A" }, { raw: "C", canonical: null }];
    expect(validateMapping(i)).toEqual([]);
  });
  it("does not throw on empty columns", () => {
    expect(() => validateMapping({ ...ok(), columns: [], roles: {}, confirmed: [] })).not.toThrow();
  });
});
