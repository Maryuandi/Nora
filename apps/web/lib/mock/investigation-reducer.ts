// Reducer M11. Dipanggil lebih dulu oleh `reduce`; `null` berarti aksi bukan milik M11.
import { INVESTIGATION_STATUS_LABEL, LINK_KIND_LABEL, canSetStatus, linkFreshness } from "./investigation";
import { id, now, withAudit } from "./mutate";
import { acceptsData, can, type UiAction } from "./permissions";
import type { MockAction, ReduceResult } from "./reducer";
import type {
  DecisionStatus, HypothesisState, Investigation, InvestigationLink, InvestigationNote, InvestigationStatus, LinkKind,
  MockState, Project, RejectReason, Role,
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

    // Diganti Task 5-9; jangan sampai tertelan diam-diam.
    case "addNote": case "setHypothesisState": case "setQuestionState": case "addComment": case "resolveComment":
    case "markNotificationsRead": case "reviewJev": case "reviewDraft": case "makeDecision": case "confirmDecision":
    case "simulateNewAnalysis": case "createProposal":
      return fail("Belum didukung");

    default:
      return null;
  }
}
