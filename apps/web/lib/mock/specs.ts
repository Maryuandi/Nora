import type { MockState, QuestionSpec, TaskKind, Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = { sufficient: 0.5, topProb: 0.6, margin: 0.15 };

export const slugify = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const specVersions = (s: MockState, projectId: string, task: TaskKind): QuestionSpec[] =>
  s.specs.filter((x) => x.projectId === projectId && x.task === task).sort((a, b) => b.version - a.version);

export const activeSpec = (s: MockState, projectId: string, task: TaskKind): QuestionSpec | undefined => specVersions(s, projectId, task)[0];

export const isStale = (specVersion: number, s: MockState, projectId: string, task: TaskKind): boolean =>
  specVersion < (activeSpec(s, projectId, task)?.version ?? 0);

/** A row keeps its caller-supplied key only when it is one of the previous version's keys; otherwise the key is the label slug. */
export const resolveKey = (c: { label: string; key?: string }, prevKeys: string[]): string => (c.key && prevKeys.includes(c.key) ? c.key : slugify(c.label));

export function validateSpecInput(task: TaskKind, input: { question: string; categories: { label: string; definition: string; key?: string }[]; thresholds: Thresholds }, prevKeys: string[] = []): string | null {
  const q = input.question.trim();
  if (!q) return "Pertanyaan wajib diisi";
  if (q.length > 300) return "Pertanyaan maksimal 300 karakter";
  if (task === "relevansi") return null; // categories are fixed
  if (input.categories.length < 2) return "Minimal 2 kategori";
  const keys = new Set<string>();
  for (const c of input.categories) {
    if (!slugify(c.label)) return "Label kategori wajib diisi";
    const key = resolveKey(c, prevKeys);
    if (keys.has(key)) return "Label kategori duplikat";
    keys.add(key);
    if (c.definition.trim().length > 200) return "Definisi maksimal 200 karakter";
  }
  return null;
}
