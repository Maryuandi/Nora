import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { reduce, type MockAction } from "./reducer";
import { linkFreshness } from "./investigation";
import type { MockState } from "./types";

const s0 = () => structuredClone(initialState);
const as = (s: MockState, userId: string) => reduce(s, { type: "setViewer", userId }).state;
const P = "p-p2p";
const create = (s: MockState, over: Partial<Extract<MockAction, { type: "createInvestigation" }>> = {}) =>
  reduce(s, { type: "createInvestigation", projectId: P, title: "Judul baru", question: "Apa penyebabnya?", findingId: "finding_42", ...over });
const audits = (before: MockState, after: MockState) => after.audit.slice(0, after.audit.length - before.audit.length);

describe("createInvestigation", () => {
  it("dari temuan: terbuka, pemilik viewer, anggota viewer + pemilik proses, tautan otomatis, satu audit", () => {
    const s = s0();
    const r = create(s);
    expect(r.error).toBeUndefined();
    const inv = r.state.investigations.find((i) => i.id === r.investigationId)!;
    expect(inv).toMatchObject({ projectId: P, status: "terbuka", ownerId: "u-dimas", originFindingId: "finding_42" });
    expect(inv.memberIds).toEqual(expect.arrayContaining(["u-dimas", "u-sari"]));
    const links = r.state.links.filter((l) => l.investigationId === inv.id);
    const pairs = links.map((l) => `${l.kind}:${l.targetId}`);
    expect(pairs).toEqual(expect.arrayContaining(["temuan:finding_42", "aturan:r-sla", "kandidat:cand_1", "kandidat:cand_2", "hasil_jev:jev_42", "interpretasi:i-seed-42"]));
    expect(links.find((l) => l.kind === "aturan")!.linkedVersion).toBe("v2");
    expect(links.find((l) => l.kind === "temuan")!.linkedVersion).toBe("analisis-3");
    const a = audits(s, r.state);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ action: "investigasi.buat", objectType: "Investigasi", projectId: P });
  });
  it("kosong: tanpa tautan", () => {
    const r = create(s0(), { findingId: undefined });
    expect(r.error).toBeUndefined();
    expect(r.state.links.filter((l) => l.investigationId === r.investigationId)).toHaveLength(0);
  });
  it("judul atau pertanyaan kosong -> galat", () => {
    const s = s0();
    expect(create(s, { title: " " })).toEqual({ state: s, error: expect.any(String) });
    expect(create(s, { question: "  " }).state).toBe(s);
  });
  it("temuan milik proyek lain -> galat", () => {
    const s = s0();
    s.findings.push({ id: "f-lain", projectId: "p-lain", title: "x", summary: "", limitedContext: false, evidence: [] });
    const r = create(s, { findingId: "f-lain" });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
});

describe("linkObject / unlinkObject", () => {
  it("sukses menautkan dan mengaudit; ganda dan target tak ada ditolak", () => {
    const s = s0();
    const r = reduce(s, { type: "linkObject", investigationId: "inv-1", kind: "kasus", targetId: "case_sample" });
    expect(r.error).toBeUndefined();
    expect(r.state.links.find((l) => l.id === r.linkId)).toMatchObject({ investigationId: "inv-1", kind: "kasus", targetId: "case_sample", linkedVersion: "analisis-3" });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.tautkan"]);
    const dup = reduce(r.state, { type: "linkObject", investigationId: "inv-1", kind: "kasus", targetId: "case_sample" });
    expect(dup.error).toBeDefined();
    expect(dup.state).toBe(r.state);
    const miss = reduce(s, { type: "linkObject", investigationId: "inv-1", kind: "kandidat", targetId: "nope" });
    expect(miss.error).toBeDefined();
    expect(miss.state).toBe(s);
  });
  it("unlink: ditolak bila tautan punya keputusan; sukses bila tidak", () => {
    const s = s0();
    const blocked = reduce(s, { type: "unlinkObject", linkId: "ln-2-2" });
    expect(blocked.error).toBeDefined();
    expect(blocked.state).toBe(s);
    const ok = reduce(s, { type: "unlinkObject", linkId: "ln-1-4" });
    expect(ok.error).toBeUndefined();
    expect(ok.state.links.some((l) => l.id === "ln-1-4")).toBe(false);
    expect(audits(s, ok.state).map((e) => e.action)).toEqual(["investigasi.lepas"]);
  });
});

describe("refreshLink", () => {
  it("linkedVersion menjadi versi kini", () => {
    const s = s0();
    s.analysisStates[0].analysis = "analisis-4";
    s.analysisStates[0].ruleVersions["r-sla"] = "v3";
    const r = reduce(s, { type: "refreshLink", linkId: "ln-1-2" });
    expect(r.error).toBeUndefined();
    const l = r.state.links.find((x) => x.id === "ln-1-2")!;
    expect(l.linkedVersion).toBe("v3");
    expect(linkFreshness(r.state, l).stale).toBe(false);
    const t = reduce(r.state, { type: "refreshLink", linkId: "ln-1-1" });
    expect(t.state.links.find((x) => x.id === "ln-1-1")!.linkedVersion).toBe("analisis-4");
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.perbarui_tautan"]);
  });
});

describe("setInvestigationStatus", () => {
  it("siap_diputuskan ditolak selagi ada keluaran belum ditinjau, state identik", () => {
    const s = s0();
    const r = reduce(s, { type: "setInvestigationStatus", investigationId: "inv-1", to: "siap_diputuskan" });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("sukses setelah semua ditinjau, satu audit", () => {
    const s = s0();
    for (const linkId of ["ln-1-5", "ln-1-6"])
      s.reviews.push({ id: `rv-${linkId}`, investigationId: "inv-1", linkId, outcome: "dikonfirmasi", reason: "", forEvalSet: false, by: "u-dimas", at: "2026-10-17" });
    const r = reduce(s, { type: "setInvestigationStatus", investigationId: "inv-1", to: "siap_diputuskan" });
    expect(r.error).toBeUndefined();
    expect(r.state.investigations.find((i) => i.id === "inv-1")!.status).toBe("siap_diputuskan");
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.status"]);
  });
});

describe("penolakan umum", () => {
  const actions: [string, MockAction][] = [
    ["createInvestigation", { type: "createInvestigation", projectId: P, title: "T", question: "Q" }],
    ["linkObject", { type: "linkObject", investigationId: "inv-1", kind: "kasus", targetId: "case_sample" }],
    ["setInvestigationStatus", { type: "setInvestigationStatus", investigationId: "inv-1", to: "menunggu_informasi" }],
  ];
  it.each(actions)("%s: pemilik proses ditolak", (_n, a) => {
    const s = as(s0(), "u-sari");
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it.each(actions)("%s: administrator ditolak", (_n, a) => {
    const s = as(s0(), "u-rina");
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it.each(actions)("%s: proyek ditangguhkan ditolak", (_n, a) => {
    const s = s0();
    s.projects.find((p) => p.id === P)!.status = "ditangguhkan";
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it.each([
    { type: "createInvestigation", projectId: "x", title: "T", question: "Q" },
    { type: "linkObject", investigationId: "x", kind: "kasus", targetId: "case_sample" },
    { type: "unlinkObject", linkId: "x" },
    { type: "refreshLink", linkId: "x" },
    { type: "setInvestigationStatus", investigationId: "x", to: "selesai" },
  ] as MockAction[])("id tak dikenal tidak melempar: %o", (a) => {
    const s = s0();
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("aksi M11 yang belum diimplementasi mengembalikan galat, bukan diam-diam", () => {
    const s = s0();
    const r = reduce(s, { type: "createProposal", investigationId: "inv-1", ruleKey: "r-sla", note: "x" });
    expect(r).toEqual({ state: s, error: "Belum didukung" });
  });
});

const MB20 = 20 * 1024 * 1024;
const note = (over: Record<string, unknown>) => ({ kind: "bukti", title: "Catatan", body: "Isi", ...over }) as Extract<MockAction, { type: "addNote" }>["note"];
const addNote = (s: MockState, n: Record<string, unknown>) => reduce(s, { type: "addNote", investigationId: "inv-1", note: note(n) });

describe("addNote", () => {
  it("wawancara wajib narasumber dan tanggal; sukses satu audit investigasi.catat", () => {
    const s = s0();
    expect(addNote(s, { kind: "wawancara", interviewDate: "2026-10-17" })).toEqual({ state: s, error: expect.any(String) });
    expect(addNote(s, { kind: "wawancara", interviewee: "  ", interviewDate: "2026-10-17" }).state).toBe(s);
    expect(addNote(s, { kind: "wawancara", interviewee: "Bu A" }).state).toBe(s);
    const r = addNote(s, { kind: "wawancara", interviewee: "Bu A", interviewDate: "2026-10-17" });
    expect(r.error).toBeUndefined();
    expect(r.state.notes).toHaveLength(s.notes.length + 1);
    expect(r.state.notes.at(-1)).toMatchObject({ investigationId: "inv-1", kind: "wawancara", createdBy: "u-dimas" });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.catat"]);
  });
  it("bukti berkas: tepat 20 MB sukses, +1 byte galat", () => {
    const s = s0();
    expect(addNote(s, { attachment: { type: "file", label: "a.pdf", sizeBytes: MB20 + 1 } }).state).toBe(s);
    expect(addNote(s, { attachment: { type: "file", label: "a.pdf", sizeBytes: MB20 } }).error).toBeUndefined();
  });
  it("bukti tautan: hanya http(s)", () => {
    const s = s0();
    for (const label of ["javascript:alert(1)", "bukan url", "ftp://x.id/a"]) {
      const r = addNote(s, { attachment: { type: "link", label } });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    expect(addNote(s, { attachment: { type: "link", label: "https://contoh.id/x" } }).error).toBeUndefined();
  });
  it("hipotesis mulai belum_diuji; pertanyaan terbuka", () => {
    const r = addNote(s0(), { kind: "hipotesis", hypothesisState: "didukung", supportingLinkIds: ["ln-1-1"] });
    expect(r.state.notes.at(-1)).toMatchObject({ hypothesisState: "belum_diuji", supportingLinkIds: [] });
    expect(addNote(s0(), { kind: "pertanyaan" }).state.notes.at(-1)).toMatchObject({ questionState: "terbuka" });
  });
  it("pemilik proses: wawancara dan bukti sukses, hipotesis dan pertanyaan galat; administrator galat", () => {
    const sari = as(s0(), "u-sari");
    expect(addNote(sari, { kind: "wawancara", interviewee: "X", interviewDate: "2026-10-17" }).error).toBeUndefined();
    expect(addNote(sari, { kind: "bukti" }).error).toBeUndefined();
    for (const kind of ["hipotesis", "pertanyaan"]) {
      const r = addNote(sari, { kind });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(sari);
    }
    const rina = as(s0(), "u-rina");
    expect(addNote(rina, { kind: "bukti" }).state).toBe(rina);
  });
  it("workspace tak ada -> galat", () => {
    const s = s0();
    expect(reduce(s, { type: "addNote", investigationId: "x", note: note({}) }).state).toBe(s);
  });
});

describe("setHypothesisState", () => {
  it("didukung tanpa tautan galat; dengan satu tautan sukses + audit", () => {
    const s = s0();
    const bad = reduce(s, { type: "setHypothesisState", noteId: "note-2", state: "didukung", supportingLinkIds: [] });
    expect(bad).toEqual({ state: s, error: expect.any(String) });
    const r = reduce(s, { type: "setHypothesisState", noteId: "note-2", state: "didukung", supportingLinkIds: ["ln-1-2"] });
    expect(r.error).toBeUndefined();
    expect(r.state.notes.find((n) => n.id === "note-2")).toMatchObject({ hypothesisState: "didukung", supportingLinkIds: ["ln-1-2"] });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.hipotesis"]);
  });
  it("tautan dari workspace lain galat; non-hipotesis galat; pemilik proses galat", () => {
    const s = s0();
    expect(reduce(s, { type: "setHypothesisState", noteId: "note-2", state: "dibantah", supportingLinkIds: ["ln-2-1"] }).state).toBe(s);
    expect(reduce(s, { type: "setHypothesisState", noteId: "note-1", state: "didukung", supportingLinkIds: ["ln-1-2"] }).state).toBe(s);
    const sari = as(s0(), "u-sari");
    expect(reduce(sari, { type: "setHypothesisState", noteId: "note-2", state: "didukung", supportingLinkIds: ["ln-1-2"] }).state).toBe(sari);
    expect(reduce(s, { type: "setHypothesisState", noteId: "nope", state: "belum_diuji", supportingLinkIds: [] }).error).toBeDefined();
  });
  it("kembali ke belum_diuji tanpa tautan boleh", () => {
    expect(reduce(s0(), { type: "setHypothesisState", noteId: "note-2", state: "belum_diuji", supportingLinkIds: [] }).error).toBeUndefined();
  });
});

describe("setQuestionState", () => {
  it("analis sukses + audit; non-pertanyaan galat", () => {
    const s = s0();
    const r = reduce(s, { type: "setQuestionState", noteId: "note-3", state: "terjawab" });
    expect(r.error).toBeUndefined();
    expect(r.state.notes.find((n) => n.id === "note-3")!.questionState).toBe("terjawab");
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.pertanyaan"]);
    expect(reduce(s, { type: "setQuestionState", noteId: "note-2", state: "terjawab" }).state).toBe(s);
  });
  it("penanggung jawab pemilik proses sukses; pemilik proses non-penanggung jawab galat", () => {
    const s = s0();
    s.notes.find((n) => n.id === "note-3")!.assigneeId = "u-sari";
    expect(reduce(as(s, "u-sari"), { type: "setQuestionState", noteId: "note-3", state: "terjawab" }).error).toBeUndefined();
    const t = as(s0(), "u-sari");
    const r = reduce(t, { type: "setQuestionState", noteId: "note-3", state: "terjawab" });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(t);
  });
});

describe("addComment", () => {
  const comment = (s: MockState, body: string, over: Record<string, unknown> = {}) =>
    reduce(s, { type: "addComment", investigationId: "inv-1", body, ...over } as MockAction);
  it("isi kosong galat; sukses satu audit komentar.tambah", () => {
    const s = s0();
    expect(comment(s, "  ")).toEqual({ state: s, error: expect.any(String) });
    const r = comment(s, "Catatan");
    expect(r.error).toBeUndefined();
    expect(r.state.comments.at(-1)).toMatchObject({ investigationId: "inv-1", body: "Catatan", parentId: null, targetLinkId: null, resolved: false, createdBy: "u-dimas" });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["komentar.tambah"]);
  });
  it("parentId dari workspace lain atau tak ada galat; balasan satu workspace sukses", () => {
    const s = s0();
    s.comments.push({ id: "cm-x", investigationId: "inv-2", targetLinkId: null, parentId: null, body: "x", mentions: [], resolved: false, createdBy: "u-dimas", createdAt: "2026-10-16T07:00:00Z" });
    expect(comment(s, "balas", { parentId: "cm-x" }).state).toBe(s);
    expect(comment(s, "balas", { parentId: "nope" }).state).toBe(s);
    expect(comment(s, "balas", { parentId: "cm-1" }).error).toBeUndefined();
  });
  it("targetLinkId dari workspace lain galat", () => {
    const s = s0();
    expect(comment(s, "x", { targetLinkId: "ln-2-1" }).state).toBe(s);
    expect(comment(s, "x", { targetLinkId: "ln-1-2" }).error).toBeUndefined();
  });
  it("@Sari oleh Dimas -> satu notifikasi untuk u-sari", () => {
    const s = s0();
    const r = comment(s, "@Sari mohon cek");
    const n = r.state.notifications.slice(s.notifications.length);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ userId: "u-sari", projectId: P, href: `/projects/${P}/investigations/inv-1`, read: false });
    expect(n[0].text).toContain("Dimas Pratama");
    expect(r.state.comments.at(-1)!.mentions).toEqual(["u-sari"]);
  });
  it("sebutan diri sendiri, tak dikenal, atau non-anggota proyek -> tanpa notifikasi", () => {
    const s = s0();
    for (const body of ["@Dimas ingat", "@tidakada halo", "@Lia halo", "@Budi halo"]) {
      expect(comment(s, body).state.notifications).toHaveLength(s.notifications.length);
    }
  });
  it("pemilik proses boleh; administrator galat", () => {
    expect(comment(as(s0(), "u-sari"), "Setuju").error).toBeUndefined();
    const rina = as(s0(), "u-rina");
    expect(comment(rina, "x").state).toBe(rina);
  });
});

describe("resolveComment", () => {
  const resolve = (s: MockState, commentId: string, resolved = true) => reduce(s, { type: "resolveComment", commentId, resolved });
  it("analis menyelesaikan akar + audit komentar.selesai", () => {
    const s = s0();
    const r = resolve(s, "cm-1");
    expect(r.error).toBeUndefined();
    expect(r.state.comments.find((c) => c.id === "cm-1")!.resolved).toBe(true);
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["komentar.selesai"]);
    expect(resolve(r.state, "cm-1", false).state.comments.find((c) => c.id === "cm-1")!.resolved).toBe(false);
  });
  it("penulis (pemilik proses) boleh", () => {
    expect(resolve(as(s0(), "u-sari"), "cm-1").error).toBeUndefined();
  });
  it("bukan penulis dan bukan analis galat", () => {
    const s = s0();
    s.comments.push({ ...s.comments[0], id: "cm-d", createdBy: "u-dimas" });
    const sari = as(s, "u-sari");
    const r = resolve(sari, "cm-d");
    expect(r.error).toBeDefined();
    expect(r.state).toBe(sari);
  });
  it("balasan galat; id tak ada galat", () => {
    const s = s0();
    const withReply = comment0(s);
    expect(resolve(withReply, "cm-r").error).toBeDefined();
    expect(resolve(s, "nope").state).toBe(s);
  });
});
function comment0(s: MockState): MockState {
  return { ...s, comments: [...s.comments, { ...s.comments[0], id: "cm-r", parentId: "cm-1", createdBy: "u-dimas" }] };
}

describe("markNotificationsRead", () => {
  it("menandai semua milik viewer; tanpa audit; milik lain tetap", () => {
    const s = s0();
    s.notifications.push({ id: "ntf-s", userId: "u-sari", projectId: P, text: "t", href: "/x", read: false, at: "2026-10-16T07:00:00Z" });
    const r = reduce(s, { type: "markNotificationsRead" });
    expect(r.error).toBeUndefined();
    expect(r.state.notifications.filter((n) => n.userId === "u-dimas").every((n) => n.read)).toBe(true);
    expect(r.state.notifications.find((n) => n.id === "ntf-s")!.read).toBe(false);
    expect(r.state.audit).toBe(s.audit);
  });
  it("tanpa notifikasi tetap sukses", () => {
    const s = s0();
    s.notifications = [];
    expect(reduce(s, { type: "markNotificationsRead" }).error).toBeUndefined();
  });
});
