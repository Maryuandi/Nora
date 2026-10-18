import { describe, expect, it } from "vitest";
import { initialState, latestMapping, mappingsForSource, reduce, type MockAction } from "./reducer";
import type { MockState } from "./types";

const s0 = (): MockState => structuredClone(initialState);
type Save = Extract<MockAction, { type: "saveMapping" }>;
// Same configuration as seed m-1 (v1 on s-p2p-sap / sn-1), fully confirmed.
const save = (over: Partial<Save> = {}): Save => ({
  type: "saveMapping", sourceId: "s-p2p-sap", snapshotId: "sn-1",
  roles: { case_id: "case_id", activity: "activity", timestamp: "timestamp_end", resource: "resource", vendor: "case_attr" },
  timeFormat: "YYYY-MM-DD HH:mm:ss", timezone: "Asia/Jakarta",
  labels: [{ raw: "create purchase order item", canonical: "Create Purchase Order Item" }, { raw: "Record Goods Receipt ", canonical: "Record Goods Receipt" },
    { raw: "Cancel Invoice Receipt", canonical: null }],
  confirmed: ["case_id", "activity", "timestamp_end"], timezoneConfirmed: true, ...over,
});

describe("saveMapping: success", () => {
  it("adds v2 on a source that has v1, with exactly one audit event", () => {
    const before = s0();
    const r = reduce(before, save({ timezone: "UTC" }));
    expect(r.error).toBeUndefined();
    expect(r.state.mappings.length).toBe(before.mappings.length + 1);
    const m = r.state.mappings.find((x) => x.id === r.mappingId)!;
    expect(m).toMatchObject({ sourceId: "s-p2p-sap", snapshotId: "sn-1", projectId: "p-p2p", version: 2, timezone: "UTC", createdBy: before.viewerId });
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "pemetaan.simpan", objectType: "Pemetaan", objectLabel: "Ekspor SAP P2P v2", projectId: "p-p2p" });
    expect(r.state.mappings.find((x) => x.id === "m-1")).toBe(before.mappings[0]);
  });
  it("adds v1 on a source without mappings; versions are independent per source", () => {
    const r1 = reduce(s0(), save({ sourceId: "s-p2p-tiket", snapshotId: "sn-3" }));
    expect(r1.error).toBeUndefined();
    expect(r1.state.mappings.find((x) => x.id === r1.mappingId)!.version).toBe(1);
    expect(r1.state.audit[0].objectLabel).toBe("Log Tiket Lama v1");
    const r2 = reduce(r1.state, save({ timezone: "UTC" }));
    expect(r2.state.mappings.find((x) => x.id === r2.mappingId)!.version).toBe(2);
  });
  it("keeps the note and bumps the version when one label changes", () => {
    const labels = save().labels.map((l) => (l.raw === "Cancel Invoice Receipt" ? { ...l, canonical: "Cancel" } : l));
    const r = reduce(s0(), save({ labels, note: "ubah label" }));
    expect(r.error).toBeUndefined();
    expect(r.state.mappings.find((x) => x.id === r.mappingId)).toMatchObject({ version: 2, note: "ubah label" });
  });
});

describe("saveMapping: no change", () => {
  it("rejects an identical config, state is the same reference", () => {
    const before = s0();
    const r = reduce(before, save());
    expect(r.error).toBe("Tidak ada perubahan dari v1");
    expect(r.state).toBe(before);
    expect(r.mappingId).toBeUndefined();
  });
  it("ignores label order and note", () => {
    const before = s0();
    const r = reduce(before, save({ labels: [...save().labels].reverse(), note: "beda catatan" }));
    expect(r.error).toBe("Tidak ada perubahan dari v1");
    expect(r.state).toBe(before);
  });
});

describe("saveMapping: guards", () => {
  it("rejects a non-aktif project", () => {
    const before = s0();
    const sn = before.snapshots.find((x) => x.id === "sn-5")!;
    sn.status = "siap_dipetakan"; // so only the project status can fail
    const r = reduce(before, save({ sourceId: "s-o2c-erp", snapshotId: "sn-5" }));
    expect(r.error).toBe("Proyek ini tidak menerima data baru");
    expect(r.state).toBe(before);
  });
  it("rejects a snapshot that is perlu_tinjauan", () => {
    const before = s0();
    const r = reduce(before, save({ snapshotId: "sn-2" }));
    expect(r.error).toBe("Snapshot belum siap dipetakan");
    expect(r.state).toBe(before);
  });
  it("rejects a snapshot that belongs to another source", () => {
    const before = s0();
    const r = reduce(before, save({ snapshotId: "sn-3" }));
    expect(r.error).toBe("Snapshot bukan milik sumber ini");
    expect(r.state).toBe(before);
  });
  it("returns the first validateMapping error", () => {
    const before = s0();
    const r = reduce(before, save({ roles: { case_id: "case_id", activity: "activity", timestamp: "event_attr", resource: "resource" } }));
    expect(r.error).toBe("Pilih kolom untuk Waktu selesai");
    expect(r.state).toBe(before);
  });
  it("returns an error string for unknown ids without throwing", () => {
    const before = s0();
    const a = reduce(before, save({ sourceId: "nope" }));
    const b = reduce(before, save({ snapshotId: "nope" }));
    expect(a.error).toBe("Sumber data tidak ditemukan");
    expect(b.error).toBe("Snapshot tidak ditemukan");
    expect(a.state).toBe(before);
    expect(b.state).toBe(before);
  });
});

describe("mappingsForSource / latestMapping", () => {
  it("orders newest first, ties broken by later index", () => {
    const s = s0();
    const base = s.mappings[0];
    s.mappings = [
      { ...base, id: "a", version: 1, createdAt: "2026-10-15T08:00:00Z" },
      { ...base, id: "b", version: 2, createdAt: "2026-10-16T08:00:00Z" },
      { ...base, id: "c", version: 3, createdAt: "2026-10-16T08:00:00Z" },
      { ...base, id: "x", sourceId: "other" },
    ];
    expect(mappingsForSource(s, "s-p2p-sap").map((m) => m.id)).toEqual(["c", "b", "a"]);
    expect(latestMapping(s, "s-p2p-sap")?.id).toBe("c");
    expect(latestMapping(s, "nope")).toBeNull();
  });
});
