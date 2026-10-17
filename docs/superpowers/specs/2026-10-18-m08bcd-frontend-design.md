# Spec: M08b/c/d frontend, Klasifikasi, evaluasi, spesifikasi (data tiruan)

Tanggal: 18 Oktober 2026. Status: disetujui desainer lewat instruksi "selesaikan sampai modul selesai, tanpa konfirmasi" (18 Okt 2026).

Acuan: [PRD M08](../../prd/m08-klasifikasi-penilaian-terstruktur-prd.md) Story 1, 2, 6 dan Fitur 1, 5; melanjutkan [spec M08a](2026-10-18-m08-frontend-design.md). Dibangun di atas `feat/m08-frontend` (M08a). Frontend saja dengan data tiruan; tanpa backend, adapter HTTP, atau panggilan ke Jev.

## Tujuan

Melengkapi modul M08 di sisi frontend: (c) klasifikasi semantik aktivitas dan catatan teks sintetis dengan status ketidakpastian, antrean tinjau, dan koreksi; (b) set acuan berlabel dan laporan evaluasi (akurasi, macro-F1, kalibrasi, kesepakatan pelabel, cakupan otomatis) per tugas; (d) spesifikasi pertanyaan berversi (pertanyaan, kategori, ambang) yang dapat disunting analis.

**Berhasil bila:**
1. Tab "Klasifikasi" menampilkan 20 aktivitas dan 16 catatan sintetis dengan kategori teratas, kedua, probabilitas, dan status; analis dapat menjalankan, mengoreksi, dan mengonfirmasi.
2. Tab "Evaluasi" menampilkan set acuan per tugas (relevansi, aktivitas, catatan), laporan metrik yang dihitung kode, diagram reliabilitas, dan riwayat evaluasi per versi model dan spesifikasi.
3. Tab "Spesifikasi" menyimpan perubahan sebagai versi baru; hasil dari versi lama diberi tanda "Spesifikasi telah diperbarui".
4. Koreksi bertanda "masukkan ke set acuan" menambah item set acuan.
5. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Backend, Temporal, adapter Jev nyata, pemicu batch otomatis dari M06, penyesuaian ambang otomatis, ekspor laporan, fitur "perlu data teks dari matriks M03" (catatan sintetis selalu aktif dengan banner label sintetis), Escape/fokus panel (catatan M08a), menjalankan ulang evaluasi otomatis saat spesifikasi berubah.

## Tipe baru (`lib/mock/types.ts`)

```ts
type TaskKind = "relevansi" | "aktivitas" | "catatan";
type ClassStatus = "otomatis" | "perlu_review" | "gagal";
interface SpecCategory { key: string; label: string; definition: string }
interface Thresholds { sufficient: number; topProb: number; margin: number }
interface QuestionSpec { id: string; projectId: string; task: TaskKind; version: number; question: string; categories: SpecCategory[]; thresholds: Thresholds; note?: string; createdBy: string; createdAt: string }
interface ClassItem { id: string; projectId: string; task: "aktivitas" | "catatan"; text: string; context: string; synthetic: boolean; activity?: string; period?: string }
interface ClassResult { id: string; projectId: string; itemId: string; task: "aktivitas" | "catatan"; specVersion: number; modelId: string; runId: string; at: string; probs: Record<string, number>; status: ClassStatus; supersededBy?: string }
interface ClassCorrection { id: string; resultId: string; actorId: string; at: string; category: string; reason: string; confirmedOnly: boolean }
interface GoldItem { id: string; projectId: string; task: TaskKind; itemRef: string; label: string; labeler: string; labelB?: string; labelerB?: string; createdAt: string }
interface Bin { lo: number; hi: number; n: number; meanConf: number; accuracy: number | null }
interface EvaluationRun { id: string; projectId: string; task: TaskKind; at: string; actorId: string; modelId: string; specVersion: number; n: number; excluded: number; accuracy: number; macroF1: number; autoCoverage: number; autoAccuracy: number | null; reviewShare: number; highConf: { n: number; accuracy: number | null }; kappa: number | null; bins: Bin[] }
```

`itemRef`: untuk `relevansi` = `"{findingId}:{candidateId}"`; untuk `aktivitas`/`catatan` = `ClassItem.id`. `MockState` mendapat `specs`, `classItems`, `classResults`, `classCorrections`, `goldItems`, `evaluations`.

## Aturan dan konstanta

- Kategori aktivitas bawaan (versi 1): `persetujuan`, `pembuatan`, `perubahan`, `pembatalan`, `penerimaan`, `pencatatan_dokumen`, `pembayaran`, `lainnya`. Taksonomi alasan catatan (versi 1): `harga_tidak_sesuai`, `kuantitas_tidak_sesuai`, `dokumen_kurang`, `vendor_salah`, `lainnya`. Relevansi memakai empat opsi tetap M08a (kategori tidak dapat disunting; hanya pertanyaan dan ambang).
- Ambang bawaan semua tugas: `{ sufficient: 0.5, topProb: 0.6, margin: 0.15 }`. Klasifikasi tidak memakai `sufficient`. Status klasifikasi: `gagal` bila fixture gagal, `perlu_review` bila teratas `< topProb` atau selisih `< margin`, selain itu `otomatis` (batas persis lolos, toleransi 1e-9).
- Ambang aktif tugas = ambang `QuestionSpec` versi terbaru tugas itu. `deriveStatus` M08a menerima ambang opsional (default `THRESHOLDS`). Status tersimpan tidak dihitung ulang kecuali run diulang.
- Target PRD ditampilkan sebagai "Target [perlu validasi Javan]": akurasi aktivitas ≥ 85%, kesesuaian relevansi ≥ 70%, akurasi pada probabilitas ≥ 0,8 minimal 80%, bagian `perlu_review` ≤ 30%.

## Evaluasi (`lib/mock/evaluation.ts`, murni)

Pasangan evaluasi per item set acuan: prediksi = argmax model (hasil terkini, bukan nilai efektif), keyakinan = probabilitas teratas, `auto` = status `otomatis`. Relevansi: hasil terkini ber-`hasModelVerdict`; item tanpa hasil atau tanpa verdict (gagal/tertunda) dikecualikan dan dihitung di `excluded`. Metrik: akurasi; macro-F1 atas label yang muncul di set acuan atau prediksi (F1 kelas tanpa presisi dan recall = 0); `autoCoverage` = bagian item `otomatis`; `autoAccuracy` = akurasi pada item `otomatis` (null bila tak ada); `reviewShare` = bagian item non-`otomatis` dari seluruh item hasil terkini tugas itu; `highConf` untuk keyakinan ≥ 0,8; `bins` dengan tepi `[0, 0.4, 0.6, 0.8, 0.9, 1.0]` (bin terakhir inklusif 1.0); kappa Cohen atas item yang punya `label` dan `labelB`, null bila kurang dari 2 item atau pembagi nol. Label kanonis item = `label` (pelabel pertama).

## Data seed

- 20 aktivitas p-p2p dan 16 catatan sintetis (`synthetic: true`), proyek `p-p2p`, hasil seed dari run `run-seed-cls`, `specVersion` 1, `modelId` "jev-demo-fixture". Tabel probabilitas aktivitas dan kecocokan label ada di plan Task 2. Catatan: Bahasa Indonesia, 12 jelas, 2 ambigu (`perlu_review`), 2 yakin tetapi salah menurut set acuan; terkait aktivitas "Change Approval for Purchase Order" atau "Record Goods Receipt" dan periode `2026-07`, `2026-08`, `2026-09`.
- Set acuan seed: relevansi 6 item (c1, c2, c3, c4, c5, c7 temuan `f-bottleneck`/`f-rework` sesuai kandidat), aktivitas 20, catatan 16, semua dilabeli `u-dimas`; dua belas item aktivitas punya `labelB` oleh `u-anton` dengan 2 ketidaksetujuan.
- Seed menghasilkan: akurasi relevansi 5/6, aktivitas 16/20, catatan 14/16 (diuji).
- Spesifikasi seed: satu `QuestionSpec` versi 1 per tugas.

## Aksi reducer

`runClassification { projectId, task, scope: "belum_dinilai" | "semua" }`, `correctClass { resultId, category, reason, addToGoldSet }`, `confirmClass { resultId }`, `setGoldLabel { projectId, task, itemRef, label }` (tidak ada item: buat dengan `labeler` = penampil; penampil = `labeler`: ubah `label`; penampil lain: set `labelB`/`labelerB`), `removeGoldItem { goldId }`, `runEvaluation { projectId, task }`, `saveSpec { projectId, task, question, categories, thresholds, note? }`. `correctAssessment` M08a dengan `addToGoldSet` true juga membuat/memperbarui item set acuan relevansi (label = relevansi koreksi). Izin: `classify.run`, `classify.correct`, `gold.edit`, `evaluation.run`, `spec.edit` hanya analis; `classify.view`, `gold.view`, `evaluation.view`, `spec.view` semua peran. Aksi tulis hanya saat proyek `aktif`. Audit: `klasifikasi.jalankan`, `klasifikasi.koreksi`, `klasifikasi.konfirmasi`, `acuan.simpan`, `acuan.hapus`, `evaluasi.jalankan`, `spesifikasi.simpan`.

Validasi `saveSpec`: pertanyaan wajib (≤ 300 karakter); klasifikasi minimal 2 kategori, label wajib, kunci unik (slug dari label, huruf kecil dan garis bawah), definisi opsional ≤ 200; relevansi tidak mengubah kategori; `topProb` 0,3–0,95, `margin` 0–0,5, `sufficient` 0–1; tanpa perubahan → "Tidak ada perubahan"; sukses membuat versi + 1.

## Layar

Sub-tab `AssessmentTabs`: Temuan, Antrean review, Klasifikasi (hitungan = hasil non-otomatis tanpa koreksi), Evaluasi, Spesifikasi.

1. **Klasifikasi** (`assessments/classification`, `?task=aktivitas|catatan`). Banner label sintetis untuk catatan. Ringkasan per kategori (jumlah dan bilah). Untuk catatan: agregasi alasan per aktivitas dan per periode (tabel hitungan efektif). Tabel item: teks, konteks, kategori efektif + sumber, teratas/kedua dengan persen, status, tanda "Dinilai model", tanda "Spesifikasi telah diperbarui". Filter status. Tombol Jalankan (analis), Koreksi (modal: radio kategori, alasan wajib ≤ 500, kotak "Masukkan ke set acuan evaluasi"), Konfirmasi.
2. **Evaluasi** (`assessments/evaluation`, `?task=`). Bagian set acuan: tabel item (referensi/teks, label pelabel pertama, label kedua, kesepakatan), pemilih label per baris untuk analis, hapus; ukuran set dan kappa. Bagian laporan: kartu metrik versus target, diagram reliabilitas (bilah keyakinan rata-rata vs akurasi per bin dengan angka), item yang dikecualikan, tombol "Jalankan evaluasi", riwayat run (versi model dan spesifikasi, tanggal, metrik utama, selisih dengan run sebelumnya).
3. **Spesifikasi** (`assessments/specs`, `?task=`). Versi terbaru (pertanyaan, kategori, ambang), riwayat versi, formulir sunting (pertanyaan, editor kategori tambah/hapus, tiga input ambang, catatan perubahan), pesan galat inline.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, tanpa HTML mentah, nilai panjang terpotong dengan `title`, halaman server membaca `searchParams` dan meneruskan prop ke komponen klien (pola M08a; tanpa `useSearchParams`/`Suspense`).
