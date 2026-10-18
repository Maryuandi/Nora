// Minimal read-only BPMN 2.0 reader. No DOMParser (works in node tests) and no entity expansion: DOCTYPE/ENTITY are rejected outright (XXE).
export type BpmnNode = { id: string; name: string; kind: "task" | "start" | "end" | "gateway" | "other"; x: number; y: number; w: number; h: number };
export type BpmnModel = { nodes: BpmnNode[]; flows: { id: string; from: string; to: string }[]; unsupported: string[]; width: number; height: number };
export type BpmnParse = { ok: true; model: BpmnModel } | { ok: false; reason: string };

export const BPMN_MAX_CHARS = 5_000_000;
const TASKS = new Set(["task", "userTask", "serviceTask", "manualTask", "sendTask", "receiveTask", "scriptTask", "businessRuleTask"]);
const GATES = new Set(["exclusiveGateway", "parallelGateway", "inclusiveGateway"]);
const UNSUPPORTED = new Set(["eventBasedGateway", "complexGateway", "subProcess", "transaction", "adHocSubProcess", "callActivity", "boundaryEvent", "intermediateCatchEvent", "intermediateThrowEvent"]);
const SIZE = { task: [120, 60], start: [36, 36], end: [36, 36], gateway: [50, 50], other: [120, 60] } as const;

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decode(m[1] ?? m[2]) : undefined;
};

export function parseBpmn(xml: string): BpmnParse {
  if (xml.length > BPMN_MAX_CHARS) return { ok: false, reason: "File BPMN terlalu besar untuk ditampilkan" };
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { ok: false, reason: "File berisi DOCTYPE atau ENTITY dan ditolak demi keamanan" };
  if (!/<(?:[\w.-]+:)?definitions\b/.test(xml)) return { ok: false, reason: "Bukan file BPMN 2.0 (elemen definitions tidak ditemukan)" };

  const nodes: BpmnNode[] = [];
  const flows: BpmnModel["flows"] = [];
  const unsupported: string[] = [];
  const bounds = new Map<string, { x: number; y: number; w: number; h: number }>();
  let shape: string | undefined;
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?([A-Za-z]+)\b([^>]*?)\/?>/g)) {
    const [, local, tag] = m;
    const id = attr(tag, "id");
    const name = (attr(tag, "name") ?? "").trim();
    if (local === "BPMNShape") shape = attr(tag, "bpmnElement");
    else if (local === "Bounds" && shape) {
      const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => Number(attr(tag, k)));
      if ([x, y, w, h].every(Number.isFinite)) bounds.set(shape, { x, y, w, h });
      shape = undefined;
    } else if (local === "sequenceFlow" && id) flows.push({ id, from: attr(tag, "sourceRef") ?? "", to: attr(tag, "targetRef") ?? "" });
    else if (!id || nodes.some((n) => n.id === id)) continue;
    else if (TASKS.has(local)) nodes.push({ id, name: name || id, kind: "task", x: 0, y: 0, w: 0, h: 0 });
    else if (local === "startEvent") nodes.push({ id, name, kind: "start", x: 0, y: 0, w: 0, h: 0 });
    else if (local === "endEvent") nodes.push({ id, name, kind: "end", x: 0, y: 0, w: 0, h: 0 });
    else if (GATES.has(local)) nodes.push({ id, name, kind: "gateway", x: 0, y: 0, w: 0, h: 0 });
    else if (UNSUPPORTED.has(local)) { unsupported.push(local); nodes.push({ id, name: name || id, kind: "other", x: 0, y: 0, w: 0, h: 0 }); }
  }
  if (!nodes.some((n) => n.kind === "task")) return { ok: false, reason: "Model tidak memuat task" };

  const ids = new Set(nodes.map((n) => n.id));
  const validFlows = flows.filter((f) => ids.has(f.from) && ids.has(f.to));
  if (nodes.every((n) => bounds.has(n.id))) {
    for (const n of nodes) Object.assign(n, bounds.get(n.id)!);
  } else {
    // No (complete) diagram info: layer by longest path from the nodes without incoming flow.
    const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
    for (let pass = 0; pass < nodes.length; pass++)
      for (const f of validFlows) layer.set(f.to, Math.min(nodes.length, Math.max(layer.get(f.to)!, layer.get(f.from)! + 1)));
    const rowOf = new Map<number, number>();
    for (const n of nodes) {
      const l = layer.get(n.id)!;
      const row = rowOf.get(l) ?? 0;
      rowOf.set(l, row + 1);
      const [w, h] = SIZE[n.kind];
      Object.assign(n, { x: 30 + l * 170, y: 30 + row * 90, w, h });
    }
  }
  const width = Math.max(...nodes.map((n) => n.x + n.w)) + 30;
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + 30;
  return { ok: true, model: { nodes, flows: validFlows, unsupported, width, height } };
}

/** Can the model be handed to the PM4Py worker for conformance? When not, it stays a visual reference. */
export function bpmnConversion(model: BpmnModel): { ok: boolean; reason?: string } {
  if (model.unsupported.length) return { ok: false, reason: `Elemen belum didukung untuk pemeriksaan conformance: ${[...new Set(model.unsupported)].join(", ")}` };
  if (!model.nodes.some((n) => n.kind === "start") || !model.nodes.some((n) => n.kind === "end")) return { ok: false, reason: "Model harus punya event awal dan event akhir" };
  return { ok: true };
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
/** Best label by name similarity (Jaccard >= 0.5), or null. */
export function suggestLabel(taskName: string, labels: string[]): string | null {
  const t = tokens(taskName);
  let best: { label: string; score: number } | null = null;
  for (const label of labels) {
    const l = tokens(label);
    const inter = [...t].filter((x) => l.has(x)).length;
    const score = inter / (t.size + l.size - inter || 1);
    if (score >= 0.5 && (!best || score > best.score)) best = { label, score };
  }
  return best?.label ?? null;
}
