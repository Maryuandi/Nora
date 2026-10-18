import { describe, expect, it } from "vitest";
import type { ConfigInput } from "./configs";
import { configVersions, initialState, packageRefs, packagesForProject, reduce, type MockAction } from "./reducer";
import type { ConfigData, MockState } from "./types";

const s0 = (): MockState => structuredClone(initialState);
const run = (s: MockState, a: MockAction) => reduce(s, a);
const ok = (s: MockState, a: MockAction) => { const r = reduce(s, a); expect(r.error).toBeUndefined(); return r; };
const pop = (name = "Populasi baru"): ConfigInput => ({ name, data: { kind: "population", completedOnly: false, periodFrom: null, periodTo: null, filter: null } });
const audits = (before: MockState, after: MockState) => after.audit.length - before.audit.length;
const doc = { title: "SOP", kind: "sop" as const, issuer: "Pengadaan", docDate: "2026-09-01", effectiveFrom: null, fileName: "a.pdf", sizeBytes: 10 };

describe("documents", () => {
  it("adds v1, then a new version without touching the old one", () => {
    const b = s0();
    const r1 = ok(b, { type: "addDoc", projectId: "p-p2p", input: doc });
    const d1 = r1.state.docs.find((d) => d.id === r1.docId)!;
    expect(d1).toMatchObject({ version: 1, status: "aktif" });
    expect(audits(b, r1.state)).toBe(1);
    const r2 = ok(r1.state, { type: "addDoc", projectId: "p-p2p", docKey: d1.docKey, input: { ...doc, fileName: "b.pdf" } });
    expect(r2.state.docs.find((d) => d.id === r2.docId)).toMatchObject({ version: 2, docKey: d1.docKey });
    expect(r2.state.docs.find((d) => d.id === d1.id)).toEqual(d1);
  });
  it("rejects invalid input, inactive projects and foreign docKeys", () => {
    const b = s0();
    expect(run(b, { type: "addDoc", projectId: "p-p2p", input: { ...doc, fileName: "a.exe" } }).error).toMatch(/Format/);
    expect(run(b, { type: "addDoc", projectId: "p-o2c", input: doc }).error).toBe("Proyek ini tidak menerima data baru");
    expect(run(b, { type: "addDoc", projectId: "p-p2p", docKey: "nope", input: doc }).error).toBe("Dokumen tidak ditemukan");
  });
  it("withdraws with a reason, keeping the record", () => {
    const b = s0();
    expect(run(b, { type: "withdrawDoc", docId: "d-sla", reason: " " }).error).toBe("Alasan wajib diisi");
    const r = ok(b, { type: "withdrawDoc", docId: "d-sla", reason: "Diganti" });
    expect(r.state.docs.find((d) => d.id === "d-sla")).toMatchObject({ status: "ditarik", withdrawnReason: "Diganti" });
    expect(audits(b, r.state)).toBe(1);
    expect(run(r.state, { type: "withdrawDoc", docId: "d-sla", reason: "x" }).error).toBe("Dokumen sudah ditarik");
  });
});

describe("configs", () => {
  it("creates v1 draf; edits draf in place; edits ditinjau as a new version", () => {
    const b = s0();
    const r1 = ok(b, { type: "saveConfig", projectId: "p-p2p", input: pop() });
    const c1 = r1.state.configs.find((c) => c.id === r1.configId)!;
    expect(c1).toMatchObject({ version: 1, status: "draf", needsValidation: false });
    const r2 = ok(r1.state, { type: "saveConfig", projectId: "p-p2p", key: c1.key, input: pop("Nama lain") });
    expect(r2.configId).toBe(c1.id);
    expect(configVersions(r2.state, c1.key)).toHaveLength(1);
    const r3 = ok(r2.state, { type: "changeConfigStatus", configId: c1.id, to: "ditinjau" });
    const r4 = ok(r3.state, { type: "saveConfig", projectId: "p-p2p", key: c1.key, input: pop("Versi dua") });
    expect(configVersions(r4.state, c1.key).map((c) => [c.version, c.status])).toEqual([[2, "draf"], [1, "ditinjau"]]);
  });
  it("rejects identical, usang and invalid saves", () => {
    const b = s0();
    const cat = b.configs.find((c) => c.id === "k-pop")!;
    expect(run(b, { type: "saveConfig", projectId: "p-p2p", key: cat.key, input: { name: cat.name, data: cat.data } }).error).toBe("Tidak ada perubahan");
    expect(run(b, { type: "saveConfig", projectId: "p-p2p", input: pop(" ") }).error).toBe("Nama wajib diisi");
    const retired = { ...b, configs: b.configs.map((c) => (c.id === "k-pop" ? { ...c, status: "usang" as const } : c)) };
    expect(run(retired, { type: "saveConfig", projectId: "p-p2p", key: cat.key, input: pop("Lain") }).error).toBe("Konfigurasi usang tidak dapat diubah");
    expect(run(b, { type: "saveConfig", projectId: "p-p2p", key: cat.key, input: { name: "x", data: { kind: "boundary", starts: ["A"], ends: ["B"], idleDays: null } } }).error).toBe("Konfigurasi bukan milik proyek ini");
  });
  it("singleton kinds reuse their key (a second boundary becomes v2, not a duplicate)", () => {
    const b = s0();
    const data: ConfigData = { kind: "boundary", starts: ["Create Purchase Order Item"], ends: ["Record Goods Receipt"], idleDays: null };
    const r = ok(b, { type: "saveConfig", projectId: "p-p2p", input: { name: "Batas baru", data } });
    expect(configVersions(r.state, "boundary-p-p2p").map((c) => [c.version, c.status])).toEqual([[2, "draf"], [1, "disetujui"]]);
  });
  it("approving v2 retires v1; confirmation resets on edit", () => {
    let s = s0();
    const data: ConfigData = { kind: "boundary", starts: ["Create Purchase Order Item"], ends: ["Record Goods Receipt"], idleDays: null };
    s = ok(s, { type: "saveConfig", projectId: "p-p2p", input: { name: "Batas baru", data } }).state;
    const v2 = configVersions(s, "boundary-p-p2p")[0];
    expect(v2.clientConfirmed).toBe(false);
    s = ok(s, { type: "changeConfigStatus", configId: v2.id, to: "ditinjau" }).state;
    s = ok(s, { type: "confirmConfigClient", configId: v2.id }).state;
    const before = s;
    s = ok(s, { type: "changeConfigStatus", configId: v2.id, to: "disetujui" }).state;
    expect(audits(before, s)).toBe(1);
    expect(configVersions(s, "boundary-p-p2p").map((c) => c.status)).toEqual(["disetujui", "usang"]);
  });
  it("status transitions: only valid ones; unknown ids do not throw", () => {
    const b = s0();
    expect(run(b, { type: "changeConfigStatus", configId: "k-pop", to: "usang" }).error).toBe("Transisi status tidak diizinkan");
    expect(run(b, { type: "changeConfigStatus", configId: "nope", to: "ditinjau" }).error).toBe("Konfigurasi tidak ditemukan");
    expect(run(b, { type: "confirmConfigClient", configId: "nope" }).error).toBe("Konfigurasi tidak ditemukan");
  });
  it("client confirmation: only confirmable kinds, only reviewed/approved, once", () => {
    const b = s0();
    expect(run(b, { type: "confirmConfigClient", configId: "k-calendar" }).error).toBe("Jenis konfigurasi ini tidak dikonfirmasi klien");
    expect(run(b, { type: "confirmConfigClient", configId: "k-boundary" }).error).toBe("Konfigurasi ini sudah dikonfirmasi klien");
    expect(ok(b, { type: "confirmConfigClient", configId: "k-pop" }).state.configs.find((c) => c.id === "k-pop")!.clientConfirmed).toBe(true);
  });
  it("approval of an invalid config is refused", () => {
    const b = s0();
    const bad = { ...b, configs: b.configs.map((c) => (c.id === "k-pop" ? { ...c, data: { kind: "population", completedOnly: true, periodFrom: "bad", periodTo: null, filter: null } as ConfigData } : c)) };
    expect(run(bad, { type: "changeConfigStatus", configId: "k-pop", to: "disetujui" }).error).toMatch(/Tanggal/);
  });
  it("inactive project refuses writes", () => {
    expect(run(s0(), { type: "saveConfig", projectId: "p-o2c", input: pop() }).error).toBe("Proyek ini tidak menerima data baru");
  });
});

describe("copyStarterCatalog", () => {
  it("copies once into a project, all draf and flagged", () => {
    const b = s0();
    expect(run(b, { type: "copyStarterCatalog", projectId: "p-p2p" }).error).toBe("Katalog proyek ini sudah ada");
    const empty = { ...b, configs: b.configs.filter((c) => !["hypothesis", "intervention", "rubric"].includes(c.data.kind)) };
    const r = ok(empty, { type: "copyStarterCatalog", projectId: "p-p2p" });
    const added = r.state.configs.filter((c) => !empty.configs.includes(c));
    expect(added).toHaveLength(21);
    expect(added.every((c) => c.status === "draf" && c.needsValidation)).toBe(true);
    expect(audits(empty, r.state)).toBe(1);
  });
});

describe("freezePackage", () => {
  it("freezes approved rules and configs only, then refuses an unchanged repeat", () => {
    const b = s0();
    const r = ok(b, { type: "freezePackage", projectId: "p-p2p", note: "Awal" });
    const pkg = r.state.packages.find((p) => p.id === r.packageId)!;
    expect(pkg.version).toBe(1);
    expect(pkg.refs.map((x) => x.id)).toEqual(packageRefs(b, "p-p2p").map((x) => x.id));
    expect(pkg.refs.some((x) => x.id === "k-pop" || x.id === "r-sla-1" || x.id === "r-urutan")).toBe(false); // ditinjau / usang excluded
    expect(pkg.refs.map((x) => x.id)).toEqual(expect.arrayContaining(["r-sla-2", "k-boundary", "k-calendar"]));
    expect(audits(b, r.state)).toBe(1);
    expect(run(r.state, { type: "freezePackage", projectId: "p-p2p" }).error).toBe("Tidak ada perubahan sejak paket terakhir");
  });
  it("a changed approval produces v2 and leaves v1 untouched", () => {
    const r1 = ok(s0(), { type: "freezePackage", projectId: "p-p2p" });
    const s = ok(r1.state, { type: "changeConfigStatus", configId: "k-pop", to: "disetujui" }).state;
    const r2 = ok(s, { type: "freezePackage", projectId: "p-p2p" });
    const pkgs = packagesForProject(r2.state, "p-p2p");
    expect(pkgs.map((p) => p.version)).toEqual([2, 1]);
    expect(pkgs[1]).toEqual(r1.state.packages[0]);
    expect(pkgs[0].hash).not.toBe(pkgs[1].hash);
  });
  it("needs an approved boundary and at least one approved rule", () => {
    const b = s0();
    const noBoundary = { ...b, configs: b.configs.map((c) => (c.id === "k-boundary" ? { ...c, status: "usang" as const } : c)) };
    expect(run(noBoundary, { type: "freezePackage", projectId: "p-p2p" }).error).toBe("Paket butuh batas proses yang disetujui");
    const noRule = { ...b, rules: b.rules.map((r) => (r.status === "disetujui" ? { ...r, status: "usang" as const } : r)) };
    expect(run(noRule, { type: "freezePackage", projectId: "p-p2p" }).error).toBe("Paket butuh minimal satu aturan yang disetujui");
    expect(run(b, { type: "freezePackage", projectId: "p-o2c" }).error).toBe("Proyek ini tidak menerima data baru");
  });
});
