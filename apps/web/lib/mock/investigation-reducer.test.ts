import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { flagsForProject, reduce, type MockAction } from "./reducer";
import { decisionHistory, latestDecisions, linkFreshness, snapshotFor, unreviewedModelOutputs } from "./investigation";
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
  it("unlink: kandidat pengganti pada keputusan digantikan juga tidak bisa dilepas", () => {
    const s = s0();
    s.decisions.push({ ...s.decisions[0], id: "dc-x", investigationId: "inv-1", targetLinkId: "ln-1-3", status: "digantikan", replacedByLinkId: "ln-1-4" });
    const r = reduce(s, { type: "unlinkObject", linkId: "ln-1-4" });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("aturan tanpa versi disetujui/terpasang (r-urutan ditinjau v1) tetap bisa ditautkan dengan versi v1", () => {
    const r = reduce(s0(), { type: "linkObject", investigationId: "inv-1", kind: "aturan", targetId: "r-urutan" });
    expect(r.error).toBeUndefined();
    expect(r.state.links.find((l) => l.id === r.linkId)).toMatchObject({ kind: "aturan", targetId: "r-urutan", linkedVersion: "v1" });
  });
  it("createInvestigation dari finding_57 menautkan aturan r-urutan v1", () => {
    const r = create(s0(), { findingId: "finding_57" });
    expect(r.error).toBeUndefined();
    expect(r.state.links.find((l) => l.investigationId === r.investigationId && l.kind === "aturan")).toMatchObject({ targetId: "r-urutan", linkedVersion: "v1" });
  });
  it("tautan aturan baru memakai versi analisis (v2), bukan usulan ditinjau terbaru; label audit memakai nama versi terbaru", () => {
    const proposed = reduce(s0(), { type: "createProposal", investigationId: "inv-1", ruleKey: "r-sla", note: "Perjelas batas SLA" });
    expect(proposed.error).toBeUndefined();
    const s = proposed.state;
    s.links = s.links.filter((l) => l.kind !== "aturan");
    const r = reduce(s, { type: "linkObject", investigationId: "inv-1", kind: "aturan", targetId: "r-sla" });
    expect(r.error).toBeUndefined();
    const link = r.state.links.find((l) => l.id === r.linkId)!;
    expect(link.linkedVersion).toBe("v2");
    expect(linkFreshness(r.state, link).stale).toBe(false);
    const label = audits(s, r.state)[0].objectLabel;
    expect(label).toContain(s.rules.find((x) => x.id === "r-sla-2")!.name);
    expect(label).not.toContain(s.rules.find((x) => x.id === "r-sla-1")!.name);
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
  it("dengan projectId hanya notifikasi proyek itu yang ditandai", () => {
    const s = s0();
    s.notifications.push({ id: "ntf-o", userId: "u-dimas", projectId: "p-lain", text: "t", href: "/x", read: false, at: "2026-10-16T07:00:00Z" });
    const r = reduce(s, { type: "markNotificationsRead", projectId: P });
    expect(r.state.notifications.filter((n) => n.userId === "u-dimas" && n.projectId === P).every((n) => n.read)).toBe(true);
    expect(r.state.notifications.find((n) => n.id === "ntf-o")!.read).toBe(false);
    const all = reduce(s, { type: "markNotificationsRead" });
    expect(all.state.notifications.find((n) => n.id === "ntf-o")!.read).toBe(true);
  });
  it("tanpa notifikasi tetap sukses", () => {
    const s = s0();
    s.notifications = [];
    expect(reduce(s, { type: "markNotificationsRead" }).error).toBeUndefined();
  });
});

describe("seed interpretasi", () => {
  it("i-seed-42 lolos_pemeriksaan, i-seed-63 gagal_pemeriksaan", () => {
    const st = (n: string) => initialState.interpretations.find((i) => i.id === n)?.status;
    expect(st("i-seed-42")).toBe("lolos_pemeriksaan");
    expect(st("i-seed-63")).toBe("gagal_pemeriksaan");
  });
});

describe("reviewJev", () => {
  const jev = (s: MockState, over: Record<string, unknown> = {}) =>
    reduce(s, { type: "reviewJev", investigationId: "inv-1", linkId: "ln-1-5", outcome: "dikonfirmasi", forEvalSet: false, ...over } as MockAction);
  it("dikonfirmasi: review tersimpan, belum ditinjau berkurang 1, audit jev.konfirmasi", () => {
    const s = s0();
    const before = unreviewedModelOutputs(s, "inv-1").length;
    const r = jev(s, { forEvalSet: true });
    expect(r.error).toBeUndefined();
    expect(r.state.reviews).toHaveLength(1);
    expect(r.state.reviews[0]).toMatchObject({ investigationId: "inv-1", linkId: "ln-1-5", outcome: "dikonfirmasi", forEvalSet: true, by: "u-dimas" });
    expect(unreviewedModelOutputs(r.state, "inv-1")).toHaveLength(before - 1);
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["jev.konfirmasi"]);
  });
  it("dikoreksi: butuh correctedVerdict dan reason; sukses audit jev.koreksi", () => {
    const s = s0();
    for (const over of [{}, { correctedVerdict: "tidak_wajar" }, { reason: "x" }, { correctedVerdict: " ", reason: "x" }, { correctedVerdict: "a", reason: "  " }]) {
      const r = jev(s, { outcome: "dikoreksi", ...over });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    const r = jev(s, { outcome: "dikoreksi", correctedVerdict: " tidak_wajar ", reason: " Bukti lain " });
    expect(r.error).toBeUndefined();
    expect(r.state.reviews[0]).toMatchObject({ outcome: "dikoreksi", correctedVerdict: "tidak_wajar", reason: "Bukti lain" });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["jev.koreksi"]);
  });
  it("tautan bukan hasil_jev, tautan workspace lain, atau tak ada -> galat", () => {
    const s = s0();
    for (const linkId of ["ln-1-6", "ln-1-3", "ln-2-1", "nope"]) {
      const r = jev(s, { linkId });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    expect(jev(s, { investigationId: "nope" }).state).toBe(s);
  });
  it("pemilik proses dan administrator ditolak", () => {
    for (const u of ["u-sari", "u-rina"]) {
      const s = as(s0(), u);
      expect(jev(s).state).toBe(s);
      expect(jev(s).error).toBeDefined();
    }
  });
  it("meninjau ulang menambah review; review terakhir berlaku", () => {
    const a = jev(s0());
    const b = jev(a.state, { outcome: "dikoreksi", correctedVerdict: "v", reason: "r" });
    expect(b.error).toBeUndefined();
    expect(b.state.reviews).toHaveLength(2);
    expect(b.state.reviews.filter((x) => x.linkId === "ln-1-5").at(-1)!.outcome).toBe("dikoreksi");
    expect(audits(a.state, b.state).map((e) => e.action)).toEqual(["jev.koreksi"]);
  });
});

describe("reviewDraft", () => {
  const draft = (s: MockState, over: Record<string, unknown> = {}) =>
    reduce(s, { type: "reviewDraft", investigationId: "inv-1", linkId: "ln-1-6", outcome: "disetujui", forEvalSet: false, ...over } as MockAction);
  // tautkan i-seed-63 (gagal_pemeriksaan) ke inv-1
  const withFailed = () => {
    const r = reduce(s0(), { type: "linkObject", investigationId: "inv-1", kind: "interpretasi", targetId: "i-seed-63" });
    return { s: r.state, linkId: r.linkId! };
  };
  it("disetujui pada i-seed-42 (lolos): sukses, audit draf.setujui, belum ditinjau berkurang 1", () => {
    const s = s0();
    const before = unreviewedModelOutputs(s, "inv-1").length;
    const r = draft(s);
    expect(r.error).toBeUndefined();
    expect(r.state.reviews[0]).toMatchObject({ linkId: "ln-1-6", outcome: "disetujui", by: "u-dimas" });
    expect(unreviewedModelOutputs(r.state, "inv-1")).toHaveLength(before - 1);
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["draf.setujui"]);
  });
  it("disetujui pada draf gagal_pemeriksaan -> galat", () => {
    const { s, linkId } = withFailed();
    const r = draft(s, { linkId });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("ditolak pada draf gagal boleh dengan kode + alasan; tanpa kode atau alasan galat", () => {
    const { s, linkId } = withFailed();
    for (const over of [{}, { rejectCode: "informasi_kurang" }, { reason: "x" }, { rejectCode: "informasi_kurang", reason: " " }, { rejectCode: "bukan_kode", reason: "x" }, { rejectCode: "constructor", reason: "x" }]) {
      const r = draft(s, { linkId, outcome: "ditolak", ...over });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    const ok = draft(s, { linkId, outcome: "ditolak", rejectCode: "klaim_tidak_didukung", reason: "Klaim berlebih", forEvalSet: true });
    expect(ok.error).toBeUndefined();
    expect(ok.state.reviews.at(-1)).toMatchObject({ linkId, outcome: "ditolak", rejectCode: "klaim_tidak_didukung", reason: "Klaim berlebih", forEvalSet: true });
    expect(audits(s, ok.state).map((e) => e.action)).toEqual(["draf.tolak"]);
  });
  it("ditolak pada draf lolos juga boleh", () => {
    expect(draft(s0(), { outcome: "ditolak", rejectCode: "bahasa_tidak_sesuai", reason: "Nada" }).error).toBeUndefined();
  });
  it("tautan bukan interpretasi / workspace lain / interpretasi tak ada -> galat", () => {
    const s = s0();
    for (const linkId of ["ln-1-5", "ln-1-3", "ln-2-1", "nope"]) {
      const r = draft(s, { linkId });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    const t = s0();
    t.interpretations = t.interpretations.filter((i) => i.id !== "i-seed-42");
    expect(draft(t).state).toBe(t);
  });
  it("pemilik proses dan administrator ditolak", () => {
    for (const u of ["u-sari", "u-rina"]) {
      const s = as(s0(), u);
      expect(draft(s).state).toBe(s);
      expect(draft(s).error).toBeDefined();
    }
  });
  it("meninjau ulang menambah review; review terakhir berlaku", () => {
    const a = draft(s0());
    const b = draft(a.state, { outcome: "ditolak", rejectCode: "informasi_kurang", reason: "r" });
    expect(b.error).toBeUndefined();
    expect(b.state.reviews).toHaveLength(2);
    expect(b.state.reviews.filter((x) => x.linkId === "ln-1-6").at(-1)!.outcome).toBe("ditolak");
  });
});

// ---------- Keputusan, penegasan, simulasi analisis ----------
const linkOf = (s: MockState, targetId: string) => s.links.find((l) => l.investigationId === "inv-1" && l.targetId === targetId)!.id;
// Selesaikan tinjauan jev_42 dan i-seed-42, lalu inv-1 -> siap_diputuskan (viewer tetap Dimas).
function ready(s: MockState): MockState {
  const jevLink = s.links.find((l) => l.investigationId === "inv-1" && l.kind === "hasil_jev")!.id;
  let r = reduce(s, { type: "reviewJev", investigationId: "inv-1", linkId: jevLink, outcome: "dikonfirmasi", forEvalSet: false });
  r = reduce(r.state, { type: "reviewDraft", investigationId: "inv-1", linkId: linkOf(r.state, "i-seed-42"), outcome: "disetujui", forEvalSet: false });
  r = reduce(r.state, { type: "setInvestigationStatus", investigationId: "inv-1", to: "siap_diputuskan" });
  expect(r.error).toBeUndefined();
  return r.state;
}
const decide = (s: MockState, over: Record<string, unknown> = {}) =>
  reduce(s, { type: "makeDecision", investigationId: "inv-1", targetLinkId: linkOf(s, "cand_1"), status: "usulan_uji_coba", reason: "Uji di satu cabang", expectedVersion: 0, ...over } as MockAction);
const simulate = (s: MockState) => reduce(s, { type: "simulateNewAnalysis", projectId: P });
// Sari menetapkan `dipilih` pada cand_1; viewer dikembalikan ke Dimas.
function chosen() {
  const r = decide(as(ready(s0()), "u-sari"), { status: "dipilih", reason: "Penyetuju cadangan disetujui" });
  expect(r.error).toBeUndefined();
  return { s: as(r.state, "u-dimas"), decisionId: r.decisionId! };
}

describe("makeDecision", () => {
  it("usulan_uji_coba oleh Dimas setelah ready: versi 1, potret kini, byRole analis, audit keputusan.tetapkan", () => {
    const s = ready(s0());
    const r = decide(s);
    expect(r.error).toBeUndefined();
    const d = r.state.decisions.find((x) => x.id === r.decisionId)!;
    expect(d).toMatchObject({ investigationId: "inv-1", projectId: P, targetLinkId: linkOf(s, "cand_1"), version: 1, status: "usulan_uji_coba", reason: "Uji di satu cabang", byId: "u-dimas", byRole: "analis" });
    expect(d.snapshot).toEqual(snapshotFor(s, P, "i-seed-42"));
    const a = audits(s, r.state);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ action: "keputusan.tetapkan", objectType: "Keputusan", projectId: P });
    expect(a[0].objectLabel).toContain("Usulan uji coba");
    expect(a[0].objectLabel).toContain("analis");
  });
  it("matriks peran: dipilih oleh Dimas, ditolak oleh Sari, apa pun oleh administrator -> galat", () => {
    const s = ready(s0());
    const sari = as(s, "u-sari");
    const rina = as(s, "u-rina");
    for (const [st, over] of [[s, { status: "dipilih" }], [sari, { status: "ditolak" }], [rina, {}], [rina, { status: "dipilih" }]] as const) {
      const r = decide(st, over);
      expect(r.error).toBeDefined();
      expect(r.state).toBe(st);
    }
  });
  it("dipilih oleh Sari: sukses byRole pemilik_proses", () => {
    const { s, decisionId } = chosen();
    expect(s.decisions.find((d) => d.id === decisionId)).toMatchObject({ status: "dipilih", byId: "u-sari", byRole: "pemilik_proses", version: 1 });
  });
  it("dipilih pada cand_2 (tak tervalidasi) -> galat", () => {
    const s = as(ready(s0()), "u-sari");
    const r = decide(s, { status: "dipilih", targetLinkId: linkOf(s, "cand_2") });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("digantikan wajib pengganti; dengan cand_2 sukses", () => {
    const s = ready(s0());
    expect(decide(s, { status: "digantikan" }).state).toBe(s);
    const r = decide(s, { status: "digantikan", replacedByLinkId: linkOf(s, "cand_2") });
    expect(r.error).toBeUndefined();
    expect(r.state.decisions.find((d) => d.id === r.decisionId)!.replacedByLinkId).toBe(linkOf(s, "cand_2"));
  });
  it("sebelum siap_diputuskan hanya perlu_investigasi yang boleh", () => {
    const s = s0();
    expect(decide(s).state).toBe(s);
    const r = decide(s, { status: "perlu_investigasi", targetLinkId: linkOf(s, "cand_2") });
    expect(r.error).toBeUndefined();
    expect(r.state.decisions.find((d) => d.id === r.decisionId)!.snapshot.narrativeVersion).toBeNull();
  });
  it("proyek tidak aktif atau workspace tak dikenal -> galat tanpa melempar", () => {
    const s = ready(s0());
    s.projects = s.projects.map((p) => (p.id === P ? { ...p, status: "ditangguhkan" } : p));
    expect(decide(s).state).toBe(s);
    const t = ready(s0());
    expect(decide(t, { investigationId: "nope" }).error).toBeDefined();
  });
  it("versi optimistis: dua keputusan expectedVersion 0 -> yang kedua galat 'muat ulang'; expectedVersion 1 -> versi 2", () => {
    const a = decide(ready(s0()));
    const b = decide(a.state, { status: "ditolak", reason: "Terlalu mahal" });
    expect(b.error).toContain("muat ulang");
    expect(b.state).toBe(a.state);
    const c = decide(a.state, { status: "ditolak", reason: "Terlalu mahal", expectedVersion: 1 });
    expect(c.error).toBeUndefined();
    const hist = decisionHistory(c.state, "inv-1", linkOf(c.state, "cand_1"));
    expect(hist.map((d) => [d.version, d.status])).toEqual([[2, "ditolak"], [1, "usulan_uji_coba"]]);
    expect(decide(c.state, { expectedVersion: 5 }).error).toContain("muat ulang");
  });
});

describe("simulateNewAnalysis", () => {
  it("menaikkan analisis, satu penanda aktif dengan ringkasan, status keputusan tetap, notifikasi, audit", () => {
    const { s, decisionId } = chosen();
    const r = simulate(s);
    expect(r.error).toBeUndefined();
    expect(r.state.analysisStates[0]).toMatchObject({ datasetVersion: "ds-3", contextPackage: "ctx-5", ruleVersions: { "r-sla": "v3" }, metricValues: { "finding_42.p90_days": 22.1 } });
    const flags = flagsForProject(r.state, P);
    expect(flags).toHaveLength(1);
    expect(flags[0].decisionId).toBe(decisionId);
    expect(flags[0].summary).toEqual(expect.arrayContaining(["Dataset ds-2 → ds-3", "Aturan r-sla v2 → v3", "P90 berubah dari 18,4 ke 22,1 hari kerja"]));
    expect(r.state.decisions).toEqual(s.decisions);
    const pings = r.state.notifications.slice(s.notifications.length);
    expect(pings.map((n) => n.userId)).toEqual(["u-sari"]);
    expect(pings[0]).toMatchObject({ projectId: P, href: "/projects/p-p2p/investigations/inv-1", read: false });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["analisis.simulasi"]);
  });
  it("dipanggil lagi tanpa keputusan baru: analisis naik lagi, penanda tidak bertambah", () => {
    const r1 = simulate(chosen().s);
    const r2 = simulate(r1.state);
    expect(r2.error).toBeUndefined();
    expect(r2.state.analysisStates[0].datasetVersion).toBe("ds-4");
    expect(r2.state.flags).toHaveLength(1);
    expect(r2.state.notifications).toHaveLength(r1.state.notifications.length);
    // ringkasan penanda aktif disegarkan terhadap potret keputusan (ds-2) dan analisis terbaru
    expect(flagsForProject(r2.state, P)[0].summary).toEqual(expect.arrayContaining(["Dataset ds-2 → ds-4", "P90 berubah dari 18,4 ke 26,5 hari kerja"]));
  });
  it("tanpa keputusan terbuka (inv-2 selesai) tidak membuat penanda", () => {
    const r = simulate(s0());
    expect(r.error).toBeUndefined();
    expect(r.state.flags).toHaveLength(0);
  });
  it("hanya analis", () => {
    for (const u of ["u-sari", "u-rina"]) {
      const s = as(s0(), u);
      const r = simulate(s);
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
  });
});

describe("confirmDecision", () => {
  it("tanpa penanda aktif -> galat", () => {
    const { s, decisionId } = chosen();
    const r = reduce(s, { type: "confirmDecision", decisionId });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
    expect(reduce(s, { type: "confirmDecision", decisionId: "nope" }).state).toBe(s);
  });
  it("dengan penanda: Sari menegaskan dipilih -> penanda ditutup, versi naik, status sama, potret kini, audit keputusan.tegaskan", () => {
    const { s, decisionId } = chosen();
    const sim = as(simulate(s).state, "u-sari");
    const r = reduce(sim, { type: "confirmDecision", decisionId });
    expect(r.error).toBeUndefined();
    expect(r.state.flags[0]).toMatchObject({ decisionId, clearedBy: "u-sari", clearedAt: expect.any(String) });
    expect(flagsForProject(r.state, P)).toEqual([]);
    const d = r.state.decisions.find((x) => x.id === r.decisionId)!;
    expect(d).toMatchObject({ version: 2, status: "dipilih", reason: "Ditegaskan setelah analisis baru", byId: "u-sari", byRole: "pemilik_proses" });
    expect(d.snapshot).toEqual(snapshotFor(sim, P, "i-seed-42"));
    expect(latestDecisions(r.state, "inv-1")).toEqual([d]);
    const a = audits(sim, r.state);
    expect(a.map((e) => e.action)).toEqual(["keputusan.tegaskan"]);
    expect(a[0].objectLabel).toContain("→ Dipilih");
    // versi lama tidak lagi punya penanda aktif
    expect(reduce(r.state, { type: "confirmDecision", decisionId }).error).toBeDefined();
  });
  it("analis tidak boleh menegaskan dipilih", () => {
    const { s, decisionId } = chosen();
    const sim = simulate(s).state;
    const r = reduce(sim, { type: "confirmDecision", decisionId });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(sim);
  });
  it("Dimas menegaskan usulan_uji_coba (analitis); Sari tidak boleh", () => {
    const made = decide(ready(s0()));
    const sim = simulate(made.state).state;
    const sari = as(sim, "u-sari");
    expect(reduce(sari, { type: "confirmDecision", decisionId: made.decisionId! }).state).toBe(sari);
    const r = reduce(sim, { type: "confirmDecision", decisionId: made.decisionId! });
    expect(r.error).toBeUndefined();
    expect(r.state.decisions.find((x) => x.id === r.decisionId)).toMatchObject({ version: 2, status: "usulan_uji_coba", byId: "u-dimas", byRole: "analis" });
  });
  it("administrator ditolak", () => {
    const { s, decisionId } = chosen();
    const sim = as(simulate(s).state, "u-rina");
    expect(reduce(sim, { type: "confirmDecision", decisionId }).state).toBe(sim);
  });
  it("keputusan baru pada target berpenanda menutup penanda", () => {
    const { s, decisionId } = chosen();
    const sim = as(simulate(s).state, "u-sari");
    const r = decide(sim, { status: "dipilih", reason: "Tetap dipilih", expectedVersion: 1 });
    expect(r.error).toBeUndefined();
    expect(flagsForProject(r.state, P)).toEqual([]);
    expect(r.state.flags[0]).toMatchObject({ decisionId, clearedBy: "u-sari" });
  });
});

describe("createProposal", () => {
  const propose = (s: MockState, over: Record<string, unknown> = {}) =>
    reduce(s, { type: "createProposal", investigationId: "inv-1", ruleKey: "r-sla", note: "Perjelas batas SLA menjadi 10 hari kerja", ...over } as MockAction);
  it("Dimas: versi aturan baru ditinjau, catatan jadi deskripsi, usulan tersimpan, tiga audit", () => {
    const s = s0();
    const r = propose(s);
    expect(r.error).toBeUndefined();
    const rule = r.state.rules.find((x) => x.id === r.ruleId)!;
    expect(rule).toMatchObject({ ruleKey: "r-sla", version: 3, status: "ditinjau", description: "Perjelas batas SLA menjadi 10 hari kerja", projectId: P });
    expect(r.state.proposals).toHaveLength(1);
    expect(r.state.proposals[0]).toMatchObject({ id: r.proposalId, investigationId: "inv-1", ruleId: rule.id, note: "Perjelas batas SLA menjadi 10 hari kerja", by: "u-dimas" });
    const a = audits(s, r.state);
    expect(a.map((e) => e.action)).toEqual(["usulan.buat", "aturan.ajukan", "aturan.simpan"]);
    expect(a[0]).toMatchObject({ objectType: "Usulan", projectId: P });
    expect(a[0].objectLabel).toContain("v3");
  });
  it("catatan kosong, aturan proyek lain, aturan tak dikenal, workspace tak dikenal -> galat, state sama", () => {
    const s = s0();
    s.rules.push({ ...s.rules.find((x) => x.id === "r-sla-2")!, id: "r-o2c-1", ruleKey: "r-o2c", projectId: "p-o2c", version: 1 });
    for (const over of [{ note: "  " }, { ruleKey: "r-o2c" }, { ruleKey: "nope" }, { investigationId: "nope" }]) {
      const r = propose(s, over);
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
  });
  it("usulan kedua, atau versi terbaru sudah ditinjau -> Sudah ada usulan berjalan", () => {
    const first = propose(s0()).state;
    const r = propose(first);
    expect(r).toEqual({ state: first, error: "Sudah ada usulan berjalan" });
  });
  it("gagal di langkah kedua (aturan tak lolos validasi) -> state awal utuh", () => {
    const s = s0();
    s.rules.find((x) => x.id === "r-sla-2")!.params = { type: "sla", from: "Tidak Ada", to: "Record Goods Receipt", limit: 14, unit: "kerja" };
    const r = propose(s);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("Sari (pemilik proses) boleh; Rina (administrator) tidak; proyek ditangguhkan tidak", () => {
    const s = s0();
    expect(propose(as(s, "u-sari")).error).toBeUndefined();
    const rina = as(s, "u-rina");
    expect(propose(rina).state).toBe(rina);
    const held = s0();
    held.projects.find((p) => p.id === P)!.status = "ditangguhkan";
    expect(propose(held).state).toBe(held);
  });
});
