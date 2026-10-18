import { describe, expect, it } from "vitest";
import { checkInterpretation, renderClaims, type CheckContext, type LlmInterpretation } from "./interpretation.ts";

const ctx: CheckContext = {
  target: "finding",
  items: [
    { ref: "E1", itemType: "finding", itemId: "f", itemVersion: null, content: { title: "Indikasi bottleneck pada transisi Approve PO → Pay Invoice" } },
    { ref: "E2", itemType: "metric_value", itemId: "f:p90Seconds", itemVersion: "transition_wait@1", content: { metric: "p90Seconds", value: 259200, unit: "seconds" } },
    { ref: "E3", itemType: "hypothesis", itemId: "h", itemVersion: "1", content: { statement: "Kapasitas approver terbatas" } },
  ],
  metrics: [{ ref: "M1", evidenceRef: "E2", metric: "p90Seconds", value: 259200, unit: "seconds", metricKey: "transition_wait", metricVersion: 1 }],
  validatedCandidateIds: [],
  requiredCaveats: [{ key: "small_sample", keywords: ["sampel kecil"], label: "sampel kecil" }],
};

const claim = (text: string, type: string, citations: string[], ph: string[] = []) => ({ text_template: text, type, citations, metric_placeholders: ph, candidate_id: null });
function draft(over: Partial<Record<string, unknown[]>> = {}): LlmInterpretation {
  return {
    sections: [
      { key: "summary", claims: [claim("Ada indikasi antrean pada transisi ini.", "interpretation", ["E1"])] },
      { key: "measured_facts", claims: [claim("P90 tunggu tercatat {{M1}}.", "measured_fact", ["E2"], ["M1"])] },
      { key: "evidence_basis", claims: [claim("Angka berasal dari run analisis.", "interpretation", ["E1"])] },
      { key: "interpretation", claims: [claim("Tunggu tampak terkonsentrasi pada satu transisi.", "interpretation", ["E1"])] },
      { key: "open_hypotheses", claims: [claim("Kapasitas approver mungkin terbatas.", "hypothesis", ["E3"])] },
      { key: "follow_up", claims: [claim("Pola ini perlu dikonfirmasi bersama pemilik proses.", "interpretation", ["E1"])] },
    ],
    assumptions: ["Waktu selesai mencerminkan kejadian sebenarnya."],
    uncertainties: ["Populasi termasuk sampel kecil."],
    follow_up_questions: ["Apakah ada perubahan staf pada periode ini?"],
    ...over,
  } as LlmInterpretation;
}

describe("checkInterpretation", () => {
  it("passes a well-formed draft", () => expect(checkInterpretation(draft(), ctx).violations).toEqual([]));
  it("rejects invalid schema", () => expect(checkInterpretation({ sections: "x" }, ctx).violations[0]!.check).toBe("schema"));
  it("rejects an unknown placeholder", () => {
    const d = draft();
    d.sections[1]!.claims[0] = claim("P90 {{M9}}.", "measured_fact", ["E2"], ["M9"]) as never;
    expect(checkInterpretation(d, ctx).violations.some((x) => x.check === "placeholder")).toBe(true);
  });
  it("rejects a raw number", () => {
    const d = draft();
    d.sections[1]!.claims[0] = claim("P90 tunggu 72 jam.", "measured_fact", ["E2"]) as never;
    expect(checkInterpretation(d, ctx).violations.some((x) => x.check === "numeric_literal")).toBe(true);
  });
  it("does not whitelist digits from identifiers", () => {
    const d = draft();
    d.sections[1]!.claims[0] = claim("Kandidat 3 lebih baik.", "measured_fact", ["E2"]) as never;
    const c = { ...ctx, items: [...ctx.items, { ref: "E4", itemType: "metric_value", itemId: "x", itemVersion: null, content: { source: "score:3f2a0000-0000-4000-8000-000000000003", candidate: "a1b2c3d4e5f60718293a" } }] };
    expect(checkInterpretation(d, c).violations.map((x) => x.check)).toContain("numeric_literal");
  });
  it("allows numbers that are part of an evidence label", () => {
    const d = draft();
    d.sections[0]!.claims[0] = claim("Antrean di Approval tier 2 menonjol.", "interpretation", ["E5"]) as never;
    const c = { ...ctx, items: [...ctx.items, { ref: "E5", itemType: "rule", itemId: "r", itemVersion: "1", content: { name: "Approval tier 2" } }] };
    expect(checkInterpretation(d, c).violations).toEqual([]);
  });
  it("rejects missing or unknown citations", () => {
    const d = draft();
    d.sections[0]!.claims[0] = claim("Ringkasan.", "interpretation", []) as never;
    d.sections[2]!.claims[0] = claim("Basis.", "interpretation", ["E7"]) as never;
    expect(checkInterpretation(d, ctx).violations.filter((x) => x.check === "citation").length).toBe(2);
  });
  it("rejects a measured fact citing only a hypothesis", () => {
    const d = draft();
    d.sections[1]!.claims[0] = claim("Kapasitas terbatas.", "measured_fact", ["E3"]) as never;
    expect(checkInterpretation(d, ctx).violations.some((x) => x.check === "claim_type")).toBe(true);
  });
  it("rejects a recommendation that is not a validated candidate", () => {
    const d = draft();
    d.sections.push({ key: "interpretation", claims: [{ ...claim("Delegasikan approval.", "validated_recommendation", ["E1"]), candidate_id: "x" }] } as never);
    expect(checkInterpretation(d, ctx).violations.some((x) => x.check === "candidate")).toBe(true);
  });
  it("rejects actions outside validated recommendations", () => {
    const d = draft();
    d.sections[3]!.claims[0] = claim("Sebaiknya tambahkan approver baru.", "interpretation", ["E1"]) as never;
    expect(checkInterpretation(d, ctx).violations.some((x) => x.check === "unknown_action")).toBe(true);
  });
  it("rejects decision and causal language", () => {
    const d = draft();
    d.sections[3]!.claims[0] = claim("Antrean disebabkan oleh kurangnya approver.", "interpretation", ["E1"]) as never;
    d.sections[0]!.claims[0] = claim("Kami memutuskan memprioritaskan transisi ini.", "interpretation", ["E1"]) as never;
    const checks = checkInterpretation(d, ctx).violations.map((x) => x.check);
    expect(checks).toContain("causal_language");
    expect(checks).toContain("decision_language");
  });
  it("requires mandatory caveats", () => expect(checkInterpretation(draft({ uncertainties: ["Tidak ada."] }), ctx).violations.some((x) => x.check === "uncertainty")).toBe(true));
});

describe("renderClaims", () => {
  it("replaces placeholders with the exact evidence value and unit", () => {
    expect(renderClaims(draft(), ctx.metrics)[1]!.claims[0]!.text).toBe("P90 tunggu tercatat 3 hari.");
  });
});
