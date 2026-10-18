// Reducer M11. Dipanggil lebih dulu oleh `reduce`; `null` berarti aksi bukan milik M11.
import {
  DECISION_LABEL, INVESTIGATION_STATUS_LABEL, LINK_KIND_LABEL, REJECT_LABEL, canDecide, canSetStatus, decisionHistory, detectRevalidation,
  extractMentions, latestDecisions, linkFreshness, nextAnalysisState, snapshotFor, validateDecision,
} from "./investigation";
import { id, now, withAudit } from "./mutate";
import { acceptsData, can, type UiAction } from "./permissions";
import type { MockAction, ReduceResult } from "./reducer";
import type {
  Decision, DecisionStatus, HypothesisState, Investigation, InvestigationLink, InvestigationNote, InvestigationStatus, LinkKind,
  MockState, ModelReview, Notification, Project, RejectReason, RevalidationFlag, Role,
} from "./types";

export type InvestigationAction =
  | { type: "createInvestigation"; projectId: string; title: string; question: string; findingId?: string }
  | { type: "linkObject"; investigationId: string; kind: LinkKind; targetId: string }
  | { type: "unlinkObject"; linkId: string }
  | { type: "refreshLink"; linkId: string }
  | { type: "setInvestigationStatus"; investigationId: string; to: InvestigationStatus }
  | { type: "addNote"; investigationId: string; note: Omit<InvestigationNote, "id" | "investigationId" | "createdBy" | "createdAt"> }
  | { type: "setHypothesisState"; noteId: string; state: HypothesisState; supportingLinkIds: string[] }
  | { type: "setQuestionState"; noteId: string; state: "terbuka" | "terjawab" }
  | { type: "addComment"; investigationId: string; targetLinkId?: string; parentId?: string; body: string }
  | { type: "resolveComment"; commentId: string; resolved: boolean }
  | { type: "markNotificationsRead" }
  | { type: "reviewJev"; investigationId: string; linkId: string; outcome: "dikonfirmasi" | "dikoreksi"; correctedVerdict?: string; reason?: string; forEvalSet: boolean }
  | { type: "reviewDraft"; investigationId: string; linkId: string; outcome: "disetujui" | "ditolak"; rejectCode?: RejectReason; reason?: string; forEvalSet: boolean }
  | { type: "makeDecision"; investigationId: string; targetLinkId: string; status: DecisionStatus; reason: string; replacedByLinkId?: string; expectedVersion: number }
  | { type: "confirmDecision"; decisionId: string }
  | { type: "simulateNewAnalysis"; projectId: string }
  | { type: "createProposal"; investigationId: string; ruleKey: string; note: string };

// Paket bukti memakai id bukti aturan; tautan memakai ruleKey proyek.
const EVIDENCE_RULE_KEY: Record<string, string> = { rule_sla_1: "r-sla", rule_urut_1: "r-urutan" };

type Ctx = { project: Project; role: Role | null };
type InvCtx = Ctx & { inv: Investigation };

function projectCtx(state: MockState, projectId: string, perm: UiAction): Ctx | string {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return "Proyek tidak ditemukan";
  const role = state.memberships.find((m) => m.projectId === projectId && m.userId === state.viewerId)?.role ?? null;
  if (!role) return "Anda bukan anggota proyek";
  if (!acceptsData(project.status)) return "Proyek ini tidak menerima data baru";
  if (!can(role, perm)) return "Peran Anda tidak diizinkan untuk aksi ini";
  return { project, role };
}

function ctx(state: MockState, investigationId: string, perm: UiAction): InvCtx | string {
  const inv = state.investigations.find((i) => i.id === investigationId);
  if (!inv) return "Workspace tidak ditemukan";
  const c = projectCtx(state, inv.projectId, perm);
  return typeof c === "string" ? c : { ...c, inv };
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function attachmentError(a: NonNullable<InvestigationNote["attachment"]>): string | null {
  if (a.type === "file") return (a.sizeBytes ?? 0) > MAX_FILE_BYTES ? "Berkas melebihi 20 MB" : null;
  try {
    const { protocol } = new URL(a.label);
    return protocol === "http:" || protocol === "https:" ? null : "Tautan harus diawali http atau https";
  } catch {
    return "Tautan tidak valid";
  }
}

const currentRuleVersion = (state: MockState, projectId: string, ruleKey: string): string | null => {
  const v = state.rules.filter((r) => r.projectId === projectId && r.ruleKey === ruleKey).map((r) => r.version);
  return v.length ? `v${Math.max(...v)}` : null;
};
const evidenceOf = (state: MockState, projectId: string) =>
  state.findings.filter((f) => f.projectId === projectId).flatMap((f) => f.evidence);

// Judul objek untuk label audit; kembali ke id bila tak ditemukan.
function targetTitle(state: MockState, projectId: string, kind: LinkKind, targetId: string): string {
  if (kind === "aturan") return state.rules.find((r) => r.ruleKey === targetId)?.name ?? targetId;
  if (kind === "interpretasi") return state.findings.find((f) => f.id === state.interpretations.find((i) => i.id === targetId)?.findingId)?.title ?? targetId;
  return evidenceOf(state, projectId).find((e) => e.id === targetId)?.title ?? targetId;
}

// Versi objek saat ini, atau null bila target tidak ada di proyek.
function resolveTarget(state: MockState, projectId: string, kind: LinkKind, targetId: string): string | null {
  const analysis = state.analysisStates.find((a) => a.projectId === projectId)?.analysis ?? "";
  switch (kind) {
    case "aturan": return currentRuleVersion(state, projectId, targetId);
    case "interpretasi": return state.interpretations.some((i) => i.id === targetId && i.projectId === projectId) ? analysis : null;
    case "temuan": return state.findings.some((f) => f.id === targetId && f.projectId === projectId) ? analysis : null;
    case "kasus": case "kandidat": case "hasil_jev":
      return evidenceOf(state, projectId).some((e) => e.id === targetId && e.kind === kind) ? analysis : null;
    default: return null; // skenario/uji_coba belum punya sumber data
  }
}

// Versi narasi untuk potret: interpretasi tertaut yang tinjauan terakhirnya `disetujui`, paling baru.
function approvedNarrative(state: MockState, investigationId: string): string | null {
  const seen = new Set<string>();
  for (const r of [...state.reviews].reverse()) {
    if (r.investigationId !== investigationId || seen.has(r.linkId)) continue;
    seen.add(r.linkId);
    const link = state.links.find((l) => l.id === r.linkId);
    if (r.outcome === "disetujui" && link?.kind === "interpretasi") return link.targetId;
  }
  return null;
}

// Tutup penanda aktif milik keputusan-keputusan ini.
const clearFlags = (state: MockState, decisionIds: Set<string>): RevalidationFlag[] =>
  state.flags.map((f) => (!f.clearedAt && decisionIds.has(f.decisionId) ? { ...f, clearedBy: state.viewerId, clearedAt: now() } : f));

export function reduceInvestigation(
  state: MockState,
  action: MockAction,
  _reduceRoot: (s: MockState, a: MockAction) => ReduceResult,
): ReduceResult | null {
  const fail = (error: string): ReduceResult => ({ state, error });
  const addLink = (links: InvestigationLink[], investigationId: string, kind: LinkKind, targetId: string, linkedVersion: string) => {
    const link: InvestigationLink = { id: id("ln"), investigationId, kind, targetId, linkedVersion, createdBy: state.viewerId, createdAt: now() };
    links.push(link);
    return link;
  };

  switch (action.type) {
    case "createInvestigation": {
      const c = projectCtx(state, action.projectId, "investigation.create");
      if (typeof c === "string") return fail(c);
      const title = action.title.trim();
      const question = action.question.trim();
      if (!title) return fail("Judul wajib diisi");
      if (!question) return fail("Pertanyaan wajib diisi");
      const finding = action.findingId ? state.findings.find((f) => f.id === action.findingId && f.projectId === c.project.id) : undefined;
      if (action.findingId && !finding) return fail("Temuan tidak ditemukan di proyek ini");
      const inv: Investigation = {
        id: id("inv"), projectId: c.project.id, title, question, originFindingId: finding?.id ?? null, status: "terbuka",
        ownerId: state.viewerId,
        memberIds: [...new Set([state.viewerId, ...state.memberships.filter((m) => m.projectId === c.project.id && m.role === "pemilik_proses").map((m) => m.userId)])],
        createdAt: now(),
      };
      const links: InvestigationLink[] = [];
      if (finding) {
        const analysis = state.analysisStates.find((a) => a.projectId === c.project.id)?.analysis ?? "";
        addLink(links, inv.id, "temuan", finding.id, analysis);
        for (const e of finding.evidence) {
          if (e.kind === "aturan") {
            const ruleKey = EVIDENCE_RULE_KEY[e.id];
            const v = ruleKey && currentRuleVersion(state, c.project.id, ruleKey);
            if (v) addLink(links, inv.id, "aturan", ruleKey, v);
          } else if (e.kind === "kandidat" || e.kind === "hasil_jev") addLink(links, inv.id, e.kind, e.id, analysis);
        }
        // Interpretasi terbaru untuk temuan ini; urutan sisip menjadi pemutus seri.
        const interp = state.interpretations
          .map((x, i) => ({ x, i }))
          .filter(({ x }) => x.projectId === c.project.id && x.findingId === finding.id)
          .sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i)[0]?.x;
        if (interp) addLink(links, inv.id, "interpretasi", interp.id, analysis);
      }
      const next = { ...state, investigations: [...state.investigations, inv], links: [...state.links, ...links] };
      return { state: withAudit(next, { action: "investigasi.buat", objectType: "Investigasi", objectLabel: title, projectId: c.project.id }), investigationId: inv.id };
    }

    case "linkObject": {
      const c = ctx(state, action.investigationId, "investigation.link");
      if (typeof c === "string") return fail(c);
      if (state.links.some((l) => l.investigationId === c.inv.id && l.kind === action.kind && l.targetId === action.targetId)) return fail("Objek ini sudah tertaut");
      const version = resolveTarget(state, c.project.id, action.kind, action.targetId);
      if (version === null) return fail("Objek tidak ditemukan di proyek ini");
      const links = [...state.links];
      const link = addLink(links, c.inv.id, action.kind, action.targetId, version);
      const label = `${c.inv.title}: ${LINK_KIND_LABEL[action.kind]} ${targetTitle(state, c.project.id, action.kind, action.targetId)}`;
      return { state: withAudit({ ...state, links }, { action: "investigasi.tautkan", objectType: "Investigasi", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, linkId: link.id };
    }

    case "unlinkObject": {
      const link = state.links.find((l) => l.id === action.linkId);
      if (!link) return fail("Tautan tidak ditemukan");
      const c = ctx(state, link.investigationId, "investigation.link");
      if (typeof c === "string") return fail(c);
      if (state.decisions.some((d) => d.targetLinkId === link.id)) return fail("Tautan sudah punya keputusan dan tidak bisa dilepas");
      const label = `${c.inv.title}: ${LINK_KIND_LABEL[link.kind]} ${targetTitle(state, c.project.id, link.kind, link.targetId)}`;
      return { state: withAudit({ ...state, links: state.links.filter((l) => l !== link) }, { action: "investigasi.lepas", objectType: "Investigasi", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, linkId: link.id };
    }

    case "refreshLink": {
      const link = state.links.find((l) => l.id === action.linkId);
      if (!link) return fail("Tautan tidak ditemukan");
      const c = ctx(state, link.investigationId, "investigation.link");
      if (typeof c === "string") return fail(c);
      const { latest } = linkFreshness(state, link);
      const label = `${c.inv.title}: ${LINK_KIND_LABEL[link.kind]} ${targetTitle(state, c.project.id, link.kind, link.targetId)} ${link.linkedVersion} → ${latest}`;
      const next = { ...state, links: state.links.map((l) => (l === link ? { ...l, linkedVersion: latest } : l)) };
      return { state: withAudit(next, { action: "investigasi.perbarui_tautan", objectType: "Investigasi", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, linkId: link.id };
    }

    case "setInvestigationStatus": {
      const c = ctx(state, action.investigationId, "investigation.status");
      if (typeof c === "string") return fail(c);
      const blocked = canSetStatus(state, c.inv.id, action.to);
      if (blocked) return fail(blocked);
      const label = `${c.inv.title}: ${INVESTIGATION_STATUS_LABEL[c.inv.status]} → ${INVESTIGATION_STATUS_LABEL[action.to]}`;
      const next = { ...state, investigations: state.investigations.map((i) => (i === c.inv ? { ...i, status: action.to } : i)) };
      return { state: withAudit(next, { action: "investigasi.status", objectType: "Investigasi", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id };
    }

    case "addNote": {
      const c = ctx(state, action.investigationId, "note.add.field");
      if (typeof c === "string") return fail(c);
      const n = action.note;
      if (c.role !== "analis" && n.kind !== "wawancara" && n.kind !== "bukti") return fail("Peran Anda hanya boleh mencatat wawancara dan bukti");
      if (n.kind === "wawancara" && (!n.interviewee?.trim() || !n.interviewDate)) return fail("Narasumber dan tanggal wawancara wajib diisi");
      if (n.kind === "bukti" && n.attachment) {
        const e = attachmentError(n.attachment);
        if (e) return fail(e);
      }
      const added: InvestigationNote = {
        ...n, id: id("note"), investigationId: c.inv.id, createdBy: state.viewerId, createdAt: now(),
        ...(n.kind === "hipotesis" ? { hypothesisState: "belum_diuji" as const, supportingLinkIds: [] } : {}),
        ...(n.kind === "pertanyaan" ? { questionState: "terbuka" as const, assigneeId: n.assigneeId ?? state.viewerId } : {}),
      };
      return { state: withAudit({ ...state, notes: [...state.notes, added] }, { action: "investigasi.catat", objectType: "Investigasi", objectLabel: `${c.inv.title}: ${n.title}`, projectId: c.project.id }), investigationId: c.inv.id };
    }

    case "setHypothesisState": {
      const note = state.notes.find((n) => n.id === action.noteId);
      if (!note) return fail("Catatan tidak ditemukan");
      const c = ctx(state, note.investigationId, "note.add");
      if (typeof c === "string") return fail(c);
      if (note.kind !== "hipotesis") return fail("Catatan ini bukan hipotesis");
      const ids = [...new Set(action.supportingLinkIds)];
      if (ids.some((l) => !state.links.some((x) => x.id === l && x.investigationId === c.inv.id))) return fail("Tautan pendukung bukan milik workspace ini");
      if (action.state !== "belum_diuji" && ids.length === 0) return fail("Pilih minimal satu tautan pendukung");
      const next = { ...state, notes: state.notes.map((n) => (n === note ? { ...n, hypothesisState: action.state, supportingLinkIds: ids } : n)) };
      return { state: withAudit(next, { action: "investigasi.hipotesis", objectType: "Investigasi", objectLabel: `${c.inv.title}: ${note.title} → ${action.state}`, projectId: c.project.id }), investigationId: c.inv.id };
    }

    case "setQuestionState": {
      const note = state.notes.find((n) => n.id === action.noteId);
      if (!note) return fail("Catatan tidak ditemukan");
      const c = ctx(state, note.investigationId, "note.add.field");
      if (typeof c === "string") return fail(c);
      if (note.kind !== "pertanyaan") return fail("Catatan ini bukan pertanyaan");
      if (c.role !== "analis" && note.assigneeId !== state.viewerId) return fail("Hanya analis atau penanggung jawab yang dapat mengubah status pertanyaan");
      const next = { ...state, notes: state.notes.map((n) => (n === note ? { ...n, questionState: action.state } : n)) };
      return { state: withAudit(next, { action: "investigasi.pertanyaan", objectType: "Investigasi", objectLabel: `${c.inv.title}: ${note.title} → ${action.state}`, projectId: c.project.id }), investigationId: c.inv.id };
    }

    case "addComment": {
      const c = ctx(state, action.investigationId, "comment.add");
      if (typeof c === "string") return fail(c);
      const body = action.body.trim();
      if (!body) return fail("Isi komentar wajib diisi");
      if (action.parentId && !state.comments.some((x) => x.id === action.parentId && x.investigationId === c.inv.id)) return fail("Komentar induk tidak ditemukan di workspace ini");
      if (action.targetLinkId && !state.links.some((l) => l.id === action.targetLinkId && l.investigationId === c.inv.id)) return fail("Tautan tujuan bukan milik workspace ini");
      const memberIds = new Set(state.memberships.filter((m) => m.projectId === c.project.id).map((m) => m.userId));
      const mentions = extractMentions(body, state.users.filter((u) => memberIds.has(u.id)));
      const author = state.users.find((u) => u.id === state.viewerId)?.name ?? "Seseorang";
      const comment = {
        id: id("cm"), investigationId: c.inv.id, targetLinkId: action.targetLinkId ?? null, parentId: action.parentId ?? null,
        body, mentions, resolved: false, createdBy: state.viewerId, createdAt: now(),
      };
      const pings: Notification[] = mentions.filter((u) => u !== state.viewerId).map((userId) => ({
        id: id("ntf"), userId, projectId: c.project.id, text: `${author} menyebut Anda di ${c.inv.title}`,
        href: `/projects/${c.project.id}/investigations/${c.inv.id}`, read: false, at: now(),
      }));
      const next = { ...state, comments: [...state.comments, comment], notifications: [...state.notifications, ...pings] };
      return { state: withAudit(next, { action: "komentar.tambah", objectType: "Investigasi", objectLabel: c.inv.title, projectId: c.project.id }), investigationId: c.inv.id };
    }

    case "resolveComment": {
      const comment = state.comments.find((x) => x.id === action.commentId);
      if (!comment) return fail("Komentar tidak ditemukan");
      const c = ctx(state, comment.investigationId, "comment.add");
      if (typeof c === "string") return fail(c);
      if (comment.parentId) return fail("Hanya komentar utama yang dapat diselesaikan");
      if (c.role !== "analis" && comment.createdBy !== state.viewerId) return fail("Hanya penulis atau analis yang dapat menyelesaikan komentar");
      const next = { ...state, comments: state.comments.map((x) => (x === comment ? { ...x, resolved: action.resolved } : x)) };
      return { state: withAudit(next, { action: "komentar.selesai", objectType: "Investigasi", objectLabel: c.inv.title, projectId: c.project.id }), investigationId: c.inv.id };
    }

    case "markNotificationsRead":
      return { state: { ...state, notifications: state.notifications.map((n) => (n.userId === state.viewerId && !n.read ? { ...n, read: true } : n)) } };

    case "reviewJev": {
      const c = ctx(state, action.investigationId, "review.jev");
      if (typeof c === "string") return fail(c);
      const link = state.links.find((l) => l.id === action.linkId && l.investigationId === c.inv.id);
      if (!link || link.kind !== "hasil_jev") return fail("Tautan bukan hasil Jev di workspace ini");
      const correctedVerdict = action.correctedVerdict?.trim();
      const reason = action.reason?.trim() ?? "";
      if (action.outcome === "dikoreksi" && (!correctedVerdict || !reason)) return fail("Putusan koreksi dan alasan wajib diisi");
      const review: ModelReview = {
        id: id("rv"), investigationId: c.inv.id, linkId: link.id, outcome: action.outcome, reason, forEvalSet: action.forEvalSet,
        ...(action.outcome === "dikoreksi" ? { correctedVerdict } : {}), by: state.viewerId, at: now(),
      };
      const label = `${c.inv.title}: ${targetTitle(state, c.project.id, link.kind, link.targetId)}`;
      return { state: withAudit({ ...state, reviews: [...state.reviews, review] }, { action: action.outcome === "dikonfirmasi" ? "jev.konfirmasi" : "jev.koreksi", objectType: "Investigasi", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, linkId: link.id };
    }

    case "reviewDraft": {
      const c = ctx(state, action.investigationId, "review.draft");
      if (typeof c === "string") return fail(c);
      const link = state.links.find((l) => l.id === action.linkId && l.investigationId === c.inv.id);
      if (!link || link.kind !== "interpretasi") return fail("Tautan bukan draf interpretasi di workspace ini");
      const interp = state.interpretations.find((i) => i.id === link.targetId);
      if (!interp) return fail("Draf interpretasi tidak ditemukan");
      const reason = action.reason?.trim() ?? "";
      if (action.outcome === "disetujui" && interp.status !== "lolos_pemeriksaan") return fail("Draf yang gagal pemeriksaan tidak dapat disetujui");
      if (action.outcome === "ditolak" && (!action.rejectCode || !Object.hasOwn(REJECT_LABEL, action.rejectCode) || !reason)) return fail("Kode penolakan dan alasan wajib diisi");
      const review: ModelReview = {
        id: id("rv"), investigationId: c.inv.id, linkId: link.id, outcome: action.outcome, reason, forEvalSet: action.forEvalSet,
        ...(action.outcome === "ditolak" ? { rejectCode: action.rejectCode } : {}), by: state.viewerId, at: now(),
      };
      const label = `${c.inv.title}: ${targetTitle(state, c.project.id, link.kind, link.targetId)}`;
      return { state: withAudit({ ...state, reviews: [...state.reviews, review] }, { action: action.outcome === "disetujui" ? "draf.setujui" : "draf.tolak", objectType: "Investigasi", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, linkId: link.id };
    }

    case "makeDecision": {
      // Izin per status lewat canDecide; "investigation.view" hanya memastikan keanggotaan dan proyek aktif.
      const c = ctx(state, action.investigationId, "investigation.view");
      if (typeof c === "string") return fail(c);
      if (!canDecide(c.role, action.status)) return fail("Peran Anda tidak diizinkan menetapkan status ini");
      const invalid = validateDecision(state, action);
      if (invalid) return fail(invalid);
      const history = decisionHistory(state, c.inv.id, action.targetLinkId);
      if ((history[0]?.version ?? 0) !== action.expectedVersion) return fail("Keputusan sudah berubah, muat ulang");
      const decision: Decision = {
        id: id("dc"), investigationId: c.inv.id, projectId: c.project.id, targetLinkId: action.targetLinkId,
        version: action.expectedVersion + 1, status: action.status,
        ...(action.status === "digantikan" ? { replacedByLinkId: action.replacedByLinkId } : {}),
        reason: action.reason.trim(), byId: state.viewerId, byRole: c.role!, at: now(),
        snapshot: snapshotFor(state, c.project.id, approvedNarrative(state, c.inv.id)),
      };
      const target = state.links.find((l) => l.id === action.targetLinkId)!;
      const label = `${c.inv.title}: ${targetTitle(state, c.project.id, target.kind, target.targetId)} → ${DECISION_LABEL[action.status]} (${c.role})`;
      const next = { ...state, decisions: [...state.decisions, decision], flags: clearFlags(state, new Set(history.map((d) => d.id))) };
      return { state: withAudit(next, { action: "keputusan.tetapkan", objectType: "Keputusan", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, decisionId: decision.id };
    }

    case "confirmDecision": {
      const d = state.decisions.find((x) => x.id === action.decisionId);
      if (!d) return fail("Keputusan tidak ditemukan");
      const c = ctx(state, d.investigationId, "investigation.view");
      if (typeof c === "string") return fail(c);
      if (c.role !== "analis" && c.role !== "pemilik_proses") return fail("Peran Anda tidak diizinkan untuk aksi ini");
      // Penanda hanya ada pada versi terbaru (keputusan baru selalu menutupnya).
      if (!state.flags.some((f) => f.decisionId === d.id && !f.clearedAt)) return fail("Keputusan ini tidak perlu ditinjau ulang");
      const confirmed: Decision = {
        ...d, id: id("dc"), version: d.version + 1, reason: "Ditegaskan setelah analisis baru",
        byId: state.viewerId, byRole: c.role, at: now(), snapshot: snapshotFor(state, c.project.id, approvedNarrative(state, c.inv.id)),
      };
      const target = state.links.find((l) => l.id === d.targetLinkId);
      const label = `${c.inv.title}: ${target ? targetTitle(state, c.project.id, target.kind, target.targetId) : d.targetLinkId} ${DECISION_LABEL[d.status]} (${c.role})`;
      const next = { ...state, decisions: [...state.decisions, confirmed], flags: clearFlags(state, new Set([d.id])) };
      return { state: withAudit(next, { action: "keputusan.tegaskan", objectType: "Keputusan", objectLabel: label, projectId: c.project.id }), investigationId: c.inv.id, decisionId: confirmed.id };
    }

    case "simulateNewAnalysis": {
      const c = projectCtx(state, action.projectId, "investigation.status");
      if (typeof c === "string") return fail(c);
      const prev = state.analysisStates.find((a) => a.projectId === c.project.id);
      if (!prev) return fail("Proyek ini belum punya analisis");
      const current = nextAnalysisState(prev);
      const active = new Set(state.flags.filter((f) => !f.clearedAt).map((f) => f.decisionId));
      const flags: RevalidationFlag[] = [];
      const pings: Notification[] = [];
      // Workspace `selesai` adalah arsip; keputusannya tidak ditandai ulang.
      for (const inv of state.investigations.filter((i) => i.projectId === c.project.id && i.status !== "selesai")) {
        const added = latestDecisions(state, inv.id)
          .filter((d) => !active.has(d.id))
          .map((d) => ({ id: id("flag"), decisionId: d.id, summary: detectRevalidation(d, current), at: now() }))
          .filter((f) => f.summary.length > 0);
        if (!added.length) continue;
        flags.push(...added);
        pings.push(...inv.memberIds.filter((u) => u !== state.viewerId).map((userId) => ({
          id: id("ntf"), userId, projectId: c.project.id, text: `Analisis baru: ${added.length} keputusan di ${inv.title} perlu ditinjau ulang`,
          href: `/projects/${c.project.id}/investigations/${inv.id}`, read: false, at: now(),
        })));
      }
      const next = {
        ...state, analysisStates: state.analysisStates.map((a) => (a === prev ? current : a)),
        flags: [...state.flags, ...flags], notifications: [...state.notifications, ...pings],
      };
      const label = `Dataset ${prev.datasetVersion} → ${current.datasetVersion}, ${flags.length} keputusan ditandai`;
      return { state: withAudit(next, { action: "analisis.simulasi", objectType: "Analisis", objectLabel: label, projectId: c.project.id }) };
    }

    // Diganti Task 9; jangan sampai tertelan diam-diam.
    case "createProposal":
      return fail("Belum didukung");

    default:
      return null;
  }
}
