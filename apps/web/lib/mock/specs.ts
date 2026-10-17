import type { MockState, QuestionSpec, TaskKind, Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = { sufficient: 0.5, topProb: 0.6, margin: 0.15 };

export const slugify = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const specVersions = (s: MockState, projectId: string, task: TaskKind): QuestionSpec[] =>
  s.specs.filter((x) => x.projectId === projectId && x.task === task).sort((a, b) => b.version - a.version);

export const activeSpec = (s: MockState, projectId: string, task: TaskKind): QuestionSpec | undefined => specVersions(s, projectId, task)[0];

export const isStale = (specVersion: number, s: MockState, projectId: string, task: TaskKind): boolean =>
  specVersion < (activeSpec(s, projectId, task)?.version ?? 0);

export function validateSpecInput(task: TaskKind, input: { question: string; categories: { label: string; definition: string }[]; thresholds: Thresholds }): string | null {
  const q = input.question.trim();
  if (!q) return "Pertanyaan wajib diisi";
  if (q.length > 300) return "Pertanyaan maksimal 300 karakter";
  if (task === "relevansi") return null; // categories are fixed
  if (input.categories.length < 2) return "Minimal 2 kategori";
  const keys = new Set<string>();
  for (const c of input.categories) {
    const key = slugify(c.label);
    if (!key) return "Label kategori wajib diisi";
    if (keys.has(key)) return "Label kategori duplikat";
    keys.add(key);
    if (c.definition.trim().length > 200) return "Definisi maksimal 200 karakter";
  }
  return null;
}
