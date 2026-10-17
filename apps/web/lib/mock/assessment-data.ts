import type { Candidate, Criterion, Finding, Relevance } from "./types";

export type FixtureEntry = { sufficient: number; levels: number[]; relevance: Record<Relevance, number>; failed?: boolean };

const rel = (relevan: number, sebagian_relevan: number, tidak_relevan: number, informasi_tidak_cukup: number): Record<Relevance, number> =>
  ({ relevan, sebagian_relevan, tidak_relevan, informasi_tidak_cukup });

// Fixed per-candidate model output so the demo is stable (no randomness).
export const FIXTURE: Record<string, FixtureEntry> = {
  c1: { sufficient: 0.92, levels: [4, 5, 4], relevance: rel(0.78, 0.15, 0.05, 0.02) },
  c2: { sufficient: 0.88, levels: [3, 4, 3], relevance: rel(0.12, 0.71, 0.14, 0.03) },
  c3: { sufficient: 0.81, levels: [3, 3, 2], relevance: rel(0.41, 0.38, 0.15, 0.06) },
  c4: { sufficient: 0.9, levels: [1, 2, 1], relevance: rel(0.05, 0.1, 0.82, 0.03) },
  c5: { sufficient: 0.31, levels: [], relevance: rel(0.2, 0.2, 0.2, 0.4) },
  c7: { sufficient: 0.93, levels: [5, 4, 4], relevance: rel(0.84, 0.1, 0.04, 0.02) },
  c8: { sufficient: 0, levels: [], relevance: rel(0.25, 0.25, 0.25, 0.25), failed: true },
  c9: { sufficient: 0.87, levels: [4, 3, 4], relevance: rel(0.7, 0.2, 0.07, 0.03) },
};

const crit = (key: string, label: string, weight: number, defs: [string, string, string, string, string]): Criterion => ({
  key, label, weight, scale: defs.map((definition, i) => ({ level: i + 1, definition })),
});

const cand = (id: string, kind: Candidate["kind"], name: string, criteria: Criterion[], na?: string): Candidate =>
  ({ id, kind, name, criteria, applicable: !na, ...(na ? { notApplicableReason: na } : {}) });

export const candidates: Candidate[] = [
  cand("c1", "hipotesis", "Beban kerja approver tidak merata", [
    crit("k1", "Konsentrasi persetujuan pada satu orang", 0.5, ["Persetujuan tersebar merata antar approver", "Sedikit condong ke beberapa approver", "Sebagian besar persetujuan dipegang dua atau tiga orang", "Hampir semua persetujuan dipegang satu atau dua orang", "Seluruh persetujuan dipegang satu orang"]),
    crit("k2", "Selisih beban antar approver", 0.3, ["Selisih beban kurang dari 10%", "Selisih beban 10-25%", "Selisih beban 25-50%", "Selisih beban 50-100%", "Selisih beban lebih dari dua kali lipat"]),
    crit("k3", "Dampak pada waktu tunggu", 0.2, ["Tidak ada dampak pada waktu tunggu", "Waktu tunggu naik tipis", "Waktu tunggu naik jelas pada sebagian kasus", "Waktu tunggu naik pada sebagian besar kasus", "Waktu tunggu naik hampir di semua kasus"]),
  ]),
  cand("c2", "hipotesis", "Approver tunggal untuk PO bernilai tinggi", [
    crit("k1", "Jumlah approver untuk PO bernilai tinggi", 0.4, ["Lebih dari lima approver", "Empat sampai lima approver", "Tiga approver", "Dua approver", "Satu approver"]),
    crit("k2", "Keterlambatan PO bernilai tinggi", 0.4, ["Tidak ada keterlambatan", "Terlambat pada kurang dari 10% kasus", "Terlambat pada 10-30% kasus", "Terlambat pada 30-60% kasus", "Terlambat pada lebih dari 60% kasus"]),
    crit("k3", "Ketersediaan pengganti", 0.2, ["Pengganti selalu tersedia", "Pengganti hampir selalu tersedia", "Pengganti kadang tersedia", "Pengganti jarang tersedia", "Tidak ada pengganti"]),
  ]),
  cand("c3", "hipotesis", "Antrean persetujuan menumpuk di akhir pekan", [
    crit("k1", "Lonjakan antrean menjelang akhir pekan", 0.4, ["Tidak ada lonjakan", "Lonjakan di bawah 10%", "Lonjakan 10-25%", "Lonjakan 25-50%", "Lonjakan lebih dari 50%"]),
    crit("k2", "Persetujuan pada hari Sabtu dan Minggu", 0.3, ["Persetujuan akhir pekan setara hari kerja", "Sedikit lebih rendah dari hari kerja", "Separuh dari hari kerja", "Seperempat dari hari kerja", "Hampir tidak ada"]),
    crit("k3", "Dampak pada awal pekan berikutnya", 0.3, ["Tidak ada sisa antrean", "Sisa antrean kecil dan cepat habis", "Sisa antrean terasa sampai hari kedua", "Sisa antrean terasa sampai hari ketiga", "Sisa antrean bertahan hingga akhir pekan berikutnya"]),
  ]),
  cand("c4", "hipotesis", "Batas wewenang terlalu ketat", [
    crit("k1", "Proporsi PO yang melewati batas wewenang", 0.5, ["Kurang dari 5% PO", "5-15% PO", "15-30% PO", "30-50% PO", "Lebih dari 50% PO"]),
    crit("k2", "Eskalasi ke tingkat lebih tinggi", 0.3, ["Hampir tidak ada eskalasi", "Eskalasi jarang", "Eskalasi sedang", "Eskalasi sering", "Eskalasi hampir selalu"]),
    crit("k3", "Dampak pada durasi persetujuan", 0.2, ["Tidak ada dampak", "Dampak kecil", "Dampak sedang", "Dampak besar", "Dampak sangat besar"]),
  ]),
  cand("c5", "hipotesis", "Tidak ada delegasi saat cuti", [
    crit("k1", "Keberadaan aturan delegasi", 0.5, ["Aturan delegasi lengkap dan dipakai", "Aturan ada, sebagian dipakai", "Aturan ada, jarang dipakai", "Aturan tidak tertulis", "Tidak ada aturan delegasi"]),
    crit("k2", "Persetujuan tertahan saat approver cuti", 0.3, ["Tidak ada yang tertahan", "Sedikit tertahan", "Cukup banyak tertahan", "Banyak tertahan", "Hampir semua tertahan"]),
    crit("k3", "Lama penundaan akibat cuti", 0.2, ["Kurang dari satu hari", "1-2 hari", "3-5 hari", "6-10 hari", "Lebih dari 10 hari"]),
  ]),
  cand("c6", "hipotesis", "Persetujuan tertunda pada Resource tertentu", [
    crit("k1", "Konsentrasi pada satu Resource", 0.5, ["Tersebar merata", "Sedikit terkonsentrasi", "Cukup terkonsentrasi", "Sangat terkonsentrasi", "Hanya satu Resource"]),
    crit("k2", "Dampak pada waktu tunggu", 0.5, ["Tidak ada dampak", "Dampak kecil", "Dampak sedang", "Dampak besar", "Dampak sangat besar"]),
  ], "Atribut Resource belum dipetakan"),
  cand("c7", "hipotesis", "Dokumen pendukung tidak lengkap", [
    crit("k1", "Proporsi pengajuan dengan dokumen kurang", 0.4, ["Kurang dari 5%", "5-15%", "15-30%", "30-50%", "Lebih dari 50%"]),
    crit("k2", "Pengembalian ke pemohon", 0.3, ["Tidak pernah dikembalikan", "Jarang dikembalikan", "Kadang dikembalikan", "Sering dikembalikan", "Hampir selalu dikembalikan"]),
    crit("k3", "Pengulangan siklus persetujuan", 0.3, ["Tidak ada pengulangan", "Satu kali pada sedikit kasus", "Satu kali pada banyak kasus", "Dua kali atau lebih pada sedikit kasus", "Dua kali atau lebih pada banyak kasus"]),
  ]),
  cand("c8", "intervensi", "Perubahan harga setelah persetujuan", [
    crit("k1", "Frekuensi perubahan harga setelah persetujuan", 0.5, ["Tidak pernah berubah", "Jarang berubah", "Kadang berubah", "Sering berubah", "Hampir selalu berubah"]),
    crit("k2", "Besar perubahan harga", 0.5, ["Kurang dari 1%", "1-5%", "5-10%", "10-25%", "Lebih dari 25%"]),
  ]),
  cand("c9", "intervensi", "Penolakan karena kuantitas", [
    crit("k1", "Penolakan akibat selisih kuantitas", 0.5, ["Tidak ada penolakan", "Kurang dari 5% pengajuan", "5-15% pengajuan", "15-30% pengajuan", "Lebih dari 30% pengajuan"]),
    crit("k2", "Pengajuan ulang setelah penolakan", 0.3, ["Tidak ada pengajuan ulang", "Jarang diajukan ulang", "Kadang diajukan ulang", "Sering diajukan ulang", "Hampir selalu diajukan ulang"]),
    crit("k3", "Tambahan waktu akibat penolakan", 0.2, ["Kurang dari satu hari", "1-2 hari", "3-5 hari", "6-10 hari", "Lebih dari 10 hari"]),
  ]),
];

export const findings: Finding[] = [
  { id: "f-bottleneck", projectId: "p-p2p", title: "Persetujuan menumpuk pada satu approver",
    summary: "Sebagian besar permintaan persetujuan menunggu lama karena bertumpu pada satu approver. Enam kandidat penjelasan dinilai terhadap bukti proses.",
    candidateIds: ["c1", "c2", "c3", "c4", "c5", "c6"], evidenceBundleId: "eb-f-bottleneck" },
  { id: "f-rework", projectId: "p-p2p", title: "Rework pada Change Approval",
    summary: "Banyak perubahan pesanan harus diproses ulang pada tahap Change Approval. Tiga kandidat penyebab dinilai terhadap bukti proses.",
    candidateIds: ["c7", "c8", "c9"], evidenceBundleId: "eb-f-rework" },
];
