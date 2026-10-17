import { id, now, withAudit } from "./audit";
import { CONTEXT_PACK, DATASET_VERSION, ACTIVITIES, KATEGORI, TRANSITIONS, UNITS, buildCases } from "./rec-cases";
import { DEFAULT_WEIGHTS, buildBaseline, priorityBreakdown, rankCandidates, validateCandidate, validateWeights, type Evaluated } from "./recommend";
import { can, acceptsData } from "./permissions";
import { describeSpec, runScenario } from "./scenario";
import type { MockState, PriorityPolicy, PriorityWeights, RecCandidate, RecFinding, Role, ScenarioSpec, TrialProposal } from "./types";

export type NewCandidateInput = {
  kind: RecCandidate["kind"]; name: string; description: string; addresses: string; successMetric: string;
  proposeToCatalog: boolean; effort: number | null; risk: number | null;
};
export type TrialPatch = Partial<Pick<TrialProposal, "scope" | "durationWeeks" | "target" | "guardrails" | "owner" | "risks" | "stopConditions">>;
export type RecAction =
  | { type: "rec/addCandidate"; projectId: string; findingId: string; input: NewCandidateInput }
  | { type: "rec/savePolicy"; projectId: string; weights: PriorityWeights; note: string }
  | { type: "rec/runScenario"; projectId: string; name: string; spec: ScenarioSpec }
  | { type: "rec/createTrial"; projectId: string; findingId: string; candidateId: string }
  | { type: "rec/updateTrial"; trialId: string; patch: TrialPatch };

export type RecResult = { state: MockState; error?: string; candidateId?: string; scenarioId?: string; trialId?: string };

export const findingsForProject = (s: MockState, projectId: string): RecFinding[] => s.recFindings.filter((f) => f.projectId === projectId);
export const candidatesForFinding = (s: MockState, findingId: string): RecCandidate[] => s.recCandidates.filter((c) => c.findingIds.includes(findingId));
export const latestPolicy = (s: MockState, projectId: string): PriorityPolicy =>
  s.priorityPolicies.filter((p) => p.projectId === projectId).sort((a, b) => b.version - a.version)[0]
  ?? { projectId, version: 0, weights: { ...DEFAULT_WEIGHTS }, changedBy: "", changedAt: "", note: "Bobot bawaan" };

export function evaluateFinding(s: MockState, findingId: string, weights?: PriorityWeights) {
  const finding = s.recFindings.find((f) => f.id === findingId);
  if (!finding) return null;
  const policy = latestPolicy(s, finding.projectId);
  const memberRoles = s.memberships.filter((m) => m.projectId === finding.projectId).map((m) => m.role);
  const items: Evaluated[] = candidatesForFinding(s, findingId).map((c) => ({
    c, v: validateCandidate(c, finding, { memberRoles }), b: priorityBreakdown(c, finding, weights ?? policy.weights),
  }));
  return { finding, policy, ...rankCandidates(items) };
}

const viewerRoleIn = (s: MockState, projectId: string): Role | null => s.memberships.find((m) => m.projectId === projectId && m.userId === s.viewerId)?.role ?? null;
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
const trim = (v: string) => v.trim();

export function reduceRec(state: MockState, action: RecAction): RecResult {
  const fail = (error: string) => ({ state, error });
  const projectId = action.type === "rec/updateTrial" ? state.trials.find((t) => t.id === action.trialId)?.projectId : action.projectId;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return fail(action.type === "rec/updateTrial" ? "Usulan uji coba tidak ditemukan" : "Proyek tidak ditemukan");
  if (!can(viewerRoleIn(state, project.id), "rec.edit")) return fail("Hanya Analis yang dapat mengubah rekomendasi");
  if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");

  switch (action.type) {
    case "rec/addCandidate": {
      const finding = state.recFindings.find((f) => f.id === action.findingId && f.projectId === project.id);
      if (!finding) return fail("Temuan tidak ditemukan");
      const i = action.input;
      if (![i.name, i.description, i.addresses, i.successMetric].every((v) => trim(v))) return fail("Nama, deskripsi, hipotesis yang ditangani, dan metrik keberhasilan wajib diisi");
      for (const v of [i.effort, i.risk]) if (v !== null && !(Number.isInteger(v) && inRange(v, 1, 5))) return fail("Usaha dan risiko harus bilangan bulat 1 sampai 5, atau dikosongkan");
      const c: RecCandidate = {
        id: id("k"), kind: i.kind, origin: "analis", proposeToCatalog: i.proposeToCatalog, name: trim(i.name), description: trim(i.description),
        addresses: trim(i.addresses), successMetric: trim(i.successMetric), findingIds: [finding.id], conditions: [], refMetrics: [], refs: [],
        ownerRole: null, effort: i.effort, risk: i.risk, prerequisites: [], exclusions: [], jev: {},
      };
      return { state: withAudit({ ...state, recCandidates: [...state.recCandidates, c] }, { action: "kandidat.tambah", objectType: "Kandidat", objectLabel: c.name, projectId: project.id }), candidateId: c.id };
    }

    case "rec/savePolicy": {
      const check = validateWeights(action.weights);
      if (!check.ok) return fail(check.message!);
      const latest = latestPolicy(state, project.id);
      if ((Object.keys(action.weights) as (keyof PriorityWeights)[]).every((k) => action.weights[k] === latest.weights[k])) return fail("Tidak ada perubahan");
      const policy: PriorityPolicy = { projectId: project.id, version: latest.version + 1, weights: { ...action.weights }, changedBy: state.viewerId, changedAt: now(), note: trim(action.note) };
      return { state: withAudit({ ...state, priorityPolicies: [...state.priorityPolicies, policy] }, { action: "kebijakan.ubah", objectType: "Kebijakan prioritas", objectLabel: `v${policy.version}`, projectId: project.id }) };
    }

    case "rec/runScenario": {
      const s = action.spec;
      const bad =
        s.kind === "kurangi_jeda" ? !TRANSITIONS.includes(s.transition) || !inRange(s.pct, 1, 100)
        : s.kind === "batasi_jeda" ? !TRANSITIONS.includes(s.transition) || !inRange(s.maxDays, 0, 365)
        : s.kind === "hapus_rework" ? !ACTIVITIES.includes(s.activity) || !inRange(s.pct, 1, 100)
        : !ACTIVITIES.includes(s.activity) || (s.filter !== null && !(s.filter.attribute === "unit" ? UNITS : KATEGORI).includes(s.filter.value));
      if (bad) return fail("Parameter skenario tidak valid");
      const name = trim(action.name) || describeSpec(s);
      const scenario = {
        id: id("sc"), projectId: project.id, name, spec: s, datasetVersion: DATASET_VERSION, contextPack: CONTEXT_PACK,
        status: "estimasi" as const, result: runScenario(s, buildCases()), createdBy: state.viewerId, createdAt: now(),
      };
      return { state: withAudit({ ...state, scenarios: [...state.scenarios, scenario] }, { action: "skenario.jalankan", objectType: "Skenario", objectLabel: name, projectId: project.id }), scenarioId: scenario.id };
    }

    case "rec/createTrial": {
      const ev = evaluateFinding(state, action.findingId);
      if (!ev || ev.finding.projectId !== project.id) return fail("Temuan tidak ditemukan");
      const item = [...ev.ranked, ...ev.unranked].find((e) => e.c.id === action.candidateId);
      if (!item) return fail("Kandidat tidak ditemukan pada temuan ini");
      if (item.v.status !== "tervalidasi") return fail("Hanya kandidat tervalidasi yang dapat dijadikan usulan uji coba");
      if (state.trials.some((t) => t.findingId === action.findingId && t.candidateId === action.candidateId)) return fail("Usulan uji coba untuk kandidat ini sudah ada");
      const trial: TrialProposal = {
        id: id("t"), projectId: project.id, findingId: action.findingId, candidateId: item.c.id, status: "draf",
        action: item.c.name, scope: "", durationWeeks: null, successMetric: item.c.successMetric, baseline: buildBaseline(item.c, ev.finding),
        target: "", guardrails: [], owner: "", risks: [], stopConditions: [],
        createdBy: state.viewerId, createdAt: now(), updatedAt: now(),
      };
      return { state: withAudit({ ...state, trials: [...state.trials, trial] }, { action: "ujicoba.buat", objectType: "Usulan uji coba", objectLabel: trial.action, projectId: project.id }), trialId: trial.id };
    }

    case "rec/updateTrial": {
      const trial = state.trials.find((t) => t.id === action.trialId)!;
      const p = action.patch;
      if (p.durationWeeks != null && !(Number.isInteger(p.durationWeeks) && p.durationWeeks > 0)) return fail("Durasi harus bilangan bulat lebih dari 0 minggu");
      const allowed: (keyof TrialPatch)[] = ["scope", "durationWeeks", "target", "guardrails", "owner", "risks", "stopConditions"];
      const clean = Object.fromEntries(allowed.filter((k) => k in p).map((k) => [k, p[k]]));
      const updated = { ...trial, ...clean, updatedAt: now() };
      return { state: withAudit({ ...state, trials: state.trials.map((t) => (t === trial ? updated : t)) }, { action: "ujicoba.ubah", objectType: "Usulan uji coba", objectLabel: trial.action, projectId: project.id }), trialId: trial.id };
    }
  }
}
