// Data skrip draf tiruan M10a/M10b. Prosa tanpa digit di luar placeholder. Tidak mengimpor data.ts, reducer.ts, atau interpretation.ts.
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
  assess_71: [
    c("ringkasan", "interpretasi", ["assess_71"], [
      "Kandidat penyetuju cadangan dinilai berdampak {{metric:assess_71.impact_score}} dengan kelayakan {{metric:assess_71.feasibility_score}} dan risiko {{metric:assess_71.risk_score}}.",
      "Opsi penyetuju cadangan dinilai cukup berdampak ({{metric:assess_71.impact_score}}) dan cukup mudah dijalankan ({{metric:assess_71.feasibility_score}}), dengan risiko {{metric:assess_71.risk_score}}.",
    ]),
    c("terukur", "fakta_terukur", ["assess_71"], [
      "Penilaian atas {{metric:assess_71.cases}} menghasilkan skor dampak {{metric:assess_71.impact_score}}, kelayakan {{metric:assess_71.feasibility_score}}, dan risiko {{metric:assess_71.risk_score}}.",
      "Dari {{metric:assess_71.cases}} yang dinilai, skor dampaknya {{metric:assess_71.impact_score}} dan risikonya {{metric:assess_71.risk_score}}.",
    ]),
    c("terukur", "fakta_terukur", ["baseline_71"], [
      "Sebagai pembanding, durasi persetujuan pada persentil kesembilan puluh adalah {{metric:baseline_71.p90_days}} dengan pelanggaran {{metric:baseline_71.breach_pct}}.",
      "Saat ini sembilan dari sepuluh PO selesai dalam {{metric:baseline_71.p90_days}}, dan {{metric:baseline_71.breach_pct}} kasus telat.",
    ]),
    c("dasar_bukti", "fakta_terukur", ["rule_sla_71"], [
      "Aturan SLA menetapkan batas {{metric:rule_sla_71.sla_limit}} sejak PO dibuat; penilaian dibandingkan dengan batas ini.",
      "Batas waktu layanan (SLA) adalah {{metric:rule_sla_71.sla_limit}}.",
    ]),
    c("interpretasi", "interpretasi", ["assess_71", "jev_71"], [
      "Dampak yang tinggi dengan risiko rendah mendukung kandidat ini; penilaian Jev {{metric:jev_71.score}} searah dengan hasil tersebut.",
      "Manfaatnya besar dan risikonya kecil, jadi opsi ini menarik. Penilaian model {{metric:jev_71.score}} sejalan.",
    ]),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_11"], [
      "Kandidat tervalidasi: tambah penyetuju cadangan untuk PO bernilai rendah.",
      "Opsi yang sudah teruji: siapkan penyetuju cadangan untuk PO bernilai rendah.",
    ], "cand_11"),
    c("hipotesis_terbuka", "hipotesis", ["assess_71", "cand_12"], [
      "Mungkin persetujuan bertingkat berdasarkan nilai PO memberi dampak serupa dengan risiko lebih rendah, tetapi belum tervalidasi.",
      "Barangkali persetujuan bertingkat sesuai nilai PO sama bermanfaatnya. Opsi ini belum diuji.",
    ]),
    c("asumsi", "interpretasi", ["assess_71"], [
      "Skor dampak dihitung dari data periode yang sama dengan keadaan dasar.",
      "Skor dihitung dari data periode yang sama dengan kondisi saat ini.",
    ]),
    c("ketidakpastian", "interpretasi", ["assess_71"], [
      "Skor bergantung pada versi model penilaian ini dan belum diuji pada periode lain.",
      "Skor ini berasal dari satu versi model dan belum diuji pada periode lain.",
    ]),
    c("pertanyaan", "hipotesis", ["assess_71"], [
      "Apakah penyetuju cadangan tersedia pada periode sibuk?",
      "Apakah ada penyetuju cadangan saat sedang sibuk?",
    ]),
  ],
  compare_81: [
    c("ringkasan", "interpretasi", ["compare_81"], [
      "Dari {{metric:compare_81.candidates}}, peringkat pertama memperoleh skor {{metric:compare_81.top_score}}, unggul {{metric:compare_81.gap}} atas peringkat kedua.",
      "Dari {{metric:compare_81.candidates}} yang dibandingkan, yang teratas mendapat skor {{metric:compare_81.top_score}}, selisih {{metric:compare_81.gap}} dari yang kedua.",
    ]),
    c("terukur", "fakta_terukur", ["score_21", "score_22", "score_23"], [
      "Skor tiap kandidat berturut-turut {{metric:score_21.score}}, {{metric:score_22.score}}, dan {{metric:score_23.score}}.",
      "Skor ketiganya: {{metric:score_21.score}}, {{metric:score_22.score}}, dan {{metric:score_23.score}}.",
    ]),
    c("terukur", "fakta_terukur", ["score_21", "score_22"], [
      "Perkiraan penghematan durasi kandidat teratas {{metric:score_21.saving_days}}, dibanding {{metric:score_22.saving_days}} untuk peringkat kedua.",
      "Kandidat teratas diperkirakan menghemat {{metric:score_21.saving_days}}, yang kedua {{metric:score_22.saving_days}}.",
    ]),
    c("dasar_bukti", "fakta_terukur", ["rule_prior_81"], [
      "Aturan prioritas mensyaratkan selisih skor minimal {{metric:rule_prior_81.min_gap}} agar kandidat yang belum tervalidasi boleh mengungguli kandidat tervalidasi.",
      "Aturan prioritas: kandidat yang belum teruji hanya boleh di atas yang sudah teruji bila selisih skornya minimal {{metric:rule_prior_81.min_gap}}.",
    ]),
    c("interpretasi", "interpretasi", ["compare_81", "jev_81"], [
      "Kandidat teratas unggul atas yang lain dan selisihnya melampaui ambang aturan; penilaian Jev {{metric:jev_81.score}} mendukung urutan ini.",
      "Kandidat teratas unggul dan selisihnya cukup besar menurut aturan. Penilaian model {{metric:jev_81.score}} sejalan.",
    ]),
    c("interpretasi", "interpretasi", ["compare_81", "cand_99"], [
      "Urutan ini konsisten dengan hasil perbandingan sebelumnya.",
      "Urutan ini konsisten dengan hasil perbandingan sebelumnya.",
    ], undefined, (n) => n === 1),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_21"], [
      "Kandidat tervalidasi: tambah pemeriksaan otomatis saat verifikasi faktur.",
      "Opsi yang sudah teruji: tambahkan pemeriksaan otomatis saat verifikasi faktur.",
    ], "cand_21"),
    c("hipotesis_terbuka", "hipotesis", ["compare_81", "cand_22", "cand_23"], [
      "Mungkin urutan kandidat kedua dan ketiga berubah bila divalidasi, tetapi keduanya belum tervalidasi.",
      "Urutan kandidat kedua dan ketiga bisa berubah setelah diuji. Keduanya belum diuji.",
    ]),
    c("asumsi", "interpretasi", ["compare_81"], [
      "Bobot dampak, kelayakan, dan risiko dianggap sama untuk semua kandidat.",
      "Semua kandidat dinilai dengan bobot yang sama.",
    ]),
    c("ketidakpastian", "interpretasi", ["compare_81"], [
      "Selisih skor antarkandidat dapat berubah bila bobot penilaian berubah.",
      "Selisih skor bisa berubah kalau bobot penilaian diubah.",
    ]),
    c("pertanyaan", "hipotesis", ["compare_81"], [
      "Apakah bobot penilaian perlu disesuaikan dengan prioritas pemilik proses?",
      "Apakah bobot penilaian perlu disesuaikan dengan prioritas Anda?",
    ]),
  ],
  scenario_91: [
    c("ringkasan", "interpretasi", ["scenario_91"], [
      "Pada skenario, durasi persetujuan turun dari {{metric:scenario_91.base_days}} menjadi {{metric:scenario_91.scenario_days}}, dan pelanggaran SLA dari {{metric:scenario_91.base_breach}} menjadi {{metric:scenario_91.scenario_breach}}.",
      "Dengan skenario ini, persetujuan PO turun dari {{metric:scenario_91.base_days}} menjadi {{metric:scenario_91.scenario_days}}, dan yang telat dari {{metric:scenario_91.base_breach}} menjadi {{metric:scenario_91.scenario_breach}}.",
    ]),
    c("terukur", "fakta_terukur", ["scenario_91"], [
      "Simulasi atas {{metric:scenario_91.cases}} menghasilkan durasi {{metric:scenario_91.scenario_days}} pada skenario dan {{metric:scenario_91.base_days}} pada basis.",
      "Simulasi atas {{metric:scenario_91.cases}}: {{metric:scenario_91.scenario_days}} dengan skenario, {{metric:scenario_91.base_days}} tanpa skenario.",
    ]),
    c("terukur", "fakta_terukur", ["scenario_91"], [
      "Tingkat pelanggaran SLA adalah {{metric:scenario_91.base_breach}} pada basis dan {{metric:scenario_91.scenario_breach}} pada skenario.",
      "Yang telat dari batas waktu (SLA): {{metric:scenario_91.base_breach}} tanpa skenario, {{metric:scenario_91.scenario_breach}} dengan skenario.",
    ]),
    c("dasar_bukti", "fakta_terukur", ["rule_sla_91"], [
      "Aturan SLA menetapkan batas {{metric:rule_sla_91.sla_limit}} sejak PO dibuat.",
      "Batas waktu layanan (SLA) adalah {{metric:rule_sla_91.sla_limit}}.",
    ]),
    c("interpretasi", "interpretasi", ["scenario_91", "rule_sla_91", "jev_91"], [
      "Skenario tampaknya menurunkan antrean, dan durasi skenario berada di bawah batas SLA {{metric:rule_sla_91.sla_limit}}; penilaian Jev {{metric:jev_91.score}}.",
      "Skenario tampaknya memperpendek antrean sampai di bawah batas {{metric:rule_sla_91.sla_limit}}. Penilaian model {{metric:jev_91.score}}.",
    ]),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_31"], [
      "Kandidat tervalidasi: tambah penyetuju cadangan untuk PO bernilai rendah.",
      "Opsi yang sudah teruji: siapkan penyetuju cadangan untuk PO bernilai rendah.",
    ], "cand_31"),
    c("hipotesis_terbuka", "hipotesis", ["scenario_91", "cand_32"], [
      "Mungkin pembatasan antrean per penyetuju memberi hasil serupa, tetapi belum tervalidasi.",
      "Membatasi antrean per penyetuju mungkin sama manjurnya. Opsi ini belum diuji.",
    ]),
    c("asumsi", "interpretasi", ["param_91"], [
      "Skenario mengasumsikan tambahan {{metric:param_91.extra_approvers}} yang tersedia penuh.",
      "Skenario mengandaikan ada tambahan {{metric:param_91.extra_approvers}} yang siap bekerja penuh.",
    ]),
    c("ketidakpastian", "interpretasi", ["scenario_91"], [
      "Simulasi memakai pola kedatangan PO periode lalu, sehingga lonjakan tak terduga tidak tercermin.",
      "Simulasi memakai pola periode lalu, jadi lonjakan mendadak tidak ikut terhitung.",
    ]),
    c("pertanyaan", "hipotesis", ["scenario_91"], [
      "Apakah penyetuju tambahan dapat bekerja penuh pada periode sibuk?",
      "Apakah penyetuju tambahan bisa bekerja penuh saat sibuk?",
    ]),
  ],
  pilot_95: [
    c("ringkasan", "interpretasi", ["pilot_95"], [
      "Uji coba diusulkan selama {{metric:pilot_95.duration_weeks}} pada {{metric:pilot_95.scope_units}} dengan sampel {{metric:pilot_95.sample_cases}}.",
      "Uji coba kecil diusulkan: {{metric:pilot_95.duration_weeks}}, di {{metric:pilot_95.scope_units}}, sekitar {{metric:pilot_95.sample_cases}}.",
    ]),
    c("terukur", "fakta_terukur", ["baseline_95"], [
      "Basis perbandingan mencakup {{metric:baseline_95.cases}} dengan pelanggaran SLA {{metric:baseline_95.breach_pct}}.",
      "Pembandingnya {{metric:baseline_95.cases}}, dengan {{metric:baseline_95.breach_pct}} yang telat dari batas waktu (SLA).",
    ]),
    c("terukur", "fakta_terukur", ["baseline_95"], [
      "Sampel uji coba setara {{metric:baseline_95.sample_share}} dari seluruh kasus basis.",
      "Sampelnya hanya {{metric:baseline_95.sample_share}} dari semua kasus.",
    ]),
    c("dasar_bukti", "fakta_terukur", ["rule_pilot_95"], [
      "Aturan membatasi uji coba paling lama {{metric:rule_pilot_95.max_weeks}} per tahap.",
      "Aturan: uji coba paling lama {{metric:rule_pilot_95.max_weeks}} per tahap.",
    ]),
    c("interpretasi", "interpretasi", ["pilot_95", "rule_pilot_95", "jev_95"], [
      "Durasi usulan masih dalam batas aturan, tetapi sampel kecil membuat hasil sulit digeneralisasi; penilaian Jev {{metric:jev_95.score}} tergolong sedang.",
      "Lamanya masih sesuai aturan, tetapi sampel kecil membuat hasilnya belum bisa dipakai untuk semua kasus. Penilaian model {{metric:jev_95.score}}, sedang saja.",
    ]),
    c("interpretasi", "rekomendasi_tervalidasi", ["cand_41"], [
      "Kandidat tervalidasi: tambah pemeriksaan otomatis saat verifikasi faktur.",
      "Opsi yang sudah teruji: tambahkan pemeriksaan otomatis saat verifikasi faktur.",
    ], "cand_41"),
    c("hipotesis_terbuka", "hipotesis", ["pilot_95", "cand_42"], [
      "Pelatihan ulang tim verifikasi mungkin ikut menurunkan pelanggaran, tetapi belum tervalidasi.",
      "Pelatihan ulang tim verifikasi mungkin ikut membantu. Opsi ini belum diuji.",
    ]),
    c("asumsi", "interpretasi", ["pilot_95"], [
      "Departemen uji coba dianggap mewakili pola kasus secara keseluruhan.",
      "Departemen yang dicoba dianggap mewakili semua departemen.",
    ]),
    c("ketidakpastian", "interpretasi", ["pilot_95"], [
      "Paket bukti ini berada dalam konteks terbatas: sampel kecil pada satu departemen, sehingga hasil uji coba belum mewakili seluruh proses.",
      "Bukti ini punya konteks terbatas: sampel kecil di satu departemen, jadi hasilnya belum berlaku untuk semua.",
    ]),
    c("pertanyaan", "hipotesis", ["pilot_95"], [
      "Departemen mana yang paling mewakili untuk uji coba?",
      "Departemen mana yang paling cocok untuk dicoba dulu?",
    ]),
  ],
};

export const scriptFor = (findingId: string): ScriptClaim[] => SCRIPTS[findingId] ?? [];
