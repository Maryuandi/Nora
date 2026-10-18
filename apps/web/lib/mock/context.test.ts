import { describe, expect, it } from "vitest";
import { parseBpmn, bpmnConversion, suggestLabel } from "./bpmn";
import { SAMPLE_BPMN } from "./bpmn-sample";
import { starterCatalog } from "./catalog";
import { definitionImpact, latestConfigs, validateConfig, configWarnings } from "./configs";
import { initialState as s } from "./data";
import { latestDocs, validateDoc, type DocInput } from "./docs";
import { previewDataset, projectCanonicalLabels } from "./rules";
import type { ConfigData } from "./types";

const labels = projectCanonicalLabels(s, "p-p2p");
const v = (data: ConfigData, name = "x") => validateConfig({ name, data }, labels).map((e) => e.field);

describe("validateDoc", () => {
  const ok: DocInput = { title: "SOP", kind: "sop", issuer: "Pengadaan", docDate: "2026-09-01", effectiveFrom: null, fileName: "a.PDF", sizeBytes: 10 };
  it("accepts a valid file and rejects bad format/size/dates", () => {
    expect(validateDoc(ok)).toEqual([]);
    expect(validateDoc({ ...ok, fileName: "a.exe" })[0].field).toBe("file");
    expect(validateDoc({ ...ok, sizeBytes: 50 * 1024 * 1024 + 1 })[0].message).toMatch(/50 MB/);
    expect(validateDoc({ ...ok, fileName: null })[0].field).toBe("file");
    expect(validateDoc({ ...ok, docDate: "x", title: " " }).map((e) => e.field)).toEqual(["title", "docDate"]);
  });
  it("interview notes need text instead of a file", () => {
    const note: DocInput = { ...ok, kind: "wawancara", fileName: null, sizeBytes: 0 };
    expect(validateDoc(note)[0].field).toBe("text");
    expect(validateDoc({ ...note, text: "isi" })).toEqual([]);
  });
  it("latestDocs keeps the newest version per docKey", () => {
    const ids = latestDocs(s.docs.filter((d) => d.projectId === "p-p2p")).map((d) => d.id);
    expect(ids).toContain("d-sop-2");
    expect(ids).not.toContain("d-sop-1");
  });
});

describe("validateConfig", () => {
  it("boundary", () => {
    expect(v({ kind: "boundary", starts: [], ends: [], idleDays: null })).toEqual(["starts", "ends"]);
    expect(v({ kind: "boundary", starts: ["A"], ends: ["A"], idleDays: null })).toEqual(["ends"]);
    expect(v({ kind: "boundary", starts: ["A"], ends: ["B"], idleDays: 0 })).toEqual(["idleDays"]);
    expect(v({ kind: "boundary", starts: ["A"], ends: ["B"], idleDays: 30 })).toEqual([]);
  });
  it("boundary activity missing from the dataset is only a warning", () => {
    expect(configWarnings({ kind: "boundary", starts: ["Nope"], ends: ["Clear Invoice"], idleDays: null }, labels)).toEqual(["Aktivitas Nope tidak muncul di dataset terpilih"]);
  });
  it("rework needs a definition and distinct pairs", () => {
    expect(v({ kind: "rework", repeated: false, returns: [] })).toEqual(["repeated"]);
    expect(v({ kind: "rework", repeated: false, returns: [{ from: "A", to: "A" }] })).toEqual(["returns.0.to"]);
  });
  it("population dates and filter", () => {
    expect(v({ kind: "population", completedOnly: true, periodFrom: "2026-02-01", periodTo: "2026-01-01", filter: null })).toEqual(["periodTo"]);
    expect(v({ kind: "population", completedOnly: true, periodFrom: null, periodTo: null, filter: { attribute: "", op: "=", value: "" } })).toEqual(["filter"]);
  });
  it("calendar", () => {
    const base = { kind: "calendar", timezone: "Asia/Jakarta", workDays: [1], startTime: "08:00", endTime: "17:00", holidays: [] } as const;
    expect(v(base)).toEqual([]);
    expect(v({ ...base, workDays: [] })).toEqual(["workDays"]);
    expect(v({ ...base, workDays: [8] })).toEqual(["workDays"]);
    expect(v({ ...base, endTime: "07:00" })).toEqual(["endTime"]);
    expect(v({ ...base, timezone: "Mars" })).toEqual(["timezone"]);
    expect(v({ ...base, holidays: [{ date: "2026-12-25", name: "" }, { date: "2026-12-25", name: "" }] })).toEqual(["holidays.1.date"]);
  });
  it("rubric weights must total 100 and scales need definitions", () => {
    const crit = (weight: number) => ({ name: "K", weight, scale: [{ value: 1, definition: "a" }, { value: 2, definition: "b" }] });
    expect(v({ kind: "rubric", criteria: [crit(60), crit(40)] })).toEqual([]);
    expect(v({ kind: "rubric", criteria: [crit(60), crit(30)] })).toEqual(["criteria"]);
    expect(v({ kind: "rubric", criteria: [{ name: "K", weight: 100, scale: [{ value: 1, definition: "" }] }] })).toEqual(["criteria.0.scale", "criteria.0.scale"]);
  });
  it("hypothesis/intervention required fields and conditions", () => {
    expect(v({ kind: "hypothesis", statement: "", symptom: "g", evidence: "b", conditions: [{ kind: "metric", subject: "m", op: ">", value: "" }] })).toEqual(["statement", "conditions.0.value"]);
    expect(v({ kind: "intervention", action: "a", hypotheses: [], prerequisites: "", effort: null, risk: null, metric: "m", conditions: [] })).toEqual(["hypotheses"]);
  });
  it("every starter catalog entry is valid and interventions point at real hypotheses", () => {
    const cat = starterCatalog("p-x");
    expect(cat.filter((c) => c.data.kind === "hypothesis")).toHaveLength(10);
    expect(cat.filter((c) => c.data.kind === "intervention")).toHaveLength(10);
    const keys = new Set(cat.map((c) => c.key));
    for (const c of cat) {
      expect(validateConfig(c, labels), c.name).toEqual([]);
      if (c.data.kind === "intervention") for (const h of c.data.hypotheses) expect(keys.has(h)).toBe(true);
    }
  });
});

describe("seed configs", () => {
  it("are valid, with at most one disetujui version per key", () => {
    const approved = new Set<string>();
    for (const c of s.configs) {
      expect(validateConfig(c, labels), c.id).toEqual([]);
      if (c.status === "disetujui") { expect(approved.has(c.key)).toBe(false); approved.add(c.key); expect(c.approvedBy).toBeTruthy(); }
    }
    expect(latestConfigs(s.configs).length).toBe(new Set(s.configs.map((c) => c.key)).size);
  });
});

describe("definitionImpact", () => {
  const dataset = previewDataset(s, "p-p2p");
  const b: ConfigData = { kind: "boundary", starts: ["A"], ends: ["B"], idleDays: null };
  it("is deterministic and consistent", () => {
    const a = definitionImpact(b, dataset);
    expect(a).toEqual(definitionImpact(b, dataset));
    if (a.status !== "ok") throw new Error("expected ok");
    expect(a.completed + a.incomplete).toBe(a.cases);
    expect(a.rework).toBeLessThanOrEqual(a.cases);
  });
  it("needs a dataset; completed-only population is smaller", () => {
    expect(definitionImpact(b, null).status).toBe("tidak_dapat_dievaluasi");
    const all = definitionImpact({ kind: "population", completedOnly: false, periodFrom: null, periodTo: null, filter: null }, dataset);
    const done = definitionImpact({ kind: "population", completedOnly: true, periodFrom: null, periodTo: null, filter: null }, dataset);
    if (all.status !== "ok" || done.status !== "ok") throw new Error("expected ok");
    expect(done.cases).toBeLessThan(all.cases);
  });
});

describe("bpmn", () => {
  it("parses the sample with its diagram bounds", () => {
    const r = parseBpmn(SAMPLE_BPMN);
    if (!r.ok) throw new Error(r.reason);
    expect(r.model.nodes.filter((n) => n.kind === "task").map((n) => n.name)).toContain("Verify Invoice");
    expect(r.model.flows).toHaveLength(6);
    expect(bpmnConversion(r.model).ok).toBe(true);
  });
  it("lays out automatically without diagram info", () => {
    const xml = `<definitions><process><startEvent id="s"/><task id="a" name="A"/><endEvent id="e"/><sequenceFlow id="f1" sourceRef="s" targetRef="a"/><sequenceFlow id="f2" sourceRef="a" targetRef="e"/></process></definitions>`;
    const r = parseBpmn(xml);
    if (!r.ok) throw new Error(r.reason);
    const x = Object.fromEntries(r.model.nodes.map((n) => [n.id, n.x]));
    expect(x.s).toBeLessThan(x.a);
    expect(x.a).toBeLessThan(x.e);
  });
  it("rejects DOCTYPE/ENTITY, non-BPMN, and models without tasks", () => {
    expect(parseBpmn(`<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><definitions/>`)).toMatchObject({ ok: false });
    expect(parseBpmn("<html/>")).toMatchObject({ ok: false });
    expect(parseBpmn("<definitions><process/></definitions>")).toMatchObject({ ok: false });
  });
  it("flags unsupported elements for conversion but still parses", () => {
    const r = parseBpmn(`<definitions><process><startEvent id="s"/><task id="a" name="A"/><eventBasedGateway id="g"/><endEvent id="e"/></process></definitions>`);
    if (!r.ok) throw new Error(r.reason);
    expect(bpmnConversion(r.model)).toEqual({ ok: false, reason: expect.stringContaining("eventBasedGateway") });
  });
  it("decodes entities in names and keeps them as plain text", () => {
    const r = parseBpmn(`<definitions><task id="a" name="Ship &amp; &lt;b&gt;"/></definitions>`);
    if (!r.ok) throw new Error(r.reason);
    expect(r.model.nodes[0].name).toBe("Ship & <b>");
  });
  it("suggests a label by name similarity", () => {
    expect(suggestLabel("Record the Goods Receipt", ["Clear Invoice", "Record Goods Receipt"])).toBe("Record Goods Receipt");
    expect(suggestLabel("Approve Purchase Order", ["Clear Invoice"])).toBeNull();
  });
});
