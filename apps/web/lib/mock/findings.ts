import type { EvidenceItem, MockFinding } from "./types";

const m = (value: number, unit: string, version = "run-2") => ({ value, unit, version });
const kand = (id: string, title: string, validated: boolean): EvidenceItem => ({
  id, kind: "kandidat", title, detail: `Kandidat tindakan: ${title}.`, measured: false, validated,
});
const jev = (id: string, score: number): EvidenceItem => ({
  id, kind: "hasil_jev", title: "Skor penilaian Jev", detail: "Penilaian model terhadap temuan ini.", measured: false,
  metrics: { score: m(score, "skor", "jev-1") },
});
const aturan = (id: string, title: string, quote: string, metrics?: EvidenceItem["metrics"]): EvidenceItem => ({
  id, kind: "aturan", title, detail: quote, measured: false, ...(metrics ? { metrics } : {}),
});

export const FINDINGS: MockFinding[] = [
  {
    id: "finding_42", projectId: "p-p2p", limitedContext: false,
    title: "Antrean persetujuan PO melebihi SLA",
    summary: "Persetujuan PO sering melewati batas waktu penerimaan barang.",
    evidence: [
      { id: "finding_42", kind: "temuan", title: "Antrean persetujuan PO melebihi SLA", measured: true,
        detail: "Durasi persetujuan PO pada persentil ke-90 melampaui batas SLA.",
        metrics: { p90_days: m(18.4, "hari kerja"), breach_pct: m(27.5, "%"), cases: m(1240, "kasus") } },
      aturan("rule_sla_1", "SLA penerimaan barang", "Barang harus diterima paling lambat 14 hari kerja sejak PO dibuat.",
        { sla_limit: m(14, "hari kerja", "v2") }),
      { id: "case_sample", kind: "kasus", title: "Contoh kasus PO terlambat", measured: true,
        detail: "Contoh kasus PO yang melewati batas SLA." },
      jev("jev_42", 0.82),
      kand("cand_1", "Tambah penyetuju cadangan untuk PO bernilai rendah", true),
      kand("cand_2", "Otomatisasi persetujuan PO di bawah ambang", false),
    ],
  },
  {
    id: "finding_57", projectId: "p-p2p", limitedContext: false,
    title: "Rework pada verifikasi faktur",
    summary: "Verifikasi faktur sering diulang sebelum selesai.",
    evidence: [
      { id: "finding_57", kind: "temuan", title: "Rework pada verifikasi faktur", measured: true,
        detail: "Banyak kasus kembali ke langkah verifikasi faktur lebih dari sekali.",
        metrics: { rework_pct: m(18.2, "%"), loops: m(3.1, "kali per kasus"), cases: m(860, "kasus") } },
      aturan("rule_urut_1", "Urutan pelunasan faktur", "Faktur hanya boleh dilunasi setelah penerimaan barang dicatat."),
      jev("jev_57", 0.74),
      kand("cand_3", "Tambah pemeriksaan otomatis saat verifikasi faktur", true),
      kand("cand_4", "Pelatihan ulang tim verifikasi", false),
    ],
  },
  {
    id: "finding_63", projectId: "p-p2p", limitedContext: true,
    title: "Penyimpangan urutan pembayaran",
    summary: "Sebagian pembayaran terjadi sebelum faktur diverifikasi.",
    evidence: [
      { id: "finding_63", kind: "temuan", title: "Penyimpangan urutan pembayaran", measured: true,
        detail: "Sebagian kasus membayar sebelum verifikasi faktur selesai.",
        metrics: { out_of_order_pct: m(6.4, "%"), cases: m(310, "kasus") } },
      aturan("rule_urut_2", "Urutan pembayaran", "Pembayaran hanya setelah faktur diverifikasi."),
      jev("jev_63", 0.61),
      kand("cand_5", "Kunci pembayaran sebelum verifikasi faktur", true),
    ],
  },
];
