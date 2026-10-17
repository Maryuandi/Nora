// Data skrip draf tiruan M10a. Prosa tanpa digit di luar placeholder. Tidak mengimpor data.ts, reducer.ts, atau interpretation.ts.
import type { ClaimType, SectionKey } from "./types";

type Pair = readonly [analis: string, pemilik: string];
export interface ScriptClaim {
  section: SectionKey; type: ClaimType; citations: string[]; text: Pair; candidateId?: string;
  /** Hanya disertakan pada percobaan yang memenuhi syarat ini (cacat sengaja). */
  when?: (n: number) => boolean;
}
const c = (section: SectionKey, type: ClaimType, citations: string[], text: Pair, candidateId?: string, when?: (n: number) => boolean): ScriptClaim =>
  ({ section, type, citations, text, ...(candidateId ? { candidateId } : {}), ...(when ? { when } : {}) });

const SCRIPTS: Record<string, ScriptClaim[]> = {
  finding_42: [
    c("ringkasan", "interpretasi", ["finding_42"], [
      "Persetujuan PO pada persentil tinggi memakan {{metric:finding_42.p90_days}}, dan {{metric:finding_42.breach_pct}} kasus melewati batas.",
      "Sebagian besar PO selesai disetujui dalam {{metric:finding_42.p90_days}} atau kurang. Namun {{metric:finding_42.breach_pct}} kasus telat dari batas waktu (SLA).",
    ]),
    c("terukur", "fakta_terukur", ["finding_42", "rule_sla_1"], [
      "Persentil kesembilan puluh durasi persetujuan adalah {{metric:finding_42.p90_days}}, sedangkan batas SLA {{metric:rule_sla_1.sla_limit}}.",
      "Sembilan dari sepuluh PO selesai dalam {{metric:finding_42.p90_days}}. Batas SLA (janji waktu layanan) adalah {{metric:rule_sla_1.sla_limit}}.",
    ]),
    c("terukur", "fakta_terukur", ["finding_42"], [
      "Tingkat pelanggaran SLA tercatat {{metric:finding_42.breach_pct}} dari {{metric:finding_42.cases}}.",
      "Dari {{metric:finding_42.cases}}, {{metric:finding_42.breach_pct}} melewati SLA.",
    ]),
    c("dasar_bukti", "fakta_terukur", ["rule_sla_1"], [
      "Aturan SLA mewajibkan barang diterima dalam batas hari kerja yang ditetapkan sejak PO dibuat.",
      "Aturan SLA: barang harus sudah diterima dalam batas hari kerja sejak PO dibuat.",
    ]),
    c("interpretasi", "interpretasi", ["finding_42", "jev_42"], [
      "Antrean persetujuan tampaknya menjadi sumber keterlambatan; penilaian Jev {{metric:jev_42.score}} mendukung dugaan ini.",
      "Antrean persetujuan tampaknya penyebab keterlambatan. Penilaian model memberi {{metric:jev_42.score}}, jadi dugaan ini cukup kuat.",
    ]),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_1"], [
      "Kandidat tervalidasi: tambah penyetuju cadangan untuk PO bernilai rendah.",
      "Opsi yang sudah teruji: siapkan penyetuju cadangan untuk PO bernilai rendah.",
    ], "cand_1"),
    c("hipotesis_terbuka", "hipotesis", ["finding_42", "cand_2"], [
      "Mungkin persetujuan PO di bawah ambang tertentu bisa berjalan otomatis, tetapi opsi ini belum tervalidasi.",
      "Barangkali PO bernilai kecil bisa disetujui otomatis. Opsi ini belum diuji.",
    ]),
    c("asumsi", "interpretasi", ["rule_sla_1"], [
      "Perhitungan hari kerja memakai kalender kerja bawaan.",
      "Hari kerja dihitung dengan kalender kerja standar.",
    ]),
    c("ketidakpastian", "interpretasi", ["finding_42"], [
      "Data hanya mencakup satu periode, sehingga pola musiman belum terlihat.",
      "Data baru satu periode, jadi pola musiman belum tampak.",
    ]),
    c("pertanyaan", "hipotesis", ["finding_42"], [
      "Apakah tim persetujuan perlu tambah staf pada periode sibuk?",
      "Apakah tim persetujuan perlu tambah staf saat sibuk?",
    ]),
  ],
  finding_57: [
    c("ringkasan", "interpretasi", ["finding_57"], [
      "Rework tercatat pada {{metric:finding_57.rework_pct}} kasus verifikasi faktur dengan rata-rata {{metric:finding_57.loops}}.",
      "{{metric:finding_57.rework_pct}} faktur harus dikerjakan ulang (rework), rata-rata {{metric:finding_57.loops}}.",
    ]),
    c("terukur", "fakta_terukur", ["finding_57"], [
      "Dari {{metric:finding_57.cases}}, tingkat rework adalah {{metric:finding_57.rework_pct}}.",
      "Dari {{metric:finding_57.cases}}, sebanyak {{metric:finding_57.rework_pct}} diulang.",
    ]),
    c("terukur", "fakta_terukur", ["finding_57"], [
      "Setiap kasus yang mengalami rework kembali ke verifikasi rata-rata {{metric:finding_57.loops}}.",
      "Kasus yang diulang kembali ke verifikasi rata-rata {{metric:finding_57.loops}}.",
    ]),
    c("terukur", "fakta_terukur", ["finding_57"], [
      "Rework terjadi pada sekitar 18 persen kasus.",
      "Rework terjadi pada sekitar 18 persen kasus.",
    ], undefined, (n) => n === 1),
    c("dasar_bukti", "fakta_terukur", ["rule_urut_1"], [
      "Aturan urutan mengharuskan penerimaan barang dicatat sebelum faktur dilunasi.",
      "Aturan: catat penerimaan barang dulu, baru lunasi faktur.",
    ]),
    c("interpretasi", "interpretasi", ["finding_57", "jev_57"], [
      "Rework diduga muncul karena data faktur dan penerimaan barang sering tidak cocok; penilaian Jev {{metric:jev_57.score}}.",
      "Ulang kerja diduga karena data faktur dan penerimaan barang sering tidak cocok. Penilaian model {{metric:jev_57.score}}.",
    ]),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_3"], [
      "Kandidat tervalidasi: tambah pemeriksaan otomatis saat verifikasi faktur.",
      "Opsi yang sudah teruji: tambahkan pemeriksaan otomatis saat verifikasi faktur.",
    ], "cand_3"),
    c("interpretasi", "interpretasi", ["finding_57"], [
      "Sebaiknya hentikan verifikasi manual dan tambah staf di tim hutang usaha.",
      "Sebaiknya hentikan verifikasi manual dan tambah staf di tim hutang usaha.",
    ], undefined, (n) => n === 1),
    c("hipotesis_terbuka", "hipotesis", ["finding_57", "cand_4"], [
      "Pelatihan ulang tim verifikasi mungkin menurunkan rework, tetapi belum tervalidasi.",
      "Pelatihan ulang tim verifikasi mungkin mengurangi pekerjaan ulang. Belum diuji.",
    ]),
    c("asumsi", "interpretasi", ["rule_urut_1"], [
      "Setiap putaran verifikasi ulang dihitung sebagai satu rework.",
      "Tiap verifikasi ulang dihitung sebagai satu rework.",
    ]),
    c("ketidakpastian", "interpretasi", ["finding_57"], [
      "Penyebab rework per jenis faktur belum dipisahkan dalam data.",
      "Belum diketahui rework paling sering terjadi pada jenis faktur yang mana.",
    ]),
    c("pertanyaan", "hipotesis", ["finding_57"], [
      "Jenis faktur mana yang paling sering diulang?",
      "Faktur jenis apa yang paling sering diulang?",
    ]),
  ],
  finding_63: [
    c("ringkasan", "interpretasi", ["finding_63"], [
      "{{metric:finding_63.out_of_order_pct}} pembayaran terjadi sebelum faktur diverifikasi.",
      "{{metric:finding_63.out_of_order_pct}} pembayaran dilakukan sebelum faktur dicek.",
    ]),
    c("terukur", "fakta_terukur", ["finding_63"], [
      "Dari {{metric:finding_63.cases}}, penyimpangan urutan pembayaran tercatat {{metric:finding_63.out_of_order_pct}}.",
      "Dari {{metric:finding_63.cases}}, {{metric:finding_63.out_of_order_pct}} dibayar di luar urutan.",
    ]),
    c("dasar_bukti", "fakta_terukur", ["rule_urut_2"], [
      "Aturan urutan menetapkan pembayaran hanya setelah faktur diverifikasi.",
      "Aturan: bayar hanya setelah faktur dicek.",
    ]),
    c("interpretasi", "interpretasi", ["finding_63", "jev_63"], [
      "Penyimpangan ini mungkin berasal dari jalur pembayaran darurat; penilaian Jev {{metric:jev_63.score}} tergolong rendah.",
      "Mungkin ada jalur pembayaran darurat. Penilaian model {{metric:jev_63.score}}, jadi belum yakin.",
    ]),
    c("interpretasi", "interpretasi", ["finding_63"], [
      "Opsi penguncian pembayaran dipilih dan akan diterapkan.",
      "Opsi mengunci pembayaran dipilih dan akan diterapkan.",
    ]),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_5"], [
      "Kandidat tervalidasi: kunci pembayaran sebelum verifikasi faktur.",
      "Opsi yang sudah teruji: kunci pembayaran sebelum faktur dicek.",
    ], "cand_5"),
    c("hipotesis_terbuka", "hipotesis", ["finding_63"], [
      "Bisa jadi pembayaran lebih awal sengaja dilakukan untuk pemasok tertentu.",
      "Bisa jadi ada pemasok yang sengaja dibayar lebih awal.",
    ]),
    c("asumsi", "interpretasi", ["rule_urut_2"], [
      "Aturan urutan dianggap berlaku untuk semua pemasok.",
      "Aturan urutan dianggap berlaku untuk semua pemasok.",
    ]),
    c("ketidakpastian", "interpretasi", ["finding_63"], [
      "Paket bukti ini memiliki konteks terbatas pada kasus yang tersedia, sehingga kesimpulan perlu hati-hati.",
      "Bukti ini punya konteks terbatas, jadi kesimpulannya perlu hati-hati.",
    ]),
    c("pertanyaan", "hipotesis", ["finding_63"], [
      "Apakah ada pengecualian resmi untuk pembayaran lebih awal?",
      "Apakah ada pengecualian resmi untuk bayar lebih awal?",
    ]),
  ],
};

export const scriptFor = (findingId: string): ScriptClaim[] => SCRIPTS[findingId] ?? [];
