# Product Requirements Document: M04 — Konteks Bisnis, Model, Aturan, dan Katalog

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M04), `00-prd-overview.md`, PRD M01–M03

---

## Executive Summary

Event log memberi tahu apa yang terjadi, tetapi tidak memberi tahu apa yang seharusnya terjadi. Tanpa pembanding, sistem tidak bisa mengatakan bahwa sebuah kasus terlambat, melanggar urutan persetujuan, atau mengulang pekerjaan. Pembanding itu biasanya tersebar di SOP, diagram BPMN, perjanjian SLA, dan kebiasaan yang hanya diketahui pemilik proses.

M04 menjadi tempat konteks bisnis tersebut diubah menjadi konfigurasi yang dapat dipakai mesin dan ditelusuri ke sumbernya. Isinya: dokumen acuan, model BPMN, aturan yang dapat diperiksa kode, kalender kerja, batas awal/akhir proses, definisi rework, populasi metrik, serta katalog hipotesis, intervensi, dan rubrik penilaian yang nantinya dipakai Jev (M08) dan mesin rekomendasi (M09).

Prinsip utamanya: **SOP tidak otomatis menjadi aturan**. Setiap aturan ditulis atau ditinjau analis, merujuk bagian dokumen sumber, memiliki versi dan tanggal berlaku, dan baru dipakai analisis setelah berstatus disetujui. Fase 1 menyediakan aturan terstruktur, impor BPMN untuk dibaca dan dipetakan, kalender kerja, serta katalog awal untuk proses Purchase-to-Pay. Ekstraksi aturan dari SOP dengan bantuan model masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Konsultan membaca SOP dan menafsirkan aturan di kepala atau di spreadsheet. Definisi seperti "rework" atau "terlambat" berbeda antar-analis dan antar-proyek, jarang ditulis eksplisit, dan sulit dijelaskan ketika klien mempertanyakan suatu temuan. Daftar hipotesis penyebab dan pilihan intervensi juga bergantung pada pengalaman perorangan.

**Solusi yang diusulkan**: Repositori konteks per proyek dengan aturan terstruktur yang dapat dieksekusi kode, model BPMN yang dipetakan ke label aktivitas kanonis, kalender kerja, serta katalog hipotesis/intervensi/rubrik yang berversi dan berstatus tinjauan. Konfigurasi yang disetujui dibekukan menjadi **paket konteks** yang dirujuk setiap analisis.

**Dampak bisnis**: Setiap temuan dapat dijawab dengan "dibandingkan dengan aturan X versi Y, yang bersumber dari SOP halaman Z". Definisi yang konsisten mengurangi perdebatan dengan klien, dan katalog menjadi pengetahuan Javan yang tumbuh antar-proyek (Fase 2).

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Waktu setup konteks**: analis dapat menyiapkan paket konteks P2P untuk proyek demo (batas proses, definisi rework, ≥ 5 aturan, kalender) < 30 menit dengan template.
- **Keterlacakan aturan**: 100% aturan yang dipakai M06 memiliki versi, tanggal berlaku, status disetujui, dan rujukan sumber (dokumen + halaman/bagian, atau catatan wawancara).
- **Disiplin status**: 0 aturan berstatus draf yang ikut dipakai dalam analisis (diuji otomatis).
- **Cakupan pemetaan**: ≥ 90% volume event pada dataset demo berasal dari aktivitas yang terpetakan ke model BPMN atau setidaknya satu aturan.
- **Kelengkapan katalog**: 100% hipotesis dan intervensi di katalog demo memiliki rubrik penilaian dan syarat penerapan yang dapat dihitung.

**Validasi**: Uji tugas penyiapan konteks dengan 2–3 pengguna; uji otomatis status dan keterlacakan; validasi isi katalog P2P bersama Javan di Problem Owner Clinic.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menetapkan pembanding yang eksplisit dan dapat dipertanggungjawabkan sebelum menganalisis.
- **Pain point**: Definisi berubah-ubah dan tidak tercatat; harus menjelaskan ulang kepada klien dari mana suatu aturan berasal.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Memastikan SLA, batas proses, dan pengecualian yang dipakai sesuai praktik sebenarnya di perusahaannya.
- **Kebutuhan**: Dapat membaca aturan dalam bahasa bisnis dan memberi konfirmasi.

### Sekunder: Rina — Administrator
- **Tujuan**: Mengunggah dokumen acuan dan menyiapkan kalender kerja untuk proyek baru.

---

## Urutan kerja M03 ↔ M04

M03 dan M04 saling membutuhkan: M04 memetakan **label aktivitas kanonis** dari M03, sedangkan M03 memerlukan **batas proses** dari M04 untuk menilai kasus yang belum selesai. Urutannya ditetapkan sebagai berikut:

1. M03 menerbitkan versi dataset dengan label kanonis. Status penyelesaian kasus "tidak diketahui".
2. M04 menetapkan batas proses dan pemetaan aktivitas berdasarkan label kanonis tersebut, lalu menerbitkan paket konteks.
3. Status penyelesaian kasus dan pemeriksaan "kasus belum selesai" dihitung **saat analisis** dari pasangan `DatasetVersion` + `ContextPackage`. Laporan kualitas M03 diperbarui sebagai laporan turunan, **tanpa** membuat versi dataset baru.

Dengan demikian dataset tetap immutable, dan perubahan definisi bisnis cukup menghasilkan paket konteks baru.

---

## User Stories & Acceptance Criteria

### Story 1: Menyimpan dokumen acuan

**Sebagai** Administrator atau Analis
**Saya ingin** mengunggah SOP, BPMN, perjanjian SLA, dan catatan wawancara ke proyek
**Sehingga** setiap aturan dapat merujuk sumbernya

**Acceptance Criteria:**
- [ ] Format diterima: PDF, DOCX, MD/TXT, dan `.bpmn` (BPMN 2.0 XML); batas 50 MB per file.
- [ ] Setiap dokumen menyimpan judul, jenis, pemberi dokumen, tanggal dokumen, tanggal berlaku (bila ada), dan pengunggah.
- [ ] Catatan wawancara dapat dibuat langsung di aplikasi sebagai dokumen teks.
- [ ] Dokumen versi baru tidak menimpa yang lama; aturan tetap merujuk versi yang dipakai saat dibuat.

### Story 2: Menetapkan batas proses, rework, dan populasi metrik

**Sebagai** Analis
**Saya ingin** mendefinisikan kapan proses dimulai dan selesai, apa yang dihitung sebagai rework, dan kasus mana yang dihitung dalam metrik
**Sehingga** semua analisis memakai definisi yang sama

**Acceptance Criteria:**
- [ ] Batas proses: satu atau lebih aktivitas awal dan aktivitas akhir (dari label kanonis M03), dengan opsi "kasus dianggap selesai bila tidak ada event selama N hari" sebagai aturan tambahan yang eksplisit.
- [ ] Rework dapat didefinisikan sebagai: (a) aktivitas yang sama terjadi lebih dari sekali dalam satu kasus, dan/atau (b) kembali ke aktivitas tertentu setelah aktivitas lain tertentu (pasangan yang dipilih analis).
- [ ] Populasi metrik: pilihan kasus selesai saja / semua kasus, periode analisis, dan filter atribut; tersimpan dengan nama (mis. "PO selesai 2018").
- [ ] Setiap definisi menampilkan dampaknya pada dataset terpilih (jumlah kasus selesai, belum selesai, dan kasus dengan rework) sebelum disimpan.

### Story 3: Menulis aturan yang dapat diperiksa

**Sebagai** Analis
**Saya ingin** menulis aturan SLA, urutan, aktivitas wajib, dan pemisahan tugas dalam bentuk terstruktur
**Sehingga** M06 dapat memeriksa kepatuhan secara otomatis

**Acceptance Criteria:**
- [ ] Jenis aturan Fase 1 tersedia sesuai Fitur 3, diisi melalui formulir (bukan kode bebas), divalidasi skema Zod.
- [ ] Setiap aturan memiliki nama, deskripsi bisnis, parameter, cakupan (filter kasus), tanggal berlaku mulai/akhir, rujukan sumber, dan status.
- [ ] Aturan menampilkan pratinjau pada dataset terpilih: jumlah kasus yang dapat dievaluasi, patuh, dan tidak patuh, sebelum disetujui.
- [ ] Aturan yang memerlukan atribut yang tidak tersedia (menurut matriks kemampuan M03) ditandai "tidak dapat dievaluasi" beserta alasannya.
- [ ] Aturan tanpa rujukan sumber tidak dapat disetujui.

### Story 4: Mengimpor dan memetakan model BPMN

**Sebagai** Analis
**Saya ingin** mengimpor diagram BPMN proses klien dan memetakan task-nya ke aktivitas di log
**Sehingga** pelaksanaan aktual dapat dibandingkan dengan model yang diharapkan

**Acceptance Criteria:**
- [ ] File BPMN 2.0 ditampilkan sebagai diagram (hanya-baca).
- [ ] Setiap task dapat dipetakan ke satu atau lebih label kanonis; sistem menyarankan pasangan berdasarkan kemiripan nama.
- [ ] Task tanpa pemetaan dan aktivitas log yang tidak ada di model ditampilkan dalam dua daftar terpisah.
- [ ] Sistem memeriksa apakah model dapat dikonversi untuk pemeriksaan conformance oleh worker PM4Py; bila gagal (mis. elemen yang tidak didukung), alasan ditampilkan dan model tetap tersimpan sebagai acuan visual.

### Story 5: Mengelola kalender kerja

**Sebagai** Administrator
**Saya ingin** menetapkan jam kerja, hari kerja, dan hari libur proyek
**Sehingga** SLA dalam hari/jam kerja dihitung dengan benar

**Acceptance Criteria:**
- [ ] Kalender berisi zona waktu, hari kerja, jam kerja per hari, dan daftar tanggal libur.
- [ ] Tanggal libur dapat diisi manual atau diimpor dari CSV; Fase 1 tidak mengambil daftar libur secara otomatis.
- [ ] Aturan SLA dapat memilih satuan hari kalender atau hari/jam kerja.

### Story 6: Memelihara katalog hipotesis, intervensi, dan rubrik

**Sebagai** Analis
**Saya ingin** memelihara daftar hipotesis penyebab dan kandidat intervensi beserta rubrik penilaiannya
**Sehingga** Jev (M08) dan M09 menilai kandidat yang telah dikurasi analis, bukan kandidat yang dikarang model

**Acceptance Criteria:**
- [ ] Hipotesis: pernyataan, gejala terukur terkait (mis. bottleneck pada aktivitas X), bukti yang dibutuhkan, dan syarat penerapan.
- [ ] Intervensi: deskripsi tindakan, hipotesis yang ditangani, prasyarat, perkiraan usaha/risiko (boleh kosong dan ditandai "belum tersedia"), serta metrik keberhasilan.
- [ ] Rubrik: kriteria, bobot, skala dengan definisi tiap nilai, dan opsi wajib "informasi tidak cukup".
- [ ] Syarat penerapan ditulis sebagai kondisi yang dapat dihitung kode (lihat Fitur 5).
- [ ] Proyek baru dapat menyalin katalog awal P2P sebagai titik mulai; salinan menjadi milik proyek dan dapat diubah.

### Story 7: Meninjau dan membekukan paket konteks

**Sebagai** Analis
**Saya ingin** menyetujui konfigurasi dan membekukannya menjadi paket konteks
**Sehingga** analisis selalu merujuk konfigurasi yang jelas dan tidak berubah diam-diam

**Acceptance Criteria:**
- [ ] Status setiap konfigurasi: `draf` → `ditinjau` → `disetujui` → `usang`; Pemilik proses dapat memberi tanda `dikonfirmasi klien` pada aturan bisnis dan batas proses.
- [ ] Paket konteks membekukan versi batas proses, definisi rework, populasi metrik, aturan, model BPMN, kalender, dan katalog yang berstatus disetujui.
- [ ] Analisis M05–M09 wajib memilih satu paket konteks; paket yang sudah dipakai tidak dapat diubah, hanya digantikan versi baru.
- [ ] Saat paket baru diterbitkan, analisis yang memakai paket lama ditandai "konteks telah diperbarui" untuk ditinjau ulang (M11).

---

## Functional Requirements

### Fitur 1: Repositori dokumen acuan
- **Deskripsi**: Dokumen disimpan di object storage `projects/{projectId}/context/docs/`; metadata di PostgreSQL. Rujukan sumber pada aturan = dokumen + versi + halaman/bagian + kutipan singkat yang ditulis analis.
- **Edge case**: Dokumen dihapus dari proyek → tidak benar-benar dihapus bila sudah dirujuk aturan disetujui; diberi status `ditarik` dan aturan terkait ditandai untuk ditinjau.

### Fitur 2: Definisi proses
- **Deskripsi**: `ProcessBoundary`, `ReworkDefinition`, `MetricPopulation` berversi.
- **Edge case**: Aktivitas akhir yang dipilih tidak muncul di dataset → peringatan, tetap dapat disimpan untuk dataset mendatang.

### Fitur 3: Aturan terstruktur
| Jenis | Parameter | Contoh P2P |
|---|---|---|
| SLA durasi | Aktivitas A, aktivitas B, batas, satuan (kalender/kerja), statistik (per kasus) | "Create PO → Record Goods Receipt ≤ 14 hari kerja" |
| Urutan | A harus mendahului B dalam satu kasus | "Record Goods Receipt sebelum Clear Invoice" (three-way match) |
| Aktivitas wajib | Aktivitas A harus ada dalam kasus yang memenuhi filter | "Kasus dengan nilai di atas ambang wajib melalui persetujuan" |
| Aktivitas terlarang | Aktivitas A tidak boleh terjadi dalam cakupan tertentu | "Tidak ada perubahan harga setelah invoice dicatat" |
| Pemisahan tugas | Sumber daya pelaksana A ≠ pelaksana B | "Pembuat PO bukan penyetuju PO" |

- **Contoh** di atas ilustratif; aturan aktual klien diambil dari SOP dan dikonfirmasi pemilik proses.
- **Versi berlaku**: bila beberapa versi aturan berlaku dalam periode analisis, setiap kasus dievaluasi dengan versi yang berlaku pada waktu event awal kasus.
- **Eksekusi**: aturan dievaluasi oleh service/worker TypeScript atau worker Python (sesuai jenisnya) di M06; M04 hanya menyimpan definisi dan menjalankan pratinjau.

### Fitur 4: Model BPMN
- **Deskripsi**: Penampil BPMN hanya-baca (mis. bpmn-js dalam komponen klien Next.js; pilihan pustaka diputuskan tim). Pemetaan task ↔ label kanonis disimpan per versi model. Worker Python memeriksa konversi model ke representasi yang dapat dipakai PM4Py untuk conformance di M06.
- **Edge case**: Satu task memetakan beberapa label (mis. "Approve" ↔ "Approve PO L1", "Approve PO L2") dan satu label dapat dipetakan ke beberapa task; konflik ditampilkan untuk diputuskan analis.

### Fitur 5: Katalog dan syarat penerapan
- **Syarat penerapan** ditulis sebagai kondisi terstruktur atas:
  - matriks kemampuan M03 (mis. "membutuhkan atribut sumber daya"),
  - metrik M06 (mis. "rasio rework aktivitas X > 10%"),
  - atribut kasus (mis. "kategori item = jasa").
- **Katalog awal P2P** (Fase 1): sekitar 10 hipotesis dan 10 intervensi disusun tim dari literatur process mining P2P, semuanya berlabel **[perlu validasi Javan]**.
- **Edge case**: Syarat merujuk metrik yang tidak tersedia → kandidat ditandai "belum layak dinilai" di M09, bukan dianggap tidak memenuhi syarat.

### Fitur 6: Paket konteks
- **Deskripsi**: `ContextPackage` = daftar referensi versi konfigurasi yang disetujui + hash; dirujuk oleh setiap analisis dan menjadi node asal-usul di M07.

### Out of Scope (Fase 1)
- Ekstraksi draf aturan atau BPMN dari SOP dengan bantuan LLM (Fase 2, wajib ditinjau analis).
- Editor BPMN (Fase 1 hanya menampilkan dan memetakan).
- DMN dan aturan berbasis ekspresi bebas.
- Kalender berbeda per unit/departemen.
- Katalog bersama lintas proyek/klien.
- Pengambilan daftar hari libur otomatis.

---

## Technical Constraints

### Performa
- Pratinjau aturan atau definisi proses pada subset demo < 10 detik; untuk dataset penuh dijalankan sebagai pekerjaan worker dan dilaporkan statusnya.
- Penampil BPMN merender model hingga 200 elemen tanpa jeda yang terasa (< 2 detik).

### Keamanan
- `authorize()` M01: Administrator dan Analis mengunggah dokumen; hanya Analis yang membuat, menyetujui, dan membekukan konfigurasi; Pemilik proses membaca dan memberi konfirmasi.
- Dokumen SOP diperlakukan sebagai data rahasia klien, tersimpan di prefiks proyek, tidak dipakai lintas proyek.
- File BPMN di-parse sebagai XML dengan perlindungan terhadap entitas eksternal (XXE).
- Persetujuan, konfirmasi klien, dan pembekuan paket tercatat di audit log.

### Integrasi
- **M03**: label kanonis dan matriks kemampuan; status penyelesaian kasus dihitung saat analisis.
- **M06**: mengevaluasi aturan, SLA, dan conformance berdasarkan paket konteks.
- **M08**: memakai katalog dan rubrik sebagai pilihan dan kriteria penilaian Jev.
- **M09**: memakai syarat penerapan dan atribut intervensi.
- **M07**: dokumen, aturan, task BPMN, dan paket konteks menjadi node dengan relasi ke aktivitas dan temuan.
- **M11/M13**: pelajaran proyek dapat mengusulkan perubahan katalog melalui tinjauan.

### Teknologi
- Skema Zod untuk setiap jenis aturan, definisi proses, rubrik, syarat penerapan, dan `ContextPackage`; diekspor ke JSON Schema untuk aturan yang dievaluasi worker Python.
- PostgreSQL: `context_documents`, `process_boundaries`, `rework_definitions`, `metric_populations`, `rules`, `bpmn_models`, `bpmn_mappings`, `calendars`, `hypotheses`, `interventions`, `rubrics`, `context_packages`.
- Object storage untuk dokumen dan file BPMN.
- Worker Python (PM4Py) untuk validasi konversi BPMN dan pratinjau dataset penuh.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET/POST | `/api/projects/{projectId}/context/documents` | Dokumen acuan |
| GET/POST | `/api/projects/{projectId}/context/definitions` | Batas proses, rework, populasi metrik |
| GET/POST/PATCH | `/api/projects/{projectId}/context/rules` | Aturan |
| POST | `/api/projects/{projectId}/context/rules/{ruleId}/preview` | Pratinjau aturan pada dataset |
| GET/POST | `/api/projects/{projectId}/context/bpmn` | Model BPMN dan pemetaannya |
| GET/PUT | `/api/projects/{projectId}/context/calendar` | Kalender kerja |
| GET/POST/PATCH | `/api/projects/{projectId}/catalog/{hypotheses\|interventions\|rubrics}` | Katalog |
| POST | `/api/projects/{projectId}/context/{type}/{id}/status` | Ubah status tinjauan / konfirmasi klien |
| POST | `/api/projects/{projectId}/context/packages` | Bekukan paket konteks |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Repositori dokumen acuan dengan rujukan sumber.
- Batas proses, definisi rework, populasi metrik, beserta pratinjau dampak.
- Lima jenis aturan terstruktur dengan pratinjau dan status tinjauan.
- Impor, tampilan, dan pemetaan BPMN dengan pemeriksaan konversi.
- Kalender kerja satu per proyek.
- Katalog awal P2P (±10 hipotesis, ±10 intervensi, rubrik) dan paket konteks.

**Definisi MVP**: Untuk proyek demo P2P, analis menunjukkan satu aturan SLA dan satu aturan three-way match yang masing-masing merujuk bagian SOP contoh, disetujui, dan dibekukan dalam paket konteks. Juri dapat menelusuri bahwa setiap temuan kepatuhan di M06 berasal dari aturan tersebut.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Draf aturan dan BPMN dari SOP dengan bantuan LLM, ditinjau analis sebelum dipakai (berkaitan dengan Industrial Challenge #1 *SOP to Executable Business Process*).
- Editor BPMN dan kalender per unit.
- Pustaka katalog Javan lintas proyek dengan anonimisasi dan kurasi.
- Pengecualian (*exceptions*) terstruktur per kasus atau per kelompok.

### Pertimbangan masa depan
- Template konteks untuk proses umum lain (Order-to-Cash, pengadaan jasa, klaim).

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| SOP contoh untuk demo tidak mencerminkan proses klien nyata | Tinggi | Sedang | Labeli SOP demo sebagai ilustratif; minta contoh SOP anonim dari Javan |
| Analis menyetujui aturan tanpa memeriksa dampaknya | Sedang | Tinggi | Pratinjau patuh/tidak patuh wajib ditampilkan sebelum persetujuan |
| Model BPMN klien tidak dapat dikonversi untuk conformance | Sedang | Sedang | Tetap simpan sebagai acuan visual; conformance memakai aturan terstruktur |
| Katalog awal dianggap rekomendasi resmi | Sedang | Sedang | Label "perlu validasi Javan" dan status draf sampai ditinjau |
| Jenis aturan Fase 1 tidak cukup untuk kebutuhan klien | Sedang | Sedang | Validasi daftar jenis di Problem Owner Clinic; struktur aturan dirancang dapat diperluas |

---

## Dependencies & Blockers

**Dependensi:**
- M03: label kanonis dan matriks kemampuan pada versi dataset.
- M01: kewenangan dan peran.
- Worker Python PM4Py untuk validasi BPMN.
- Konten SOP/BPMN contoh untuk P2P (disusun tim) dan, idealnya, contoh nyata anonim dari Javan.

**Blocker yang diketahui:**
- Belum ada SOP/BPMN dari Javan; Fase 1 memakai materi contoh yang disusun tim.

---

## Appendix

### Glosarium
- **Batas proses**: Aktivitas yang menandai awal dan akhir satu kasus.
- **Rework**: Pengulangan pekerjaan sesuai definisi yang disepakati di proyek.
- **Populasi metrik**: Himpunan kasus yang dihitung dalam suatu metrik.
- **Aturan terstruktur**: Aturan yang diisi lewat formulir berparameter dan dapat diperiksa kode.
- **Three-way match**: Pencocokan PO, penerimaan barang, dan invoice sebelum pembayaran.
- **Pemisahan tugas**: Larangan satu orang melakukan dua aktivitas yang saling mengawasi.
- **Katalog**: Daftar hipotesis, intervensi, dan rubrik yang dikurasi analis.
- **Syarat penerapan**: Kondisi yang dapat dihitung untuk menentukan apakah kandidat layak dinilai.
- **Paket konteks**: Kumpulan versi konfigurasi disetujui yang dibekukan dan dirujuk analisis.

### Referensi
- `feature-modules-v1.3.md` — bagian M04 dan prinsip "SOP tidak otomatis diperlakukan sebagai aturan eksekusi".
- Spesifikasi BPMN 2.0 (OMG).
- Dokumentasi PM4Py untuk impor BPMN dan conformance checking.

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Target dan isi katalog belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Alur penulisan aturan belum diuji dengan pengguna |
| Technical Constraints | 14/15 | Pustaka penampil BPMN belum diputuskan |
| Scope & Priorities | 10/10 | |
| **Total** | **90/100** | |
