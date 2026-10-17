import { describe, expect, it } from "vitest";
import { FINDINGS } from "./findings";
import {
  CHECKS, SECTION_ORDER, formatMetric, resolvePlaceholders, runChecks, unreferencedEvidence,
} from "./interpretation";
import type { CheckKey, Claim, ClaimType, MockFinding, Section, SectionKey } from "./types";

const f42 = FINDINGS.find((f) => f.id === "finding_42")!;
const f57 = FINDINGS.find((f) => f.id === "finding_57")!;
const f63 = FINDINGS.find((f) => f.id === "finding_63")!;

let seq = 0;
const claim = (text: string, type: ClaimType, citations: string[], candidateId?: string): Claim => ({
  id: `c${++seq}`, type, text, citations, ...(candidateId ? { candidateId } : {}),
});
const sec = (key: SectionKey, ...claims: Claim[]): Section => ({ key, claims });

// Draf dasar yang lolos semua pemeriksa pada finding_42.
const base = (): Section[] =>
  SECTION_ORDER.map((key) =>
    key === "ketidakpastian"
      ? sec(key, claim("Masih ada hal yang belum pasti.", "hipotesis", ["finding_42"]))
      : sec(key, claim("Durasi {{metric:finding_42.p90_days}}.", "fakta_terukur", ["finding_42"])),
  );
const put = (sections: Section[], key: SectionKey, ...claims: Claim[]) =>
  sections.map((s) => (s.key === key ? { ...s, claims } : s));
const failing = (sections: Section[], f: MockFinding = f42): CheckKey[] =>
  runChecks(sections, f).filter((r) => !r.ok).map((r) => r.check);

describe("formatMetric", () => {
  it("menempel % tanpa spasi dan satuan lain dengan spasi", () => {
    expect(formatMetric({ value: 27.5, unit: "%" })).toBe("27,5%");
    expect(formatMetric({ value: 1240, unit: "kasus" })).toBe("1.240 kasus");
  });
});

describe("resolvePlaceholders", () => {
  it("mengganti placeholder dengan angka terformat dan asal-usul", () => {
    const segs = resolvePlaceholders("P90 {{metric:finding_42.p90_days}}.", f42);
    expect(segs).toEqual([
      { kind: "text", text: "P90 " },
      { kind: "number", ref: "finding_42.p90_days", formatted: "18,4 hari kerja",
        origin: "Antrean persetujuan PO melebihi SLA · p90_days · run-2" },
      { kind: "text", text: "." },
    ]);
  });
  it("placeholder tak dikenal menjadi missing", () => {
    expect(resolvePlaceholders("{{metric:nope.x}}", f42)).toEqual([{ kind: "missing", ref: "nope.x" }]);
    expect(resolvePlaceholders("{{metric:finding_42.nope}}", f42)).toEqual([{ kind: "missing", ref: "finding_42.nope" }]);
  });
  it("teks tanpa placeholder satu segmen text", () => {
    expect(resolvePlaceholders("tanpa angka", f42)).toEqual([{ kind: "text", text: "tanpa angka" }]);
  });
});

describe("pemeriksa", () => {
  it("draf dasar lolos semua", () => {
    expect(failing(base())).toEqual([]);
  });

  it("skema", () => {
    expect(failing(base().slice(0, 7))).toContain("skema");
    const bad = put(base(), "ringkasan", { id: "x", type: "fakta_terukur", text: "t" } as unknown as Claim);
    expect(failing(bad)).toContain("skema");
    expect(() => runChecks(null as unknown as Section[], f42)).not.toThrow();
    expect(failing(null as unknown as Section[])).toContain("skema");
    for (const entry of [null, "teks", 7]) {
      const junk = put(base(), "terukur", entry as unknown as Claim);
      expect(failing(junk)).toContain("skema");
    }
  });

  it("placeholder menolak kunci prototipe", () => {
    for (const key of ["constructor", "__proto__"]) {
      expect(resolvePlaceholders(`{{metric:finding_42.${key}}}`, f42)).toEqual([{ kind: "missing", ref: `finding_42.${key}` }]);
      const bad = put(base(), "terukur", claim(`Nilai {{metric:finding_42.${key}}}.`, "fakta_terukur", ["finding_42"]));
      expect(failing(bad)).toContain("placeholder");
    }
  });

  it("placeholder", () => {
    const bad = put(base(), "terukur", claim("Nilai {{metric:nope.x}}.", "fakta_terukur", ["finding_42"]));
    expect(failing(bad)).toContain("placeholder");
  });

  it("angka_literal", () => {
    for (const t of ["Sekitar 18 persen kasus.", "Terjadi 3 kali.", "Lihat SOP2."]) {
      expect(failing(put(base(), "terukur", claim(t, "fakta_terukur", ["finding_42"])))).toContain("angka_literal");
    }
    expect(failing(put(base(), "terukur", claim("Sebagian 40 kasus.", "fakta_terukur", ["finding_42"])))).toContain("angka_literal");
    const ok = put(base(), "terukur", claim("Bagian 4.2 menyebut batas.", "fakta_terukur", ["finding_42"]));
    expect(failing(ok)).not.toContain("angka_literal");
    const dated = put(base(), "terukur", claim("Sejak 2026-09-10 berlaku.", "fakta_terukur", ["finding_42"]));
    expect(failing(dated)).toContain("angka_literal");
    const f = { ...f42, evidence: f42.evidence.map((e) => (e.id === "rule_sla_1" ? { ...e, detail: `${e.detail} Berlaku 2026-09-10.` } : e)) };
    expect(failing(dated, f)).not.toContain("angka_literal");
  });

  it("rujukan", () => {
    expect(failing(put(base(), "terukur", claim("Teks.", "fakta_terukur", [])))).toContain("rujukan");
    expect(failing(put(base(), "terukur", claim("Teks.", "fakta_terukur", ["x_tidak_ada"])))).toContain("rujukan");
  });

  it("tipe_klaim", () => {
    expect(failing(put(base(), "terukur", claim("Teks.", "fakta_terukur", ["jev_42"])))).toContain("tipe_klaim");
    expect(failing(put(base(), "terukur", claim("Teks.", "fakta_terukur", ["rule_sla_1"])))).not.toContain("tipe_klaim");
    const rek = (cand?: string) =>
      put(base(), "interpretasi", claim("Teks.", "rekomendasi_tervalidasi", ["cand_1"], cand));
    expect(failing(rek("cand_2"))).toContain("tipe_klaim");
    expect(failing(rek())).toContain("tipe_klaim");
    expect(failing(rek("cand_1"))).not.toContain("tipe_klaim");
  });

  it("tindakan_tidak_dikenal", () => {
    const t = (key: SectionKey, type: ClaimType, text: string) =>
      put(base(), key, claim(text, type, ["finding_42"]));
    expect(failing(t("interpretasi", "interpretasi", "Sebaiknya tambah staf."))).toContain("tindakan_tidak_dikenal");
    expect(failing(t("pertanyaan", "hipotesis", "Apakah perlu tambah staf?"))).not.toContain("tindakan_tidak_dikenal");
    const oto = t("interpretasi", "interpretasi", "Mungkin otomatisasi membantu.");
    expect(failing(oto, f42)).not.toContain("tindakan_tidak_dikenal");
    const oto57 = put(base(), "interpretasi", claim("Mungkin otomatisasi membantu.", "interpretasi", ["finding_57"]));
    expect(failing(oto57, f57)).toContain("tindakan_tidak_dikenal");
  });

  it("bahasa_keputusan", () => {
    expect(failing(put(base(), "interpretasi", claim("Opsi akan diterapkan.", "interpretasi", ["finding_42"]))))
      .toContain("bahasa_keputusan");
    expect(failing(put(base(), "hipotesis_terbuka", claim("Opsi akan diterapkan.", "hipotesis", ["finding_42"]))))
      .not.toContain("bahasa_keputusan");
  });

  it("ketidakpastian", () => {
    expect(failing(put(base(), "ketidakpastian"))).toContain("ketidakpastian");
    const f = (text: string) => put(base(), "ketidakpastian", claim(text, "hipotesis", ["finding_63"]));
    expect(failing(f("Ada ketidakpastian."), f63)).toContain("ketidakpastian");
    expect(failing(f("Paket bukti dengan konteks terbatas."), f63)).not.toContain("ketidakpastian");
  });

  it("pesan pelanggaran berformat alasan: awal teks klaim", () => {
    const bad = put(base(), "terukur", claim("Sekitar 18 persen kasus.", "fakta_terukur", ["finding_42"]));
    const r = runChecks(bad, f42).find((x) => x.check === "angka_literal")!;
    expect(r.messages[0]).toMatch(/^.+: Sekitar 18 persen kasus\.$/);
  });
});

describe("runChecks", () => {
  it("mengembalikan delapan hasil berurutan sesuai CHECKS", () => {
    expect(runChecks(base(), f42).map((r) => r.check)).toEqual(CHECKS.map((c) => c.key));
    expect(CHECKS).toHaveLength(8);
    expect(CHECKS.filter((c) => c.heuristic).map((c) => c.key)).toEqual(["tindakan_tidak_dikenal", "bahasa_keputusan"]);
  });
});

describe("unreferencedEvidence", () => {
  it("mengembalikan item yang tidak disitir", () => {
    const ids = f42.evidence.map((e) => e.id).filter((id) => id !== "case_sample");
    const s = put(base(), "dasar_bukti", claim("Dasar.", "fakta_terukur", ids));
    const cited = s.map((x) => ({ ...x, claims: x.key === "dasar_bukti" ? x.claims : [] }));
    expect(unreferencedEvidence(cited, f42).map((e) => e.id)).toEqual(["case_sample"]);
  });
});
