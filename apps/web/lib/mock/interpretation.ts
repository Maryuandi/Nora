// Aturan murni M10a: placeholder dan pemeriksa draf. Tanpa React, tanpa I/O.
import type {
  Audience, CheckKey, CheckResult, Claim, ClaimType, EvidenceItem, MockFinding, Section, SectionKey, Violation,
} from "./types";

// ---------- Konstanta ----------
export const SECTION_ORDER: readonly SectionKey[] = [
  "ringkasan", "terukur", "dasar_bukti", "interpretasi", "hipotesis_terbuka", "asumsi", "ketidakpastian", "pertanyaan",
];
export const SECTION_LABEL: Record<SectionKey, string> = {
  ringkasan: "Ringkasan",
  terukur: "Apa yang terukur",
  dasar_bukti: "Dasar bukti",
  interpretasi: "Interpretasi",
  hipotesis_terbuka: "Hipotesis yang masih terbuka",
  asumsi: "Asumsi",
  ketidakpastian: "Ketidakpastian",
  pertanyaan: "Pertanyaan untuk ditindaklanjuti",
};
export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  fakta_terukur: "Fakta terukur",
  interpretasi: "Interpretasi",
  hipotesis: "Hipotesis",
  rekomendasi_tervalidasi: "Rekomendasi tervalidasi",
};
export const AUDIENCE_LABEL: Record<Audience, string> = { analis: "Analis", pemilik_proses: "Pemilik proses" };
export const DECISION_PHRASES = ["dipilih", "akan diterapkan", "diputuskan", "pasti disebabkan", "jelas disebabkan", "membuktikan bahwa"];
export const ACTION_PHRASES = ["hentikan", "otomatisasi", "tambah staf", "outsourcing", "ganti sistem", "hapus langkah"];

// ---------- Placeholder ----------
const PLACEHOLDER = /\{\{metric:([a-z0-9_]+)\.([a-z0-9_]+)\}\}/g;
const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function formatMetric(m: { value: number; unit: string }): string {
  return m.unit === "%" ? `${nf.format(m.value)}%` : `${nf.format(m.value)} ${m.unit}`;
}

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "number"; ref: string; formatted: string; origin: string }
  | { kind: "missing"; ref: string };

export function resolvePlaceholders(text: string, finding: MockFinding): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    const [, itemId, key] = m;
    const item = finding.evidence.find((e) => e.id === itemId);
    const metric = item?.metrics?.[key];
    out.push(
      item && metric
        ? { kind: "number", ref: `${itemId}.${key}`, formatted: formatMetric(metric), origin: `${item.title} · ${key} · ${metric.version}` }
        : { kind: "missing", ref: `${itemId}.${key}` },
    );
    last = m.index + m[0].length;
  }
  if (last < text.length || out.length === 0) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

// ---------- Pemeriksa ----------
export type Checker = (sections: Section[], finding: MockFinding) => Violation[];

const CLAIM_TYPES: readonly ClaimType[] = ["fakta_terukur", "interpretasi", "hipotesis", "rekomendasi_tervalidasi"];

// Defensif terhadap masukan salah bentuk: hanya klaim berbentuk objek yang dikembalikan.
function claimsOf(sections: Section[]): { section: SectionKey; claim: Claim }[] {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((s) =>
    Array.isArray(s?.claims)
      ? s.claims.filter((c) => c && typeof c === "object").map((claim) => ({ section: s.key, claim }))
      : [],
  );
}
const textOf = (c: Claim) => (typeof c.text === "string" ? c.text : "");
const citesOf = (c: Claim) => (Array.isArray(c.citations) ? c.citations : []);
const viol = (check: CheckKey, reason: string, c?: Claim): Violation =>
  c ? { check, claimId: c.id, message: `${reason}: ${textOf(c).slice(0, 80)}` } : { check, message: reason };

const checkSchema: Checker = (sections) => {
  if (!Array.isArray(sections)) return [viol("skema", "Draf bukan daftar bagian")];
  const out: Violation[] = [];
  const keys = sections.map((s) => s?.key);
  for (const k of SECTION_ORDER) if (!keys.includes(k)) out.push(viol("skema", `Bagian ${SECTION_LABEL[k]} tidak ada`));
  for (const s of sections) if (!Array.isArray(s?.claims)) out.push(viol("skema", `Bagian ${s?.key ?? "?"} tanpa daftar klaim`));
  for (const { claim: c } of claimsOf(sections)) {
    if (typeof c.id !== "string" || !c.id) out.push(viol("skema", "Klaim tanpa id", c));
    else if (!CLAIM_TYPES.includes(c.type)) out.push(viol("skema", "Tipe klaim tidak dikenal", c));
    else if (typeof c.text !== "string") out.push(viol("skema", "Klaim tanpa teks", c));
    else if (!Array.isArray(c.citations)) out.push(viol("skema", "Klaim tanpa daftar rujukan", c));
  }
  return out;
};

const checkPlaceholders: Checker = (sections, finding) =>
  claimsOf(sections).flatMap(({ claim: c }) =>
    resolvePlaceholders(textOf(c), finding).flatMap((seg) =>
      seg.kind === "missing" ? [viol("placeholder", `Placeholder tidak dikenal ${seg.ref}`, c)] : [],
    ),
  );

const checkLiteralNumbers: Checker = (sections, finding) => {
  const details = finding.evidence.map((e) => e.detail).join("\n");
  return claimsOf(sections).flatMap(({ claim: c }) => {
    const rest = textOf(c)
      .replace(PLACEHOLDER, " ")
      .replace(/(bagian|halaman|pasal)\s+\d+(\.\d+)*/gi, " ")
      .replace(/\d{4}-\d{2}-\d{2}/g, (d) => (details.includes(d) ? " " : d));
    return /\d/.test(rest) ? [viol("angka_literal", "Angka literal di luar placeholder", c)] : [];
  });
};

const checkCitations: Checker = (sections, finding) => {
  const ids = new Set(finding.evidence.map((e) => e.id));
  return claimsOf(sections).flatMap(({ claim: c }) => {
    const cites = citesOf(c);
    if (cites.length === 0) return [viol("rujukan", "Klaim tanpa rujukan", c)];
    const bad = cites.filter((id) => !ids.has(id));
    return bad.length ? [viol("rujukan", `Rujukan tidak ada di bukti (${bad.join(", ")})`, c)] : [];
  });
};

const checkClaimTypes: Checker = (sections, finding) =>
  claimsOf(sections).flatMap(({ claim: c }) => {
    if (c.type === "fakta_terukur") {
      const bad = citesOf(c)
        .map((id) => finding.evidence.find((e) => e.id === id))
        .filter((e): e is EvidenceItem => !!e && !e.measured && e.kind !== "aturan");
      return bad.length ? [viol("tipe_klaim", `Fakta terukur merujuk bukti tak terukur (${bad.map((e) => e.id).join(", ")})`, c)] : [];
    }
    if (c.type === "rekomendasi_tervalidasi") {
      const cand = finding.evidence.find((e) => e.id === c.candidateId && e.kind === "kandidat");
      return cand?.validated ? [] : [viol("tipe_klaim", "Rekomendasi tanpa kandidat tervalidasi", c)];
    }
    return [];
  });

const checkUnknownActions: Checker = (sections, finding) => {
  const titles = finding.evidence.filter((e) => e.kind === "kandidat").map((e) => e.title.toLowerCase());
  return claimsOf(sections).flatMap(({ section, claim: c }) => {
    if (section === "pertanyaan") return [];
    const t = textOf(c).toLowerCase();
    return ACTION_PHRASES.filter((p) => t.includes(p) && !titles.some((x) => x.includes(p)))
      .map((p) => viol("tindakan_tidak_dikenal", `Tindakan "${p}" tidak ada di kandidat`, c));
  });
};

const checkDecisionLanguage: Checker = (sections) =>
  claimsOf(sections).flatMap(({ claim: c }) => {
    if (c.type !== "fakta_terukur" && c.type !== "interpretasi") return [];
    const t = textOf(c).toLowerCase();
    return DECISION_PHRASES.filter((p) => t.includes(p)).map((p) => viol("bahasa_keputusan", `Bahasa keputusan "${p}"`, c));
  });

const checkUncertainty: Checker = (sections, finding) => {
  const claims = claimsOf(sections).filter((x) => x.section === "ketidakpastian").map((x) => x.claim);
  if (claims.length === 0) return [viol("ketidakpastian", "Bagian Ketidakpastian kosong")];
  if (finding.limitedContext && !claims.some((c) => textOf(c).toLowerCase().includes("konteks terbatas")))
    return [viol("ketidakpastian", 'Bagian Ketidakpastian tidak menyebut "konteks terbatas"')];
  return [];
};

export const CHECKS: ReadonlyArray<{ key: CheckKey; heuristic: boolean; run: Checker }> = [
  { key: "skema", heuristic: false, run: checkSchema },
  { key: "placeholder", heuristic: false, run: checkPlaceholders },
  { key: "angka_literal", heuristic: false, run: checkLiteralNumbers },
  { key: "rujukan", heuristic: false, run: checkCitations },
  { key: "tipe_klaim", heuristic: false, run: checkClaimTypes },
  { key: "tindakan_tidak_dikenal", heuristic: true, run: checkUnknownActions },
  { key: "bahasa_keputusan", heuristic: true, run: checkDecisionLanguage },
  { key: "ketidakpastian", heuristic: false, run: checkUncertainty },
];

export function runChecks(sections: Section[], finding: MockFinding): CheckResult[] {
  return CHECKS.map(({ key, run }) => {
    const v = run(sections, finding);
    return { check: key, ok: v.length === 0, messages: v.map((x) => x.message) };
  });
}

export function unreferencedEvidence(sections: Section[], finding: MockFinding): EvidenceItem[] {
  const cited = new Set(claimsOf(sections).flatMap(({ claim }) => citesOf(claim)));
  return finding.evidence.filter((e) => !cited.has(e.id));
}
