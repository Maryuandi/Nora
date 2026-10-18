import { currentClassResults, runClassFixture, topTwoOf } from "./classification";
import { buildEvaluation } from "./evaluation";
import { acceptsData, can, type UiAction } from "./permissions";
import type { ReduceResult } from "./reducer";
import { classCorrectionSchema, thresholdsSchema } from "./schemas";
import { activeSpec, resolveKey, validateSpecInput } from "./specs";
import type { AuditEvent, ClassCorrection, GoldItem, MockState, QuestionSpec, Relevance, TaskKind, Thresholds } from "./types";

export type ClassificationAction =
  | { type: "runClassification"; projectId: string; task: "aktivitas" | "catatan"; scope: "belum_dinilai" | "semua" }
  | { type: "correctClass"; resultId: string; category: string; reason: string; addToGoldSet: boolean }
  | { type: "confirmClass"; resultId: string }
  | { type: "setGoldLabel"; projectId: string; task: TaskKind; itemRef: string; label: string }
  | { type: "removeGoldItem"; goldId: string }
  | { type: "runEvaluation"; projectId: string; task: TaskKind }
  | { type: "saveSpec"; projectId: string; task: TaskKind; question: string; categories: { label: string; definition: string; key?: string }[]; thresholds: Thresholds; note?: string };

export type ClassificationCtx = {
  now: string;
  newId: (prefix: string) => string;
  audit: (s: MockState, e: Omit<AuditEvent, "id" | "at" | "actorId" | "result">) => MockState;
};

const NO_ACCESS = "Anda tidak berwenang melakukan aksi ini";
const RELEVANCE: Relevance[] = ["relevan", "sebagian_relevan", "tidak_relevan", "informasi_tidak_cukup"];

// Shared gold-set rule: no item -> create (viewer is labeler); viewer is labeler -> edit label; another analyst -> second label.
export function upsertGold(
  state: MockState,
  args: { projectId: string; task: TaskKind; itemRef: string; label: string },
  ctx: { now: string },
): { state: MockState; goldId: string; changed: boolean } {
  const { projectId, task, itemRef, label } = args;
  const existing = state.goldItems.find((g) => g.projectId === projectId && g.task === task && g.itemRef === itemRef);
  if (!existing) {
    const item: GoldItem = { id: `g-${task}-${itemRef.replace(":", "-")}`, projectId, task, itemRef, label, labeler: state.viewerId, createdAt: ctx.now };
    return { state: { ...state, goldItems: [...state.goldItems, item] }, goldId: item.id, changed: true };
  }
  const mine = existing.labeler === state.viewerId;
  if (mine ? existing.label === label : existing.labelB === label && existing.labelerB === state.viewerId) return { state, goldId: existing.id, changed: false };
  const updated: GoldItem = mine ? { ...existing, label } : { ...existing, labelB: label, labelerB: state.viewerId };
  return { state: { ...state, goldItems: state.goldItems.map((g) => (g === existing ? updated : g)) }, goldId: existing.id, changed: true };
}

export function reduceClassification(state: MockState, action: ClassificationAction, ctx: ClassificationCtx): ReduceResult {
  const fail = (error: string) => ({ state, error });
  // Order: entity lookup, role, project status, superseded check (callers), validation.
  const guard = (projectId: string, ui: UiAction) => {
    const role = state.memberships.find((m) => m.projectId === projectId && m.userId === state.viewerId)?.role ?? null;
    if (!can(role, ui)) return NO_ACCESS;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || !acceptsData(project.status)) return "Proyek ini tidak menerima data baru";
    return null;
  };
  const projectOf = (id: string) => state.projects.find((p) => p.id === id);

  switch (action.type) {
    case "runClassification": {
      if (!projectOf(action.projectId)) return fail("Proyek tidak ditemukan");
      const denied = guard(action.projectId, "classify.run");
      if (denied) return fail(denied);
      const spec = activeSpec(state, action.projectId, action.task);
      if (!spec) return fail("Spesifikasi tidak ditemukan");
      const current = currentClassResults(state, action.projectId, action.task);
      const scored = new Set(current.map((r) => r.itemId));
      const items = state.classItems.filter((i) => i.projectId === action.projectId && i.task === action.task && (action.scope === "semua" || !scored.has(i.id)));
      if (items.length === 0) return fail("Semua item sudah dinilai");
      const created = runClassFixture(items, spec, { runId: ctx.newId("run"), at: ctx.now });
      const replaced = new Map(created.map((n) => [n.itemId, n.id]));
      const classResults = [...state.classResults.map((r) => (action.scope === "semua" && !r.supersededBy && r.projectId === action.projectId && r.task === action.task && replaced.has(r.itemId) ? { ...r, supersededBy: replaced.get(r.itemId) } : r)), ...created];
      return { state: ctx.audit({ ...state, classResults }, { action: "klasifikasi.jalankan", objectType: "Klasifikasi", objectLabel: action.task, projectId: action.projectId }) };
    }

    case "correctClass":
    case "confirmClass": {
      const r = state.classResults.find((x) => x.id === action.resultId);
      if (!r) return fail("Hasil klasifikasi tidak ditemukan");
      const denied = guard(r.projectId, "classify.correct");
      if (denied) return fail(denied);
      if (r.supersededBy) return fail("Hasil ini sudah digantikan penilaian baru");
      const item = state.classItems.find((i) => i.id === r.itemId);
      let fields: Pick<ClassCorrection, "category" | "reason" | "confirmedOnly">;
      let next = state;
      if (action.type === "correctClass") {
        const parsed = classCorrectionSchema.safeParse({ category: action.category, reason: action.reason, addToGoldSet: action.addToGoldSet });
        if (!parsed.success) return fail(parsed.error.issues[0].message);
        if (!activeSpec(state, r.projectId, r.task)?.categories.some((c) => c.key === parsed.data.category)) return fail("Kategori tidak ada di spesifikasi");
        fields = { category: parsed.data.category, reason: parsed.data.reason.trim(), confirmedOnly: false };
        if (parsed.data.addToGoldSet) next = upsertGold(state, { projectId: r.projectId, task: r.task, itemRef: r.itemId, label: fields.category }, ctx).state;
      } else {
        if (r.status !== "otomatis" && r.status !== "perlu_review") return fail("Hanya hasil otomatis atau perlu review yang dapat dikonfirmasi");
        fields = { category: topTwoOf(r.probs, Object.keys(r.probs)).top[0], reason: "Dikonfirmasi analis", confirmedOnly: true };
      }
      const correction: ClassCorrection = { id: ctx.newId("kc"), resultId: r.id, actorId: state.viewerId, at: ctx.now, ...fields };
      return {
        state: ctx.audit({ ...next, classCorrections: [...next.classCorrections, correction] }, {
          action: action.type === "correctClass" ? "klasifikasi.koreksi" : "klasifikasi.konfirmasi", objectType: "Klasifikasi", objectLabel: item?.text ?? r.itemId, projectId: r.projectId,
        }),
        resultId: r.id,
      };
    }

    case "setGoldLabel": {
      const { projectId, task, itemRef, label } = action;
      if (!projectOf(projectId)) return fail("Proyek tidak ditemukan");
      const [findingId, candidateId] = itemRef.split(":");
      const exists = task === "relevansi"
        ? state.assessFindings.some((f) => f.id === findingId && f.projectId === projectId && f.candidateIds.includes(candidateId))
        : state.classItems.some((i) => i.id === itemRef && i.projectId === projectId && i.task === task);
      if (!exists) return fail("Item tidak ditemukan");
      const denied = guard(projectId, "gold.edit");
      if (denied) return fail(denied);
      const options = task === "relevansi" ? RELEVANCE : (activeSpec(state, projectId, task)?.categories.map((c) => c.key) ?? []);
      if (!options.includes(label as Relevance)) return fail("Label tidak valid");
      const res = upsertGold(state, { projectId, task, itemRef, label }, ctx);
      if (!res.changed) return fail("Tidak ada perubahan");
      return { state: ctx.audit(res.state, { action: "acuan.simpan", objectType: "Set acuan", objectLabel: itemRef, projectId }), goldId: res.goldId };
    }

    case "removeGoldItem": {
      const g = state.goldItems.find((x) => x.id === action.goldId);
      if (!g) return fail("Item acuan tidak ditemukan");
      const denied = guard(g.projectId, "gold.edit");
      if (denied) return fail(denied);
      return { state: ctx.audit({ ...state, goldItems: state.goldItems.filter((x) => x !== g) }, { action: "acuan.hapus", objectType: "Set acuan", objectLabel: g.itemRef, projectId: g.projectId }), goldId: g.id };
    }

    case "runEvaluation": {
      if (!projectOf(action.projectId)) return fail("Proyek tidak ditemukan");
      const denied = guard(action.projectId, "evaluation.run");
      if (denied) return fail(denied);
      const run = buildEvaluation(state, action.projectId, action.task, { id: ctx.newId("ev"), at: ctx.now, actorId: state.viewerId });
      if (!run) return fail("Spesifikasi tidak ditemukan");
      return { state: ctx.audit({ ...state, evaluations: [...state.evaluations, run] }, { action: "evaluasi.jalankan", objectType: "Evaluasi", objectLabel: action.task, projectId: action.projectId }), evaluationId: run.id };
    }

    case "saveSpec": {
      if (!projectOf(action.projectId)) return fail("Proyek tidak ditemukan");
      const active = activeSpec(state, action.projectId, action.task);
      if (!active) return fail("Spesifikasi tidak ditemukan");
      const denied = guard(action.projectId, "spec.edit");
      if (denied) return fail(denied);
      const invalid = validateSpecInput(action.task, action, active.categories.map((c) => c.key));
      if (action.note && action.note.trim().length > 500) return fail("Catatan maksimal 500 karakter");
      if (invalid) return fail(invalid);
      const th = thresholdsSchema.safeParse(action.thresholds);
      if (!th.success) return fail(th.error.issues[0].message);
      // Existing rows keep their key (passed back by the caller); new rows get the label slug.
      const prevKeys = active.categories.map((c) => c.key);
      const categories = action.task === "relevansi" ? [] : action.categories.map((c) => ({ key: resolveKey(c, prevKeys), label: c.label.trim(), definition: c.definition.trim() }));
      const question = action.question.trim();
      if (question === active.question && JSON.stringify(categories) === JSON.stringify(active.categories) && (["sufficient", "topProb", "margin"] as const).every((k) => th.data[k] === active.thresholds[k])) return fail("Tidak ada perubahan");
      const note = action.note?.trim();
      const spec: QuestionSpec = {
        id: `sp-${action.task}-${active.version + 1}`, projectId: action.projectId, task: action.task, version: active.version + 1,
        question, categories, thresholds: th.data, ...(note ? { note } : {}), createdBy: state.viewerId, createdAt: ctx.now,
      };
      return { state: ctx.audit({ ...state, specs: [...state.specs, spec] }, { action: "spesifikasi.simpan", objectType: "Spesifikasi", objectLabel: `${action.task} v${spec.version}`, projectId: action.projectId }), specId: spec.id };
    }
  }
}
