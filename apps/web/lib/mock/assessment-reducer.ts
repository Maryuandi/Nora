import { runFixture, topTwo } from "./assessment";
import { upsertGold } from "./classification-reducer";
import { acceptsData } from "./permissions";
import { correctionSchema } from "./schemas";
import type { ReduceResult } from "./reducer";
import type { Assessment, AssessmentCorrection, AuditEvent, MockState, Relevance } from "./types";

export type AssessmentAction =
  | { type: "runAssessment"; projectId: string; findingId: string; scope: "belum_dinilai" | "semua" }
  | { type: "correctAssessment"; assessmentId: string; relevance: Relevance; reason: string; addToGoldSet: boolean }
  | { type: "confirmAssessment"; assessmentId: string };

export type AssessmentCtx = {
  now: string;
  newId: (prefix: string) => string;
  audit: (s: MockState, e: Omit<AuditEvent, "id" | "at" | "actorId" | "result">) => MockState;
};

const NO_ACCESS = "Anda tidak berwenang melakukan aksi ini";

export function reduceAssessment(state: MockState, action: AssessmentAction, ctx: AssessmentCtx): ReduceResult {
  const fail = (error: string) => ({ state, error });
  // Order: entity lookup, role, project status, superseded check (callers), validation.
  const guard = (projectId: string) => {
    const role = state.memberships.find((m) => m.projectId === projectId && m.userId === state.viewerId)?.role;
    if (role !== "analis") return NO_ACCESS;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || !acceptsData(project.status)) return "Proyek ini tidak menerima data baru";
    return null;
  };

  if (action.type === "runAssessment") {
    const finding = state.findings.find((f) => f.id === action.findingId && f.projectId === action.projectId);
    if (!finding) return fail("Temuan tidak ditemukan");
    const denied = guard(finding.projectId);
    if (denied) return fail(denied);
    const current = state.assessments.filter((a) => a.findingId === finding.id && !a.supersededBy);
    const scored = new Set(current.map((a) => a.candidateId));
    const only = action.scope === "semua" ? undefined : state.candidates.filter((c) => finding.candidateIds.includes(c.id) && !scored.has(c.id)).map((c) => c.id);
    const created = runFixture(finding, state.candidates, { runId: ctx.newId("run"), at: ctx.now, only });
    if (created.length === 0) return fail("Semua kandidat sudah dinilai");
    const replaced = new Map<string, string>();
    if (action.scope === "semua") for (const n of created) for (const a of current) if (a.candidateId === n.candidateId) replaced.set(a.id, n.id);
    const assessments: Assessment[] = [...state.assessments.map((a) => (replaced.has(a.id) ? { ...a, supersededBy: replaced.get(a.id) } : a)), ...created];
    const next = ctx.audit({ ...state, assessments }, { action: "penilaian.jalankan", objectType: "Penilaian", objectLabel: finding.title, projectId: finding.projectId });
    return { state: next };
  }

  const a = state.assessments.find((x) => x.id === action.assessmentId);
  if (!a) return fail("Hasil penilaian tidak ditemukan");
  const denied = guard(a.projectId);
  if (denied) return fail(denied);
  if (a.supersededBy) return fail("Hasil ini sudah digantikan penilaian baru");
  const label = state.candidates.find((c) => c.id === a.candidateId)?.name ?? a.candidateId;

  let fields: Pick<AssessmentCorrection, "relevance" | "reason" | "addToGoldSet" | "confirmedOnly">;
  if (action.type === "correctAssessment") {
    const parsed = correctionSchema.safeParse({ relevance: action.relevance, reason: action.reason, addToGoldSet: action.addToGoldSet });
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    fields = { relevance: parsed.data.relevance, reason: parsed.data.reason.trim(), addToGoldSet: parsed.data.addToGoldSet, confirmedOnly: false };
  } else {
    if (a.status !== "otomatis" && a.status !== "perlu_review") return fail("Hanya hasil otomatis atau perlu review yang dapat dikonfirmasi");
    fields = { relevance: topTwo(a.relevance.probs).top[0], reason: "Dikonfirmasi analis", addToGoldSet: false, confirmedOnly: true };
  }
  const correction: AssessmentCorrection = { id: ctx.newId("k"), assessmentId: a.id, actorId: state.viewerId, at: ctx.now, ...fields };
  const base = fields.addToGoldSet
    ? upsertGold(state, { projectId: a.projectId, task: "relevansi", itemRef: `${a.findingId}:${a.candidateId}`, label: fields.relevance }, ctx).state
    : state;
  const next = ctx.audit({ ...base, corrections: [...base.corrections, correction] }, {
    action: action.type === "correctAssessment" ? "penilaian.koreksi" : "penilaian.konfirmasi", objectType: "Penilaian", objectLabel: label, projectId: a.projectId,
  });
  return { state: next, assessmentId: a.id, correctionId: correction.id };
}
