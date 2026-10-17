# Spec: M08 frontend, Penilaian kandidat hipotesis (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M08](../../prd/m08-klasifikasi-penilaian-terstruktur-prd.md), Story 3, 4, dan 5, Fitur 4, dan "Definisi MVP". Dibangun di atas `feat/m05a-frontend` (berisi M01–M04c dan spec M05a). M08 dipecah: **M08a penilaian relevansi kandidat, antrean review, koreksi (spec ini)**, M08b set acuan dan evaluasi (Story 6), M08c klasifikasi aktivitas dan catatan teks (Story 1–2), M08d editor spesifikasi pertanyaan. Tidak ada backend, worker, atau panggilan ke Jev; semua hasil berasal dari fixture tiruan.

## Tujuan

Untuk satu indikasi bottleneck, analis melihat lima kandidat hipotesis dari katalog yang sudah "dinilai Jev": alur Noul (bukti cukup?) → Score per kriteria → Choice (relevansi), skor total dihitung **kode** dari bobot rubrik, probabilitas terlihat, paket bukti dirujuk. Hasil yang tidak pasti masuk antrean `perlu_review`; analis mengoreksinya tanpa menimpa hasil model.

**Berhasil bila:**

1. Proyek punya tab "Penilaian" dengan daftar temuan dan halaman temuan yang menampilkan kandidat beserta status, skor total, dan label "Dinilai model".
2. Status diturunkan oleh kode dari ambang (bawaan 0,6) dan margin (bawaan 0,15); diuji unit.
3. Skor total = jumlah berbobot skor kriteria, tampil dengan rincian; diuji unit.
4. Koreksi analis tersimpan sebagai catatan terpisah, hasil model tidak berubah, nilai efektif menampilkan keduanya.
5. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Set acuan dan evaluasi (M08b), klasifikasi aktivitas dan catatan teks (M08c), editor spesifikasi pertanyaan dan pengaturan ambang per tugas (M08d, ambang bawaan hanya konstanta), pembuatan temuan (M06) dan katalog sungguhan (M04: data di sini tiruan milik M08), paket bukti sungguhan (M07: hanya tautan tiruan), batas harian biaya, adapter HTTP atau `FixtureAdapter` sungguhan, backend.

Catatan: nama temuan, kandidat, dan kriteria adalah karangan untuk demo dan diberi label "data contoh". Tidak ada dependensi baru.

## Peran dan izin

Aksi UI baru di `permissions.ts`:

| Aksi | Peran |
|---|---|
| `assessment.view` | administrator, analis, pemilik_proses |
| `assessment.run` (jalankan penilaian) | analis |
| `assessment.correct` (koreksi, konfirmasi) | analis |

Pemilik proses hanya melihat. Administrator hanya melihat, sama seperti `rule.edit`. Jalankan penilaian dan koreksi hanya saat proyek `aktif` (`acceptsData`). Entri audit baru: `penilaian.jalankan`, `penilaian.koreksi`, `penilaian.konfirmasi`.

## Model data (`lib/mock/types.ts`, tambahan)

```ts
type AssessmentStatus = "otomatis" | "perlu_review" | "informasi_tidak_cukup" | "gagal" | "tertunda";
type Relevance = "relevan" | "sebagian_relevan" | "tidak_relevan" | "informasi_tidak_cukup";

interface Criterion { key: string; label: string; weight: number /* bobot, jumlah 1 per kandidat */; scale: { level: number; definition: string }[] /* 1..5 */ }
interface Candidate { id: string; kind: "hipotesis" | "intervensi"; name: string; criteria: Criterion[]; applicable: boolean; notApplicableReason?: string }
interface Finding { id: string; projectId: string; title: string; summary: string; candidateIds: string[]; evidenceBundleId: string }

interface CriterionScore { key: string; level: number; probs: number[] /* panjang 5, jumlah 1 */ }
interface Assessment {
  id: string; projectId: string; findingId: string; candidateId: string;
  status: AssessmentStatus;
  sufficient: { prob: number };                          // Noul: probabilitas "cukup"
  scores: CriterionScore[];                              // Score per kriteria
  relevance: { probs: Record<Relevance, number> };       // Choice: distribusi
  modelId: string; specVersion: number; evidenceBundleId: string; runId: string; createdAt: string;
  rawOutputRef: string;                                  // tautan tiruan ke keluaran mentah
  supersededBy?: string;                                 // id hasil yang menggantikannya; tampilan hanya memakai hasil tanpa supersededBy
}
interface AssessmentCorrection { id: string; assessmentId: string; actorId: string; at: string; relevance: Relevance; reason: string; addToGoldSet: boolean; confirmedOnly: boolean }
```

`confirmedOnly` = konfirmasi tanpa mengubah nilai (relevansi baru sama dengan hasil model). `MockState` mendapat `findings`, `candidates`, `assessments`, `corrections`. `Assessment.status` adalah nilai yang disimpan saat run; `perlu_review`/`otomatis` **dihitung** dari probabilitas dan ambang oleh `deriveStatus` saat run (lihat bawah) dan tidak dihitung ulang kecuali run diulang.

## Logika murni (`lib/mock/assessment.ts`, baru)

- `THRESHOLDS = { sufficient: 0.5, topProb: 0.6, margin: 0.15 }`. Konstanta; tidak ada UI untuk mengubahnya di M08a.
- `totalScore(scores, criteria): number`: `Σ (level_i − 1) / 4 × weight_i × 100`, dibulatkan satu desimal (skala 0–100). Kriteria tanpa skor diabaikan dan bobotnya dinormalisasi ulang; tanpa skor sama sekali → `null`. Bobot dibaca dari kandidat saat tampil.
- `topTwo(probs): { top: [key, p]; second: [key, p]; margin: number }`.
- `deriveStatus(input: { sufficientProb: number; relevanceProbs: Record<Relevance, number>; failed?: boolean; pending?: boolean }): AssessmentStatus`:
  1. `failed` → `gagal`; `pending` → `tertunda`.
  2. `sufficientProb < THRESHOLDS.sufficient` → `informasi_tidak_cukup`.
  3. probabilitas teratas `< topProb` atau selisih dengan kedua `< margin` → `perlu_review`.
  4. selain itu `otomatis`.
- `effective(assessment, corrections): { relevance: Relevance; source: "model" | "analis"; correction?: AssessmentCorrection }`: koreksi terbaru (waktu `at` terbaru, seri: indeks belakang) bila ada, selain itu argmax distribusi model. Hasil `Assessment` tidak pernah diubah.
- `reviewQueue(state, projectId, filter: { findingId?; status? }): Assessment[]`: hasil berstatus `perlu_review`, `informasi_tidak_cukup`, `gagal`, `tertunda` yang **belum** punya koreksi, diurut: `gagal`, `perlu_review` (margin terkecil dulu), `informasi_tidak_cukup`, `tertunda`. Filter findingId/status opsional.
- `summarize(state, findingId)`: hitungan per status dan jumlah terkoreksi.
- `runFixture(finding, candidates, ctx): Assessment[]`: fixture deterministik per pasangan (kandidat `applicable=false` **dilewati**, tidak dikirim, tidak menghasilkan hasil; ditampilkan sebagai "tidak dinilai" dengan `notApplicableReason`). Probabilitas dan skor diambil dari tabel fixture tetap di `lib/mock/assessment-data.ts` agar demo stabil, bukan acak. Status diturunkan dengan `deriveStatus`. `runId` baru tiap run; `specVersion` 1, `modelId` "jev-demo-fixture".

## Seed (`lib/mock/assessment-data.ts`, baru)

Satu proyek berisi dua temuan: "Persetujuan menumpuk pada satu approver" (lima kandidat dinilai, satu tidak dapat dinilai karena syarat penerapan tidak terpenuhi, total enam) dan "Rework pada Change Approval" (tiga kandidat). Setiap kandidat punya 3–4 kriteria berbobot dengan skala 1–5 beserta definisi. Distribusi fixture memberi: ≥2 `otomatis` dengan relevansi berbeda, 1 `perlu_review` (margin sempit), 1 `informasi_tidak_cukup`, dan di temuan kedua 1 `gagal`. Hasil sudah ada di seed (batch "sudah dijalankan" agar demo langsung tampil). Temuan kedua sengaja **tanpa** hasil untuk kandidat ketiga (`c9`) agar tombol "Jalankan penilaian" punya pekerjaan di demo; tombol itu menjalankan `scope: "belum_dinilai"`, atau `"semua"` (dengan konfirmasi) bila diulang.

## Reducer (`lib/mock/assessment-reducer.ts`, baru, pola `rules-reducer`)

Aksi: `assessment/run { projectId, findingId, scope: "belum_dinilai" | "semua" }`, `assessment/correct { assessmentId, relevance, reason, addToGoldSet }`, `assessment/confirm { assessmentId }`.

- `run`: ditolak bila peran tidak berizin, proyek tidak `aktif`, atau temuan tidak ditemukan. `scope: "belum_dinilai"` hanya menilai kandidat yang belum punya hasil; `"semua"` menilai ulang semua. Hasil baru menggantikan hasil lama kandidat yang sama: hasil lama diberi `supersededBy` = id hasil baru dan dipertahankan sebagai riwayat; **koreksi lama tetap tersimpan** dan tetap merujuk `assessmentId` lamanya. Semua tampilan memakai hasil yang `supersededBy`-nya kosong; riwayat di M08a cukup disimpan dan tidak ditampilkan. Audit `penilaian.jalankan`.
- `correct`: wajib `reason` tidak kosong (maks 500 karakter) dan `relevance` valid; menambah `AssessmentCorrection`, tidak mengubah `Assessment`. Audit `penilaian.koreksi`. Validasi dengan Zod di `schemas.ts`.
- `confirm`: koreksi dengan `confirmedOnly: true` dan relevansi = argmax model; alasan otomatis "Dikonfirmasi analis". Audit `penilaian.konfirmasi`.
- Semua mengembalikan `ReduceResult` dengan galat bahasa Indonesia; tidak melempar.

## Layar

Tab proyek baru "Penilaian" (ikon `ClipboardText`, karena `Scales` sudah dipakai tab Konteks; hitungan = jumlah hasil dalam antrean review). Rute di `projects/[projectId]/assessments/`.

1. **Daftar temuan** (`page.tsx`). Kartu per temuan: judul, ringkasan, "{n} kandidat", hitungan per status (pill), tombol "Buka". Banner "Data contoh; penilaian oleh model, belum dikonfirmasi analis". Tab internal "Temuan" / "Antrean review" (hitungan).
2. **Halaman temuan** (`[findingId]/page.tsx`). Header: judul, ringkasan, versi spesifikasi dan model, tombol "Jalankan penilaian" (hanya berizin dan proyek aktif; konfirmasi bila hasil sudah ada). Tabel kandidat: nama, jenis, status (pill), skor total (0–100) beserta bilah, relevansi efektif + sumber ("model" / "analis"), probabilitas teratas, label **"Dinilai model"** sampai ada koreksi/konfirmasi. Kandidat tidak dapat dinilai: baris abu-abu, "Tidak dinilai" + alasan. Klik baris membuka panel detail.
3. **Panel detail kandidat** (panel samping, tidak halaman baru). Tiga bagian berurutan: (1) "Bukti cukup?" Noul: probabilitas dan ambang; (2) "Skor per kriteria": tabel kriteria, bobot, tingkat terpilih dengan definisinya, mini-distribusi 5 tingkat, lalu baris **Skor total** dengan rumus terbuka ("Σ (tingkat−1)/4 × bobot, dihitung aplikasi"); (3) "Relevansi": distribusi empat opsi sebagai bilah dengan angka, opsi teratas dan kedua ditandai, selisih margin. Di bawah: tautan "Paket bukti" (tiruan, nonaktif dengan keterangan M07), `modelId`, `specVersion`, `runId`, waktu, "Keluaran mentah" (tautan tiruan). Bila ada koreksi: kartu "Koreksi analis" (pelaku, waktu, nilai baru, alasan) berdampingan dengan "Hasil model"; nilai efektif dinyatakan jelas.
4. **Form koreksi** (modal `NoraModal`, hanya `assessment.correct`). Radio empat opsi relevansi, kolom alasan wajib (hitung karakter 500), kotak centang "Masukkan ke set acuan evaluasi" (disimpan, belum dipakai sampai M08b). Tombol "Simpan koreksi", plus "Konfirmasi hasil model" di panel untuk status `otomatis`/`perlu_review`.
5. **Antrean review** (tab di daftar temuan, `queue` sebagai query ringan `?tab=antrean`). Tabel hasil dalam `reviewQueue`: temuan, kandidat, status, opsi teratas dan kedua dengan probabilitas, tautan ke panel. Filter temuan dan status (select). Kosong → "Tidak ada hasil yang perlu ditinjau".

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Card/Table/Pill/Banner/NoraModal yang ada. Nilai dari data dirender sebagai teks. Tidak ada gulir horizontal di 1280px dan 1024px. Status punya warna dan teks (bukan warna saja); bilah probabilitas punya label angka untuk pembaca layar.

## Pengujian

- `assessment.test.ts`: `totalScore` (bobot, pembulatan, kriteria hilang dinormalisasi, kosong → null); `deriveStatus` (setiap cabang, batas persis 0,5 / 0,6 / 0,15, `failed` dan `pending` menang); `effective` (koreksi terbaru menang, tanpa koreksi → argmax, hasil asli tidak termutasi); `reviewQueue` (yang terkoreksi keluar, urutan, filter); `runFixture` (kandidat tidak berlaku dilewati, deterministik, status sesuai ambang).
- `assessment-reducer.test.ts`: izin per peran dan status proyek, validasi alasan, koreksi tidak mengubah hasil, `confirm`, `run` mempertahankan koreksi lama, audit tertulis.
- `schemas.test.ts` diperluas untuk skema koreksi.
- Verifikasi manual di browser pada 1280px dan 1024px: tiga peran, proyek tidak aktif, alur koreksi lengkap dari antrean.

## Struktur berkas (baru/ubah)

`lib/mock/{assessment,assessment-data,assessment-reducer}.ts` + dua berkas uji (baru), `lib/mock/{types,schemas,permissions,store,reducer,data}.ts` (tambahan state, aksi, seed), `components/project/{assessment-tabs,candidate-table,candidate-panel,probability-bars,correction-modal,review-queue}.tsx` (baru), rute `assessments/page.tsx` dan `assessments/[findingId]/page.tsx` (baru), `[projectId]/layout.tsx` (tab "Penilaian").
