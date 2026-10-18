import { describe, expect, it } from "vitest";
import { FINDINGS } from "./interpretation-targets";
import {
  CHECKS, SECTION_ORDER, TARGET_KIND_LABEL, formatMetric, kindsPresent, generateAttempt, isOverridable, resolvePlaceholders, runChecks,
  runCheckedGeneration, statusOf, unreferencedEvidence, violationKey,
} from "./interpretation";
import type { Audience, CheckKey, CheckOverride, Claim, ClaimType, MockFinding, Section, SectionKey } from "./types";

const f42 = FINDINGS.find((f) => f.id === "finding_42")!;
const f57 = FINDINGS.find((f) => f.id === "finding_57")!;
const f63 = FINDINGS.find((f) => f.id === "finding_63")!;
const f71 = FINDINGS.find((f) => f.id === "assess_71")!;
const f81 = FINDINGS.find((f) => f.id === "compare_81")!;
const f91 = FINDINGS.find((f) => f.id === "scenario_91")!;
const f95 = FINDINGS.find((f) => f.id === "pilot_95")!;

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

const AUD: Audience[] = ["analis", "pemilik_proses"];
const ALL = [f42, f57, f63, f71, f81, f91, f95];
const textIn = (sections: Section[], key: SectionKey) =>
  sections.find((s) => s.key === key)!.claims.map((c) => c.text).join(" ");
const ov = (check: CheckKey, claimId?: string): CheckOverride => ({ check, claimId, reason: "alasan", by: "u", at: "t" });

describe("generator skrip", () => {
  it("finding_42 bersih pada satu percobaan untuk kedua audiens", () => {
    for (const aud of AUD) {
      const atts = runCheckedGeneration(f42, aud);
      expect(atts).toHaveLength(1);
      expect(atts[0].violations).toEqual([]);
      expect(atts[0].sections.map((s) => s.key)).toEqual([...SECTION_ORDER]);
      const q = atts[0].sections.find((s) => s.key === "pertanyaan")!;
      expect(q.claims.some((c) => c.text.toLowerCase().includes("tambah staf"))).toBe(true);
      expect(unreferencedEvidence(atts[0].sections, f42).map((e) => e.id)).toEqual(["case_sample"]);
    }
  });

  it("finding_57: percobaan 1 melanggar tepat dua pemeriksa, percobaan 2 bersih", () => {
    for (const aud of AUD) {
      const atts = runCheckedGeneration(f57, aud);
      expect(atts.map((a) => a.n)).toEqual([1, 2]);
      expect([...new Set(atts[0].violations.map((v) => v.check))].sort()).toEqual(["angka_literal", "tindakan_tidak_dikenal"]);
      expect(atts[1].violations).toEqual([]);
    }
  });

  it("finding_63: tiga percobaan, selalu hanya bahasa_keputusan", () => {
    for (const aud of AUD) {
      const atts = runCheckedGeneration(f63, aud);
      expect(atts).toHaveLength(3);
      for (const a of atts) expect([...new Set(a.violations.map((v) => v.check))]).toEqual(["bahasa_keputusan"]);
      expect(textIn(atts[2].sections, "ketidakpastian").toLowerCase()).toContain("konteks terbatas");
    }
  });

  it("assess_71, scenario_91, pilot_95 bersih pada satu percobaan untuk kedua audiens", () => {
    for (const f of [f71, f91, f95]) for (const aud of AUD) {
      const atts = runCheckedGeneration(f, aud);
      expect(atts, f.id).toHaveLength(1);
      expect(atts[0].violations, f.id).toEqual([]);
      expect(atts[0].sections.map((s) => s.key)).toEqual([...SECTION_ORDER]);
    }
    for (const aud of AUD) expect(textIn(runCheckedGeneration(f95, aud)[0].sections, "ketidakpastian").toLowerCase()).toContain("konteks terbatas");
  });

  it("compare_81: percobaan 1 gagal tepat pada rujukan, percobaan 2 bersih", () => {
    for (const aud of AUD) {
      const atts = runCheckedGeneration(f81, aud);
      expect(atts.map((a) => a.n)).toEqual([1, 2]);
      expect(atts[0].violations.map((v) => v.check)).toEqual(["rujukan"]);
      expect(atts[0].violations[0].message).toContain("cand_99");
      expect(atts[1].violations).toEqual([]);
      expect(statusOf(atts, [])).toBe("lolos_pemeriksaan");
    }
  });

  it("target baru: rekomendasi hanya pada kandidat tervalidasi; bukti tak dirujuk sesuai harapan", () => {
    const expected: Record<string, string[]> = {
      assess_71: ["case_71"], compare_81: [], scenario_91: ["case_91"], pilot_95: [],
    };
    for (const f of [f71, f81, f91, f95]) for (const aud of AUD) {
      const last = runCheckedGeneration(f, aud).at(-1)!;
      expect(unreferencedEvidence(last.sections, f).map((e) => e.id), f.id).toEqual(expected[f.id]);
      const recs = last.sections.flatMap((s) => s.claims).filter((c) => c.type === "rekomendasi_tervalidasi");
      expect(recs.length, f.id).toBeGreaterThan(0);
      for (const r of recs) expect(f.evidence.find((e) => e.id === r.candidateId)?.validated, f.id).toBe(true);
    }
  });

  it("kindsPresent hanya memuat jenis yang ada, berurutan menurut label", () => {
    expect(kindsPresent([])).toEqual([]);
    expect(kindsPresent([{ kind: "skenario" }, { kind: "temuan" }, { kind: "skenario" }])).toEqual(["temuan", "skenario"]);
  });

  it("TARGET_KIND_LABEL memuat lima jenis", () => {
    expect(Object.keys(TARGET_KIND_LABEL).sort()).toEqual(["penilaian_kandidat", "perbandingan", "skenario", "temuan", "uji_coba"]);
    expect(TARGET_KIND_LABEL.penilaian_kandidat).toBe("Penilaian kandidat (M08)");
    for (const f of [f71, f81, f91, f95]) expect(Object.keys(TARGET_KIND_LABEL)).toContain(f.kind);
  });

  it("id klaim unik, rekomendasi punya candidateId, tanpa angka literal kecuali cacat sengaja", () => {
    for (const f of ALL) for (const aud of AUD) for (let n = 1; n <= 3; n++) {
      const sections = generateAttempt(f, aud, n);
      const claims = sections.flatMap((s) => s.claims);
      expect(new Set(claims.map((c) => c.id)).size).toBe(claims.length);
      for (const c of claims.filter((x) => x.type === "rekomendasi_tervalidasi")) expect(c.candidateId).toBeTruthy();
      expect(runChecks(sections, f).find((r) => r.check === "angka_literal")!.ok).toBe(f.id !== "finding_57" || n > 1);
      expect(sections.flatMap((x) => x.claims).length).toBeGreaterThan(0);
    }
  });

  it("deterministik; dua audiens: kunci dan jumlah klaim sama, teks berbeda", () => {
    expect(runCheckedGeneration(f57, "analis")).toEqual(runCheckedGeneration(f57, "analis"));
    for (const f of ALL) {
      const [a, b] = AUD.map((aud) => generateAttempt(f, aud, 1));
      expect(a.map((s) => s.key)).toEqual(b.map((s) => s.key));
      expect(a.map((s) => s.claims.length)).toEqual(b.map((s) => s.claims.length));
      expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    }
  });

  it("temuan lain mengembalikan daftar kosong", () => {
    expect(generateAttempt({ ...f42, id: "finding_99" }, "analis", 1)).toEqual([]);
  });
});

describe("violationKey, isOverridable, statusOf", () => {
  it("violationKey dan isOverridable", () => {
    expect(violationKey({ check: "angka_literal", claimId: "terukur-3" })).toBe("angka_literal:terukur-3");
    expect(violationKey({ check: "skema" })).toBe("skema:");
    expect(CHECKS.filter((c) => isOverridable(c.key)).map((c) => c.key)).toEqual(["tindakan_tidak_dikenal", "bahasa_keputusan"]);
  });

  it("statusOf", () => {
    expect(statusOf(runCheckedGeneration(f42, "analis"), [])).toBe("lolos_pemeriksaan");
    const atts63 = runCheckedGeneration(f63, "analis");
    expect(statusOf(atts63, [])).toBe("gagal_pemeriksaan");
    expect(statusOf([], [])).toBe("gagal_pemeriksaan");
    const bad = atts63[2].violations;
    expect(statusOf(atts63, bad.map((v) => ov(v.check, v.claimId)))).toBe("lolos_pemeriksaan");
    expect(statusOf(atts63, [ov("bahasa_keputusan", "tidak-ada")])).toBe("gagal_pemeriksaan");
    const a1 = runCheckedGeneration(f57, "analis")[0];
    expect(statusOf([a1], [ov("angka_literal", a1.violations.find((v) => v.check === "angka_literal")!.claimId)])).toBe("gagal_pemeriksaan");
    // mixed violations: overriding only the heuristic one is not enough
    const heur = a1.violations.find((v) => v.check === "tindakan_tidak_dikenal")!;
    expect(statusOf([a1], [ov("tindakan_tidak_dikenal", heur.claimId)])).toBe("gagal_pemeriksaan");
  });
});
