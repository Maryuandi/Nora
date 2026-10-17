# Spec: M09 frontend, Rekomendasi, validasi, dan uji skenario (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M09](../../prd/m09-rekomendasi-validasi-uji-skenario-prd.md), Story 1 sampai 6, Fitur 1 sampai 5, "Definisi MVP". Dibangun di atas `feat/m07-frontend` (M01–M04c dan spec M05a/M07/M08), komponen Untitled UI, token Nora, ikon Phosphor. Branch: `feat/m09-frontend`. Tidak ada backend, worker Python, atau PostgreSQL; semua hitungan berjalan di browser dari data tiruan.

## Tujuan

Untuk satu temuan bottleneck, analis melihat kandidat tindakan, hasil lima pemeriksaan validasi beserta alasannya, urutan prioritas dengan rumus dan bobot yang terbuka, perbandingan berdampingan, estimasi aritmetika "jika jeda X turun 50%", dan draf pilot dengan baseline terisi otomatis. Setiap angka dapat dijelaskan; asumsi tidak pernah diisi diam-diam.

**Berhasil bila:**

1. Proyek punya tab "Rekomendasi" dengan sub-navigasi Temuan, Kebijakan, Skenario, Uji coba; semua rute dapat dicapai lewat navigasi.
2. Satu temuan demo menampilkan: kandidat `tervalidasi`, satu `belum_layak_dinilai` beserta informasi yang kurang, satu `perlu_review`, satu `tidak_memenuhi_syarat`, dan urutan prioritas dengan rincian skor per komponen.
3. Mengubah bobot menampilkan urutan baru dibanding urutan sebelumnya; masukan + versi kebijakan yang sama selalu menghasilkan urutan identik (diuji).
4. Uji skenario tiga jenis menghasilkan median/P90 sebelum dan sesudah, kasus terdampak, dan keterangan asumsi tetap; cocok dengan perhitungan referensi di tes (toleransi 0,1%).
5. Draf usulan uji coba terisi baseline otomatis; target dan pemilik diisi analis.
6. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

M06 dan M08 sungguhan (temuan, penilaian Jev: di sini seed tiruan milik M09 dengan bentuk yang sengaja mirip spec M08, diberi label "data contoh"), katalog M04e sungguhan, paket bukti M07 (tautan nonaktif), simulasi SimPy (jenis skenario kapasitas hanya tampil nonaktif "memerlukan simulasi (Fase 2)"), usulan kandidat masuk katalog (hanya penanda), keputusan (M11), narasi (M10), Zod/JSON Schema untuk worker, layar ponsel.

## Peran dan izin

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `rec.view` | ya | ya | ya |
| `rec.edit` (tambah kandidat, ubah kebijakan, jalankan skenario, susun dan ubah draf pilot) | tidak | ya | tidak |

Aksi tulis hanya pada proyek `aktif` (`acceptsData`); selain itu tombol disembunyikan dengan penjelasan seperti M04c. Bukan anggota: `NotFoundPanel`. Audit baru: `kandidat.tambah`, `kebijakan.ubah`, `skenario.jalankan`, `ujicoba.buat`, `ujicoba.ubah`.

## Model data (`lib/mock/types.ts`, tambahan)

```ts
type ValidationStatus = "tervalidasi" | "belum_layak_dinilai" | "tidak_memenuhi_syarat" | "perlu_review";
type CheckResult = "lolos" | "gagal" | "tidak_dapat_diperiksa";
type CheckKey = "syarat" | "angka" | "versi" | "kewenangan" | "jev";
type JevStatus = "otomatis" | "dikonfirmasi" | "perlu_review" | "informasi_tidak_cukup" | "belum_dinilai";

interface RecMetric { key: string; label: string; value: number; unit: string }   // angka M06 pada temuan
interface RecFinding {
  id: string; projectId: string; title: string; summary: string;
  metrics: RecMetric[];                                   // mis. wait_days_p90
  affectedShare: number; waitShare: number;               // 0-1, dari M06
  supportCases: number;                                   // jumlah kasus pendukung
  activeRefs: Record<string, number>;                     // rujukan -> versi aktif di paket konteks
}
interface JevResult { status: JevStatus; score: number | null /* 0-100 */; criteria: { label: string; level: number }[]; prob: number | null; conclusion: "relevan" | "sebagian_relevan" | "tidak_relevan" | null }
interface RecCandidate {
  id: string; kind: "hipotesis" | "intervensi"; origin: "katalog" | "analis"; proposeToCatalog: boolean;
  name: string; description: string; addresses: string; successMetric: string;
  findingIds: string[];                                   // satu kandidat, banyak temuan
  conditions: { label: string; metricKey: string; op: ">" | ">=" | "<" | "<=" ; value: number }[];  // syarat penerapan M04
  refMetrics: { metricKey: string; expected: number }[];  // angka rujukan yang dikutip kandidat
  refs: { key: string; version: number }[];               // aturan/dokumen yang dirujuk
  ownerRole: string | null;                               // peran pemilik tindakan, mis. "Manajer Pengadaan"
  effort: number | null; risk: number | null;             // 1-5, null = asumsi belum tersedia
  prerequisites: string[]; exclusions: string[];
  jev: Record<string, JevResult>;                         // per findingId
}
interface PriorityPolicy { projectId: string; version: number; weights: { relevance: number; magnitude: number; certainty: number; effort: number; risk: number }; changedBy: string; changedAt: string; note: string }

type ScenarioSpec =
  | { kind: "kurangi_jeda"; transition: string; pct: number }                 // (a) jeda turun X%
  | { kind: "batasi_jeda"; transition: string; maxDays: number }              // (a) jeda dibatasi N hari
  | { kind: "hapus_rework"; activity: string; pct: number }                  // (b)
  | { kind: "lewati_aktivitas"; activity: string; filter: { attribute: "unit" | "kategori"; value: string } | null }; // (c)
interface ScenarioResult { n: number; affected: number; before: { median: number; p90: number }; after: { median: number; p90: number }; smallSample: boolean }
interface Scenario { id: string; projectId: string; name: string; spec: ScenarioSpec; datasetVersion: string; contextPack: string; status: "estimasi"; result: ScenarioResult; createdBy: string; createdAt: string }

interface TrialProposal {
  id: string; projectId: string; findingId: string; candidateId: string; status: "draf";
  action: string; scope: string; durationWeeks: number | null;
  successMetric: string; baseline: { label: string; value: number; unit: string }[];    // diisi kode
  target: string; guardrails: string[]; owner: string; risks: string[]; stopConditions: string[];
  createdBy: string; createdAt: string; updatedAt: string;
}
```

`MockState` mendapat `recFindings`, `recCandidates`, `priorityPolicies` (semua versi, terbaru = versi tertinggi per proyek), `scenarios`, `trials`. Kumpulan kasus untuk skenario (`lib/mock/rec-cases.ts`) adalah fixture statis, bukan state.

## Logika murni (`lib/mock/recommend.ts`, baru, tanpa React)

- `DEFAULT_WEIGHTS = { relevance: .30, magnitude: .30, certainty: .15, effort: .15, risk: .10 }`.
- `validateCandidate(c, finding, ctx: { memberRoles: string[] }): { status: ValidationStatus; checks: { key: CheckKey; result: CheckResult; reason: string }[]; missing: { what: string; from: string }[] }`. Lima pemeriksaan selalu semuanya muncul:
  1. `syarat`: setiap kondisi dihitung dari `finding.metrics`. Semua benar → lolos; ada salah → `gagal`; metrik tidak ada → `tidak_dapat_diperiksa` (missing "Metrik {key}", dari "M06").
  2. `angka`: setiap `refMetrics` ada di `finding.metrics` dan selisih relatif ≤ 1%. Tidak ada → `gagal`.
  3. `versi`: setiap `refs.version` sama dengan `finding.activeRefs[key]`. Beda atau hilang → `gagal` dengan alasan "acuan telah diperbarui (v{a} → v{b})".
  4. `kewenangan`: `ownerRole` terisi dan ada di `ctx.memberRoles`. `ownerRole` kosong → `tidak_dapat_diperiksa`; tidak ada anggota → `gagal`.
  5. `jev`: `otomatis`/`dikonfirmasi` dengan kesimpulan relevan atau sebagian relevan → lolos; `perlu_review` → `gagal`; `belum_dinilai`/`informasi_tidak_cukup` → `tidak_dapat_diperiksa`; kesimpulan `tidak_relevan` → `gagal`.
  - Status akhir, urutan prioritas aturan: `syarat` gagal → `tidak_memenuhi_syarat`; `syarat` atau `jev` `tidak_dapat_diperiksa` → `belum_layak_dinilai`; sisanya ada `gagal` atau `tidak_dapat_diperiksa` → `perlu_review`; selain itu `tervalidasi`. `missing` dikumpulkan dari setiap `tidak_dapat_diperiksa`, dengan sumber modul (M04, M06, M08).
- `priorityBreakdown(c, finding, policy): { components: { key; label; raw: number | null; weight: number; contribution: number | null }[]; total: number; partial: boolean; available: number }`:
  - `relevance = jev.score / 100`; `magnitude = clamp(affectedShare × waitShare, 0, 1)`; `certainty = jev.prob × min(1, supportCases / 30)`; `effort = (effort − 1) / 4`; `risk = (risk − 1) / 4`.
  - `contribution = +weight × raw` untuk tiga komponen pertama, `−weight × raw` untuk usaha dan risiko. Komponen `raw = null` (usaha/risiko kosong, atau Jev belum dinilai) **tidak diisi bawaan**: `contribution = null`, tidak masuk total. `total = Σ contribution` komponen tersedia, dibulatkan 3 desimal. `partial = available < 5`.
- `rankCandidates(items: { c; v: ValidationResult; b: PriorityBreakdown }[]): { ranked: …[]; unranked: …[] }`: hanya `tervalidasi` yang diurutkan, `total` menurun, seri dipecah `candidate.id` menaik (deterministik). Selain itu masuk `unranked`.
- `compareRanks(before: string[], after: string[]): { id: string; from: number | null; to: number | null; delta: number }[]`.
- `validateWeights(w): { ok: boolean; sum: number }`: tiap bobot 0–1; jumlah boleh berapa saja tetapi ditampilkan; tidak dinormalisasi (rumus PRD mengurangkan usaha/risiko). Peringatan lunak bila jumlah ≠ 1,00.
- `buildBaseline(c, finding): TrialProposal["baseline"]`: metrik finding yang namanya ada di `c.conditions` atau `c.refMetrics`, tanpa duplikat.
- `percentile(values, p)`: interpolasi linear (tipe 7); median = `percentile(…, 50)`. Definisi ini ditulis di UI dan tes.
- `runScenario(spec, cases): ScenarioResult` (`lib/mock/scenario.ts`, baru): menyesuaikan **durasi agregat kasus** saja, bukan stempel waktu event.
  - `kurangi_jeda`: `d' = d − gap[transition] × pct/100` untuk kasus yang punya transisi itu.
  - `batasi_jeda`: `gap' = min(gap, maxDays)`, `d' = d − (gap − gap')`; terdampak hanya bila `gap > maxDays`.
  - `hapus_rework`: kasus dengan `rework[activity] > 0` terdampak; sebanyak `pct%` terdampak pertama (urutan `id`) dihilangkan reworknya, `d' = d − rework`.
  - `lewati_aktivitas`: kasus memenuhi filter dan punya aktivitas, `d' = d − activityDays[activity]`.
  - `affected` = kasus yang durasinya berubah; `smallSample = affected < 30`. Durasi tidak pernah di bawah 0.
  - Jenis kapasitas/antrean tidak ada di `ScenarioSpec`; UI menampilkan opsi "Tambah kapasitas" nonaktif "memerlukan simulasi (Fase 2)".
- `SCENARIO_DISCLAIMER = "Estimasi aritmetika pada kasus historis; mengabaikan efek kapasitas, antrean, dan perubahan perilaku."`

## Seed (`lib/mock/rec-data.ts` dan `rec-cases.ts`, baru)

Proyek `p-p2p`. Satu temuan utama "Persetujuan menumpuk pada satu approver" (metrik: `wait_days_p90` 9,4 hari; `cases_affected` 312; `approval_load` 71 persen) dan satu temuan kedua "Rework pada Change Approval" dengan tiga kandidat. Temuan utama punya tujuh kandidat katalog dan satu tambahan analis:

| Kandidat | Hasil yang harus muncul |
|---|---|
| Delegasi persetujuan di bawah batas nilai | `tervalidasi`, lengkap, usaha 2 risiko 2 |
| Tambah approver cadangan | `tervalidasi`, usaha 3 risiko 1 |
| Otomatisasi persetujuan nilai kecil | `tervalidasi`, usaha 4 risiko 3, relevansi tertinggi |
| Batas waktu persetujuan + eskalasi | `tervalidasi`, **usaha dan risiko kosong** (komponen dikeluarkan, ditandai) |
| Audit pola persetujuan tengah malam | `belum_layak_dinilai` (metrik `after_hours_share` belum ada, dari M06; Jev belum dinilai) |
| Pecah vendor besar | `tidak_memenuhi_syarat` (kondisi `vendor_concentration >= 0,6` salah) |
| Rotasi approver mingguan | `perlu_review` (rujukan kebijakan v2 vs aktif v3; "acuan telah diperbarui") |
| Tambahan analis: "Pindahkan persetujuan ke awal pekan" | `perlu_review` (Jev `perlu_review`), ditandai "tambahan analis" |

Kebijakan awal `v1` bobot bawaan. Dataset skenario: 240 kasus, dibangkitkan deterministik (PRNG bertabur tetap) dengan durasi 6–40 hari, jeda transisi "Create PO → Approve PO" 0–14 hari, rework "Change Approval" pada ±22% kasus, atribut `unit` (3 nilai) dan `kategori` (3 nilai); `datasetVersion` "snapshot-2026-09" dan `contextPack` "ctx-v3". Satu skenario tersimpan di seed ("Jeda Create PO → Approve PO turun 50%"). Satu draf pilot di seed dengan baseline terisi, target kosong. Semua teks diberi label "Data contoh".

## Reducer (`lib/mock/rec-reducer.ts`, baru, pola `rules-reducer`)

Semua aksi: peran `rec.edit`, proyek `aktif`, tidak melempar, galat string Indonesia, tepat satu `AuditEvent` per sukses.

- `rec/addCandidate { projectId; findingId; input }`: `name`, `description`, `addresses`, `successMetric` wajib (trim); `origin: "analis"`; `proposeToCatalog` opsional; kondisi/usaha/risiko boleh kosong.
- `rec/savePolicy { projectId; weights; note }`: `validateWeights` ok; bobot identik dengan versi terbaru → galat "Tidak ada perubahan"; membuat versi `n + 1`.
- `rec/runScenario { projectId; name; spec }`: validasi parameter (persen 1–100, hari ≥ 0, nama transisi/aktivitas ada di fixture); membuat `Scenario` `estimasi` dengan hasil `runScenario`.
- `rec/createTrial { projectId; findingId; candidateId }`: hanya untuk kandidat berstatus `tervalidasi`; mengisi `action`, `successMetric`, `baseline`, `owner` (= `ownerRole`) dari kandidat; satu draf per kandidat per temuan (duplikat → galat).
- `rec/updateTrial { trialId; patch }`: hanya bidang yang diisi analis (cakupan, durasi, target, guardrail, pemilik, risiko, kondisi penghentian); `baseline` dan `successMetric` tidak dapat ditimpa.

Helper: `findingsForProject`, `candidatesForFinding`, `latestPolicy(s, projectId)`, `evaluateFinding(s, findingId)` (menggabungkan validasi, rincian, dan peringkat dengan kebijakan terbaru).

## Layar

Rute di `projects/[projectId]/recommendations/`. Tab proyek "Rekomendasi" (ikon `Lightbulb`, hitungan = jumlah temuan). Komponen `RecTabs`. Banner "Data contoh" di layar utama.

1. **`/recommendations`, Temuan.** Kartu per temuan: judul, ringkasan, angka M06 utama, hitungan kandidat per status validasi (pill), tombol "Buka".
2. **`/recommendations/[findingId]`, Kandidat dan prioritas.** Kartu ringkas temuan di atas. Tabel peringkat (hanya `tervalidasi`): peringkat, nama (asal: katalog / "tambahan analis"), skor Jev, skor prioritas, **bilah bertumpuk rincian kontribusi** (positif dan negatif) dengan legenda, dan tanda "Berdasarkan {n}/5 komponen" bila `partial`. Di bawahnya tabel "Belum diperingkat": status (pill) + ringkasan alasan. Klik baris membuka panel samping: daftar lima pemeriksaan (ikon + teks lolos/gagal/tidak dapat diperiksa + alasan), "Informasi yang kurang" (apa, dari modul mana), tabel rincian skor dengan rumus terbuka, hasil Jev, prasyarat dan pengecualian. Kotak centang pada baris (maks 4) mengaktifkan "Bandingkan". Tombol (berizin): "Tambah kandidat" (modal: nama, deskripsi, hipotesis yang ditangani, metrik keberhasilan, usaha/risiko opsional, kotak "Usulkan masuk katalog"), "Susun usulan uji coba" pada kandidat tervalidasi, "Jalankan skenario" yang membuka form dengan temuan terisi.
3. **`/recommendations/[findingId]/compare?ids=a,b`**, 2–4 kolom: masalah yang ditangani, besaran masalah (kasus terdampak, kontribusi waktu tunggu), hasil Jev, prasyarat, kewenangan, usaha/risiko ("belum tersedia" bila kosong), pengecualian, informasi kurang. Tiap baris menaut ke "Bukti" (tiruan: temuan M06, paket bukti M07 nonaktif, aturan M04). Ids tidak valid atau di luar 2–4 → pesan dan tautan kembali.
4. **`/recommendations/policy`, Kebijakan prioritas.** Rumus ditulis lengkap; lima bidang bobot (angka); jumlah bobot dengan peringatan lunak; catatan perubahan; tombol "Simpan versi baru". Di bawah tombol, pratinjau langsung: urutan kini vs urutan dengan bobot yang sedang diedit (`compareRanks`: naik/turun/tetap) untuk temuan yang dipilih. Riwayat versi (tabel). Pemilik proses hanya baca.
5. **`/recommendations/scenarios`**, daftar skenario (nama, jenis, parameter, kasus terdampak, median/P90 sebelum → sesudah, status `estimasi`) dan form "Skenario baru": jenis (empat opsi, kelima "Tambah kapasitas" nonaktif), parameter menurut jenis, nama. **`/scenarios/[scenarioId]`**: parameter, versi dataset dan paket konteks, kartu sebelum/sesudah (median, P90, selisih), kasus terdampak, label "sampel kecil" bila perlu, definisi persentil, keterangan `SCENARIO_DISCLAIMER` selalu tampil di atas hasil, lencana "Estimasi, bukan hasil aktual".
6. **`/recommendations/trials`**, daftar draf (kandidat, temuan, status `draf`). **`/trials/[trialId]`**: bagian baca-saja berlabel "Diisi otomatis" (tindakan, metrik keberhasilan, baseline) dan bagian editable (cakupan, durasi, target, guardrail, pemilik, risiko, kondisi penghentian). Pengingat: "Draf sampai diputuskan di M11; narasi dibuat M10."

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Card/Table/Pill/Banner/NoraModal yang ada. Nilai data dirender sebagai teks; status punya ikon dan teks (bukan warna saja); bilah rincian punya label angka. Tidak ada gulir horizontal di 1280px dan 1024px.

## Pengujian

- `recommend.test.ts`: tiap pemeriksaan lolos/gagal/tidak dapat diperiksa; prioritas status akhir (`syarat` gagal mengalahkan lainnya, `tidak_dapat_diperiksa` pada syarat/jev → `belum_layak_dinilai`); `missing` memuat sumber modul; `priorityBreakdown` dengan hitungan tangan (nilai tetap), komponen kosong tidak diisi bawaan dan `partial`; `rankCandidates` deterministik (urutan masukan diacak, hasil sama; seri dipecah id); `compareRanks`; `validateWeights`; `buildBaseline`.
- `scenario.test.ts`: `percentile` pada deret kecil dengan jawaban tangan; setiap jenis skenario terhadap fixture kecil 10 kasus dengan hasil referensi hitung tangan (toleransi 0,1%); `batasi_jeda` hanya mengubah gap > N; `hapus_rework` pct; filter `lewati_aktivitas`; sampel kecil (<30); durasi tidak negatif; dataset 240 kasus selesai < 1 detik.
- `rec-reducer.test.ts`: izin per peran dan status proyek, validasi tiap aksi, `addCandidate` bertanda "analis", `savePolicy` menambah versi dan menolak identik, `createTrial` hanya tervalidasi dan tanpa duplikat, `updateTrial` tidak menimpa baseline, satu audit per sukses, id tak dikenal tidak melempar.
- `permissions.test.ts` diperluas; `seed.test.ts`: demo menghasilkan keempat status dan urutan awal tetap.
- Verifikasi manual di browser (1280px dan 1024px), tiga peran, proyek tidak aktif, alur: buka temuan, ubah bobot, bandingkan, skenario, susun pilot.

## Struktur berkas (baru/ubah)

`lib/mock/{recommend,scenario,rec-data,rec-cases,rec-reducer}.ts` + `recommend.test.ts`, `scenario.test.ts`, `rec-reducer.test.ts` (baru); `lib/mock/{types,permissions,store,reducer,data}.ts` (tambahan state, aksi, seed); `components/project/{rec-tabs,validation-pill,score-breakdown,candidate-panel,add-candidate-modal,compare-table,policy-editor,scenario-form,scenario-result,trial-form}.tsx` (baru); rute `recommendations/{page,policy/page,scenarios/page,scenarios/[scenarioId]/page,trials/page,trials/[trialId]/page,[findingId]/page,[findingId]/compare/page}.tsx` (baru); `[projectId]/layout.tsx` (tab "Rekomendasi").
