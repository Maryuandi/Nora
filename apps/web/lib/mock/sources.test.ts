import { describe, expect, it } from "vitest";
import { initialState, MOCK_TODAY, reduce, snapshotsForSource, sourceFreshness, type MockAction } from "./reducer";
import type { MockState, Snapshot } from "./types";

const MB500 = 500 * 1024 * 1024;
const s0 = (): MockState => structuredClone(initialState);
const SRC = "s-p2p-sap"; // project p-p2p (aktif)
const upload = (s: MockState, fileName: string, sizeBytes: number, sourceId = SRC) =>
  reduce(s, { type: "uploadSnapshot", sourceId, fileName, sizeBytes });
const ok = (s: MockState, fileName: string, sizeBytes: number, sourceId = SRC) => {
  const r = upload(s, fileName, sizeBytes, sourceId);
  expect(r.error).toBeUndefined();
  return { state: r.state, snap: r.state.snapshots.find((x) => x.id === r.snapshotId)! };
};
const daysBefore = (n: number) => new Date(Date.parse(MOCK_TODAY) - n * 86_400_000).toISOString().slice(0, 10);
const withSnap = (s: MockState, over: Partial<Snapshot>): MockState => ({
  ...s,
  snapshots: [...s.snapshots, { ...s.snapshots.find((x) => x.id === "sn-1")!, id: `x-${s.snapshots.length}`, sourceId: "s-new", ...over }],
});

describe("createSource", () => {
  it("adds a source and one audit event", () => {
    const before = s0();
    const { state, error } = reduce(before, { type: "createSource", projectId: "p-p2p", name: "  Sumber Baru " });
    expect(error).toBeUndefined();
    expect(state.sources.length).toBe(before.sources.length + 1);
    expect(state.sources.at(-1)).toMatchObject({ name: "Sumber Baru", projectId: "p-p2p", kind: "file" });
    expect(state.audit.length).toBe(before.audit.length + 1);
    expect(state.audit[0]).toMatchObject({ action: "sumber.tambah", objectType: "Sumber data", projectId: "p-p2p" });
  });
  it("rejects a whitespace-only name", () => {
    const before = s0();
    const r = reduce(before, { type: "createSource", projectId: "p-p2p", name: "   " });
    expect(r.error).toBeTruthy();
    expect(r.state).toBe(before);
  });
  it("rejects a duplicate name in the same project, case-insensitive", () => {
    const r = reduce(s0(), { type: "createSource", projectId: "p-p2p", name: "ekspor sap p2p" });
    expect(r.error).toBeTruthy();
  });
  it("rejects when the project is not aktif", () => {
    const before = s0();
    const p = before.projects.find((x) => x.status !== "aktif")!;
    const r = reduce(before, { type: "createSource", projectId: p.id, name: "Apa saja" });
    expect(r.error).toBeTruthy();
    expect(r.state).toBe(before);
  });
});

describe("uploadSnapshot: validation", () => {
  it("accepts LOG.CSV", () => expect(upload(s0(), "LOG.CSV", 1000).error).toBeUndefined());
  it("rejects data.txt", () => expect(upload(s0(), "data.txt", 1000).error).toBe("Format tidak didukung"));
  it("rejects an empty file", () => expect(upload(s0(), "a.csv", 0).error).toBe("File kosong"));
  it("accepts exactly 500 MB", () => expect(upload(s0(), "a.csv", MB500).error).toBeUndefined());
  it("rejects 500 MB + 1", () => expect(upload(s0(), "a.csv", MB500 + 1).error).toBe("Ukuran melebihi 500 MB"));
  it("accepts .xes.gz as its own format", () => expect(ok(s0(), "a.xes.gz", 5000).snap.format).toBe("xes.gz"));
});

describe("uploadSnapshot: outcome", () => {
  it("normal file becomes siap_dipetakan with few rejected rows", () => {
    const { snap } = ok(s0(), "bagus.csv", 220_000);
    expect(snap.status).toBe("siap_dipetakan");
    expect(snap.stats!.rows).toBe(1000);
    expect(snap.stats!.rejected).toBeLessThanOrEqual(10);
    expect(snap.stats).toMatchObject({ encoding: "UTF-8", delimiter: ";", latestEventAt: daysBefore(1) });
    expect(snap.preview!.length).toBe(100);
    expect(snap.columns!.map((c) => c.name)).toEqual(["Case ID", "Activity", "Timestamp", "Resource", "Amount"]);
  });
  it("'rusak' becomes perlu_tinjauan with about 8% rejected", () => {
    const { snap } = ok(s0(), "data_rusak.csv", 220_000);
    expect(snap.status).toBe("perlu_tinjauan");
    expect(snap.stats!.rejected / snap.stats!.rows).toBeCloseTo(0.08, 2);
    expect(snap.errors!.reduce((n, e) => n + e.count, 0)).toBe(snap.stats!.rejected);
  });
  it("'gagal' becomes gagal with a failureReason", () => {
    const { snap } = ok(s0(), "gagal.csv", 220_000);
    expect(snap.status).toBe("gagal");
    expect(snap.failureReason).toBeTruthy();
  });
  it("each successful upload adds exactly one snapshot.unggah audit event", () => {
    const before = s0();
    const { state } = ok(before, "bagus.csv", 220_000);
    expect(state.audit.length).toBe(before.audit.length + 1);
    expect(state.audit[0]).toMatchObject({ action: "snapshot.unggah", objectType: "Snapshot", projectId: "p-p2p" });
  });
  it("rejects upload when the project is not aktif", () => {
    const before = s0();
    const p = before.projects.find((x) => x.status !== "aktif")!;
    const state = { ...before, sources: [...before.sources, { ...before.sources[0], id: "s-x", projectId: p.id }] };
    expect(upload(state, "a.csv", 1000, "s-x").error).toBeTruthy();
  });
});

describe("uploadSnapshot: duplicates", () => {
  it("returns duplicateOf the first snapshot for the same file twice, without changing state", () => {
    const first = ok(s0(), "bagus.csv", 220_000);
    const second = upload(first.state, "bagus.csv", 220_000);
    expect(second.duplicateOf).toBe(first.snap.id);
    expect(second.error).toBeUndefined();
    expect(second.state.snapshots.length).toBe(first.state.snapshots.length);
    expect(second.state.audit.length).toBe(first.state.audit.length);
    expect(upload(first.state, "bagus.csv", 220_000).duplicateOf).toBe(first.snap.id);
  });
  it("same name with a different size is not a duplicate", () => {
    const first = ok(s0(), "bagus.csv", 220_000);
    expect(upload(first.state, "bagus.csv", 220_001).duplicateOf).toBeUndefined();
  });
  it("a dibatalkan snapshot with the same checksum does not trigger a duplicate", () => {
    const first = ok(s0(), "bagus.csv", 220_000);
    const cancelled = reduce(first.state, { type: "cancelSnapshot", snapshotId: first.snap.id }).state;
    const again = upload(cancelled, "bagus.csv", 220_000);
    expect(again.duplicateOf).toBeUndefined();
    expect(again.snapshotId).toBeTruthy();
  });
});

describe("uploadSnapshot: re-import counts", () => {
  it("a source with earlier snapshots gets ~40% duplicate and ~0.2% conflict events", () => {
    const { snap } = ok(s0(), "baru.csv", 220_000); // s-p2p-sap already has snapshots
    expect(snap.stats!.duplicateEvents).toBe(400);
    expect(snap.stats!.conflictEvents).toBe(2);
    expect(snap.stats!.newEvents).toBe(598);
  });
  it("a source without snapshots has no duplicate events", () => {
    const base = s0();
    const { state } = reduce(base, { type: "createSource", projectId: "p-p2p", name: "Kosong" });
    const { snap } = ok(state, "baru.csv", 220_000, state.sources.at(-1)!.id);
    expect(snap.stats!.duplicateEvents).toBe(0);
    expect(snap.stats!.conflictEvents).toBe(0);
    expect(snap.stats!.newEvents).toBe(1000);
  });
});

describe("confirmSnapshot / cancelSnapshot", () => {
  it("confirms perlu_tinjauan into siap_dipetakan with one audit event", () => {
    const before = s0();
    const r = reduce(before, { type: "confirmSnapshot", snapshotId: "sn-2" });
    expect(r.error).toBeUndefined();
    expect(r.state.snapshots.find((x) => x.id === "sn-2")!.status).toBe("siap_dipetakan");
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0].action).toBe("snapshot.konfirmasi");
  });
  it("cannot confirm a gagal snapshot", () => {
    expect(reduce(s0(), { type: "confirmSnapshot", snapshotId: "sn-4" }).error).toBeTruthy();
  });
  it("cancels siap_dipetakan into dibatalkan, keeping the record, with one audit event", () => {
    const before = s0();
    const r = reduce(before, { type: "cancelSnapshot", snapshotId: "sn-1" });
    expect(r.error).toBeUndefined();
    expect(r.state.snapshots.length).toBe(before.snapshots.length);
    expect(r.state.snapshots.find((x) => x.id === "sn-1")!.status).toBe("dibatalkan");
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0].action).toBe("snapshot.batal");
  });
  it("cannot cancel a dibatalkan snapshot", () => {
    expect(reduce(s0(), { type: "cancelSnapshot", snapshotId: "sn-5" }).error).toBeTruthy();
  });
});

describe("sourceFreshness", () => {
  it("is stale at 31 days and fresh at 30 days", () => {
    const f = (n: number) => sourceFreshness(withSnap(s0(), { status: "siap_dipetakan", stats: { ...s0().snapshots[0].stats!, latestEventAt: daysBefore(n) } }), "s-new");
    expect(f(31).stale).toBe(true);
    expect(f(30).stale).toBe(false);
  });
  it("ignores dibatalkan snapshots for latestEventAt and lastImportAt", () => {
    const stats = s0().snapshots[0].stats!;
    let s = withSnap(s0(), { status: "siap_dipetakan", uploadedAt: "2026-08-01T00:00:00Z", stats: { ...stats, latestEventAt: "2026-08-01" } });
    s = withSnap(s, { status: "dibatalkan", uploadedAt: "2026-10-10T00:00:00Z", stats: { ...stats, latestEventAt: "2026-10-09" } });
    expect(sourceFreshness(s, "s-new")).toMatchObject({ latestEventAt: "2026-08-01", lastImportAt: "2026-08-01T00:00:00Z" });
  });
  it("is empty and not stale for a source without live snapshots", () => {
    expect(sourceFreshness(s0(), "tidak-ada")).toEqual({ lastImportAt: null, latestEventAt: null, stale: false });
  });
  it("snapshotsForSource puts a later upload first even when uploadedAt ties", () => {
    const a = ok(s0(), "satu.csv", 220_000);
    const b = ok(a.state, "dua.csv", 220_000);
    const list = snapshotsForSource(b.state, SRC);
    expect(list.map((x) => x.id).slice(0, 2)).toEqual([b.snap.id, a.snap.id]);
    expect(sourceFreshness(b.state, SRC).latestEventAt).toBe(daysBefore(1));
  });
  it("fabricated error example rows never exceed the row count", () => {
    const { snap } = ok(s0(), "rusak.csv", 220 * 10);
    for (const e of snap.errors!) for (const ex of e.examples) expect(ex.row).toBeLessThanOrEqual(snap.stats!.rows);
  });
  it("snapshotsForSource lists newest first", () => {
    const list = snapshotsForSource(s0(), "s-p2p-sap");
    expect(list.map((x) => x.id)).toEqual(["sn-2", "sn-1"]);
  });
});

describe("no throws on unknown ids", () => {
  const actions: MockAction[] = [
    { type: "createSource", projectId: "zzz", name: "x" },
    { type: "uploadSnapshot", sourceId: "zzz", fileName: "a.csv", sizeBytes: 10 },
    { type: "confirmSnapshot", snapshotId: "zzz" },
    { type: "cancelSnapshot", snapshotId: "zzz" },
  ];
  it.each(actions)("$type returns an error string", (a) => {
    const before = s0();
    const r = reduce(before, a);
    expect(typeof r.error).toBe("string");
    expect(r.state).toBe(before);
  });
});

describe("seed snapshot stats", () => {
  it("new + duplicate + conflict === rows and rejected <= rows", () => {
    for (const sn of initialState.snapshots) {
      if (!sn.stats) continue;
      const { rows, rejected, newEvents, duplicateEvents, conflictEvents } = sn.stats;
      expect(newEvents + duplicateEvents + conflictEvents, sn.id).toBe(rows);
      expect(rejected, sn.id).toBeLessThanOrEqual(rows);
    }
  });
});
