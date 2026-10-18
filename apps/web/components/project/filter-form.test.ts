import { describe, expect, it } from "vitest";
import { isEmptyFilter, validateFilter } from "@/lib/mock/analysis";
import { buildFilterFromForm, chipsOf, EMPTY_FORM, formFromFilter, type FilterForm } from "./filter-form";

const form = (p: Partial<FilterForm>): FilterForm => ({ ...EMPTY_FORM, ...p });

describe("buildFilterFromForm", () => {
  it("empty form builds an empty filter", () => {
    expect(isEmptyFilter(buildFilterFromForm(EMPTY_FORM))).toBe(true);
  });
  it("maps every control", () => {
    const f = buildFilterFromForm(form({ by: "akhir", from: "2026-01-01", to: "2026-02-01", vendors: ["PT Sinar Jaya"], has: ["A"], lacks: ["B"], minDays: "2", maxDays: "5,5", completion: "selesai", po: " PO-1 " }));
    expect(f).toMatchObject({
      period: { by: "akhir", from: "2026-01-01", to: "2026-02-01" }, vendors: ["PT Sinar Jaya"], hasActivities: ["A"], lacksActivities: ["B"],
      duration: { minDays: 2, maxDays: 5.5 }, completion: "selesai", po: " PO-1 ",
    });
    expect(validateFilter(f)).toEqual([]);
  });
  it("keeps variantIds from the applied filter", () => {
    expect(buildFilterFromForm(EMPTY_FORM, ["v-1"]).variantIds).toEqual(["v-1"]);
  });
  it("junk or negative durations stay visible to validateFilter", () => {
    expect(validateFilter(buildFilterFromForm(form({ minDays: "abc" }))).join()).toMatch(/angka/);
    expect(validateFilter(buildFilterFromForm(form({ maxDays: "0x10" }))).join()).toMatch(/angka/);
    expect(validateFilter(buildFilterFromForm(form({ minDays: "-3" }))).join()).toMatch(/negatif/);
  });
  it("reversed or impossible dates are rejected", () => {
    expect(validateFilter(buildFilterFromForm(form({ from: "2026-05-01", to: "2026-04-01" }))).length).toBe(1);
    expect(validateFilter(buildFilterFromForm(form({ from: "2026-13-01" }))).length).toBe(1);
  });
});

describe("formFromFilter", () => {
  it("round-trips the form-controlled conditions", () => {
    const f = buildFilterFromForm(form({ by: "event", from: "2026-01-01", vendors: ["CV Mitra Abadi"], lacks: ["B"], minDays: "1", completion: "berjalan", po: "PO-9" }));
    expect(buildFilterFromForm(formFromFilter(f))).toEqual(f);
  });
});

describe("chipsOf", () => {
  it("one chip per active condition with its key", () => {
    const f = buildFilterFromForm(form({ vendors: ["PT Sinar Jaya"], completion: "selesai" }), ["v-1"]);
    expect(chipsOf(f).map((c) => c.key)).toEqual(["vendors", "variantIds", "completion"]);
    expect(chipsOf(f).find((c) => c.key === "completion")!.text).toBe("Status: selesai");
  });
  it("empty filter has no chips", () => expect(chipsOf({})).toEqual([]));
});
