# Product Requirements Document: M12 — Framework Analisis, Laporan, dan Ekspor

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Fase**: Fase 2 (Post-Hackathon Acceleration, Januari–April 2027)
**Acuan**: `feature-modules-v1.3.md` (M12), `00-prd-overview.md`, PRD M01–M11

---

## Executive Summary

Konsultan menyampaikan hasil kepada klien melalui alat bantu diskusi yang sudah dikenal: fishbone atau problem tree untuk mengorganisasi dugaan penyebab, Pareto untuk menunjukkan masalah mana yang paling besar, dan matriks dampak-usaha untuk memilih tindakan. Setelah itu, hasilnya dituangkan ke laporan dan deck presentasi. Saat ini semua itu dibuat ulang secara manual di PowerPoint atau Excel, sehingga angka mudah tidak sinkron dengan analisis, status hipotesis kabur, dan versi yang dikirim ke klien sulit dilacak.

M12 membentuk framework, laporan, dan deck **dari objek analisis yang sama** yang dipakai M05–M11. Framework dapat disunting, setiap simpul bertaut ke bukti, dan status terukur, hipotesis, serta ditinjau selalu terlihat. Laporan dan deck dibentuk dari templat dengan angka dari placeholder dan narasi yang telah disetujui (M10/M11). Versi yang dipublikasikan dibekukan sebagai snapshot.

Framework adalah alat mengorganisasi dan mengomunikasikan, **bukan bukti sebab-akibat**. M12 seluruhnya berada di Fase 2. Untuk Demo Day, tim cukup menyiapkan materi presentasi secara manual dari keluaran Fase 1.

---

## Problem Statement

**Situasi saat ini**: Fishbone, Pareto, dan deck dibuat terpisah dari data. Angka disalin manual, hipotesis yang belum terbukti tampak sama meyakinkannya dengan fakta, dan tidak ada catatan versi mana yang dikirim ke klien.

**Solusi yang diusulkan**: Editor framework yang terhubung ke temuan, hipotesis, kandidat, dan keputusan; pembentuk laporan/deck berbasis templat yang memakai data dan narasi tersetujui; snapshot publikasi berversi; ekspor ke format yang dipakai klien.

**Dampak bisnis**: Waktu menyiapkan bahan klien berkurang, angka di laporan selalu sinkron dengan analisis, dan setiap dokumen yang dikirim dapat ditelusuri ke bukti serta keputusan. Ini memperkuat posisi produk untuk adopsi komersial oleh Javan.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Waktu menyiapkan laporan klien**: < 2 jam kerja dari analisis yang sudah ditinjau sampai laporan dan deck siap kirim (baseline proses manual Javan perlu diukur).
- **Integritas angka**: 100% angka di laporan/deck berasal dari placeholder snapshot; 0 angka yang tidak sinkron dengan analisis yang dirujuk.
- **Disiplin tinjauan**: 0 narasi berstatus draf model dalam dokumen yang dipublikasikan.
- **Keterlacakan**: 100% simpul framework dan bagian laporan dapat dibuka sampai bukti asalnya.
- **Kualitas ekspor**: 100% ekspor PDF/PPTX dari set uji terbuka tanpa galat di aplikasi umum (Acrobat/PowerPoint/Google Slides).

**Validasi**: Uji tugas dengan analis menggunakan templat laporan Javan; uji ekspor otomatis.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menyiapkan bahan diskusi dan laporan klien dengan cepat tanpa salah salin angka.
- **Pain point**: Membuat ulang diagram dan deck setiap kali data berubah.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Menerima laporan yang jelas memisahkan fakta, dugaan, dan keputusan.

---

## User Stories & Acceptance Criteria

### Story 1: Menyusun fishbone/problem tree

**Sebagai** Analis
**Saya ingin** mengorganisasi hipotesis penyebab suatu masalah dalam fishbone atau problem tree
**Sehingga** diskusi dengan klien terstruktur

**Acceptance Criteria:**
- [ ] Framework dibuat dari temuan atau workspace M11; akar masalah = temuan terukur.
- [ ] Simpul dapat ditambahkan dari katalog hipotesis (M04), hipotesis alternatif (M11), atau ditulis langsung.
- [ ] Setiap simpul menampilkan status: `terukur`, `hipotesis`, `didukung bukti`, `dibantah`, atau `ditinjau/diputuskan`, mengikuti status objek asal.
- [ ] Simpul dan hubungan dapat disunting, diberi catatan, dan ditautkan ke bukti (temuan, kasus, hasil Jev, catatan wawancara).
- [ ] Keterangan tetap: "Framework mengorganisasi dugaan; hubungan di dalamnya bukan bukti sebab-akibat."

### Story 2: Membuat Pareto

**Sebagai** Analis
**Saya ingin** diagram Pareto dari kategori masalah
**Sehingga** klien melihat kategori mana yang menyumbang paling banyak

**Acceptance Criteria:**
- [ ] Sumber kategori: jenis temuan (M06), alasan catatan hasil klasifikasi Jev yang ditinjau (M08), aktivitas penyumbang waktu tunggu, atau atribut kasus.
- [ ] Ukuran: jumlah kasus, total waktu tunggu, atau jumlah ketidakpatuhan.
- [ ] Kategori dari hasil model yang belum ditinjau ditandai dan dapat dikeluarkan.
- [ ] Batang dan garis kumulatif dirender dengan Recharts; angka dari analisis yang dirujuk.

### Story 3: Membuat matriks dampak-usaha

**Sebagai** Bu Sari
**Saya ingin** melihat kandidat tindakan dalam matriks dampak-usaha
**Sehingga** saya mudah memilih tindakan yang realistis

**Acceptance Criteria:**
- [ ] Sumbu dampak = besaran masalah (M09); sumbu usaha = nilai usaha dari katalog/analis.
- [ ] Kandidat tanpa nilai usaha tidak diplot dan ditampilkan dalam daftar "usaha belum tersedia".
- [ ] Setiap titik menampilkan status keputusan M11.

### Story 4: Membedakan draf dan versi disahkan

**Sebagai** Analis
**Saya ingin** framework dan dokumen memiliki status draf dan versi disahkan
**Sehingga** yang dikirim ke klien jelas dan tidak berubah diam-diam

**Acceptance Criteria:**
- [ ] Status: `draf` → `siap ditinjau` → `disahkan`; hanya Analis yang mengesahkan.
- [ ] Pengesahan membekukan snapshot (isi, angka, narasi, versi objek sumber) dengan nomor versi.
- [ ] Snapshot disahkan tidak dapat diubah; perubahan membuat draf versi berikutnya.
- [ ] Bila objek sumber berubah setelah pengesahan, snapshot diberi tanda "ada data lebih baru" tanpa mengubah isinya.

### Story 5: Membentuk laporan dan deck dari objek analisis

**Sebagai** Analis
**Saya ingin** membentuk laporan dan deck dari temuan, framework, kandidat, dan keputusan yang dipilih
**Sehingga** saya tidak menyusun ulang bahan secara manual

**Acceptance Criteria:**
- [ ] Templat laporan dan deck berisi bagian (ringkasan eksekutif, metodologi & data, temuan, analisis penyebab, rekomendasi, rencana uji coba, batasan) yang diisi objek terpilih.
- [ ] Narasi hanya dari interpretasi M10 berstatus disetujui (M11); bagian tanpa narasi disetujui ditandai kosong untuk ditulis analis.
- [ ] Angka memakai placeholder yang diisi saat snapshot dibuat.
- [ ] Bagian "Data & batasan" otomatis memuat versi dataset, laporan kualitas M03, matriks kemampuan, dan paket konteks.
- [ ] Laporan dan deck dari snapshot yang sama memuat angka identik.

### Story 6: Mengekspor

**Sebagai** Analis
**Saya ingin** mengekspor framework, laporan, dan deck ke format yang dipakai klien
**Sehingga** hasil dapat dikirim dan dipresentasikan

**Acceptance Criteria:**
- [ ] Format: PNG/SVG (diagram), PDF (laporan), PPTX (deck).
- [ ] Ekspor hanya dari snapshot disahkan, kecuali ekspor draf yang diberi watermark "DRAF".
- [ ] Ekspor berjalan di worker; API mengembalikan `202` dan tautan unduh setelah selesai.
- [ ] Setiap ekspor tercatat (pengekspor, waktu, snapshot, format) di audit log.

---

## Functional Requirements

### Fitur 1: Editor framework
- **Deskripsi**: `Framework` (jenis: fishbone, problem tree, pareto, impact-effort) dengan simpul/hubungan yang menyimpan rujukan ke objek sumber. Fishbone dan problem tree disunting dengan React Flow; Pareto dan matriks dirender Recharts dari data.
- **Kategori fishbone bawaan**: metode, orang, sistem/teknologi, kebijakan, material/data, lingkungan; dapat diubah.
- **Edge case**: Objek sumber dihapus/digantikan → simpul tetap ada dengan tanda dan tautan ke versi lama.

### Fitur 2: Templat dokumen
- **Deskripsi**: `DocumentTemplate` berversi (bagian, aturan pengisian, gaya). Templat bawaan disusun tim; templat gaya Javan dapat ditambahkan.

### Fitur 3: Snapshot publikasi
- **Deskripsi**: `PublishedSnapshot` immutable berisi isi terender (JSON), daftar versi objek sumber, dan hash; diproyeksikan ke M07.

### Fitur 4: Layanan ekspor
- **Deskripsi**: Worker TypeScript membentuk PDF (render HTML melalui browser headless, mis. Playwright) dan PPTX (mis. pptxgenjs); pustaka final diputuskan tim. File disimpan di `projects/{projectId}/exports/`.
- **Error handling**: Ekspor gagal ditampilkan dengan alasan dan dapat diulang.

### Out of Scope
- Penyuntingan bersama real-time pada framework.
- Desain bebas ala aplikasi presentasi (hanya templat).
- Pengiriman otomatis ke klien via email.
- Ekspor DOCX (dipertimbangkan bila diminta Javan).

---

## Technical Constraints

### Performa
- Pembentukan snapshot laporan < 30 detik; ekspor PDF/PPTX < 2 menit.
- Editor framework tetap responsif hingga 150 simpul.

### Keamanan
- `authorize()` M01: Analis menyunting dan mengesahkan; Pemilik proses membaca snapshot disahkan dan memberi komentar.
- Tautan unduh berumur pendek dan terikat proyek.
- Dokumen klien tidak dipakai lintas proyek.

### Integrasi
- **M05–M06**: peta, metrik, temuan; **M08–M09**: klasifikasi, kandidat, besaran, usaha.
- **M10–M11**: narasi disetujui, hipotesis alternatif, keputusan.
- **M03–M04**: kualitas data dan paket konteks untuk bagian batasan.
- **M07**: snapshot dan framework sebagai node bukti.

### Teknologi
- Next.js dengan React Flow dan Recharts; worker TypeScript untuk ekspor; PostgreSQL dan object storage.
- Zod: `Framework`, `FrameworkNode`, `DocumentTemplate`, `PublishedSnapshot`, `ExportJob`.

---

## MVP Scope & Phasing

### Fase 1 (Demo Day)
- Tidak dikembangkan. Materi presentasi Demo Day disiapkan manual dari keluaran Fase 1.

### Fase 2: MVP M12 (Januari–Februari 2027)
- Fishbone/problem tree dengan status simpul dan tautan bukti.
- Pareto dari temuan dan klasifikasi tertinjau.
- Snapshot disahkan dan ekspor PNG/SVG + PDF.

### Fase 2 lanjutan (Maret–April 2027)
- Matriks dampak-usaha.
- Templat laporan dan deck, ekspor PPTX.
- Templat gaya Javan.

**Definisi MVP M12**: Dari satu workspace M11, analis membentuk fishbone dengan status simpul yang jelas, Pareto alasan penolakan, dan laporan PDF yang disahkan. Angka di semua bagian identik dengan analisis sumber.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Framework dibaca klien sebagai bukti penyebab | Sedang | Tinggi | Status simpul eksplisit dan keterangan tetap |
| Templat tidak sesuai gaya laporan Javan | Tinggi | Sedang | Minta contoh laporan Javan; templat dapat dikustomisasi |
| Ekspor PPTX tidak rapi di berbagai aplikasi | Sedang | Sedang | Uji pada PowerPoint dan Google Slides; tata letak sederhana |
| Snapshot lama dipakai setelah data berubah | Sedang | Sedang | Tanda "ada data lebih baru" pada snapshot |

---

## Dependencies & Blockers

**Dependensi:** M05–M11 Fase 1 stabil; contoh laporan/deck dari Javan; pilihan pustaka ekspor.

**Blocker yang diketahui:** Tidak ada; bergantung pada penyelesaian Fase 1.

---

## Appendix

### Glosarium
- **Fishbone (Ishikawa)**: Diagram pengelompokan dugaan penyebab per kategori.
- **Problem tree**: Pohon masalah, penyebab, dan akibat.
- **Pareto**: Diagram batang terurut dengan garis kumulatif untuk menunjukkan kontributor terbesar.
- **Matriks dampak-usaha**: Kuadran untuk membandingkan tindakan berdasarkan dampak dan usaha.
- **Snapshot disahkan**: Versi dokumen yang dibekukan untuk dikirim ke klien.

### Referensi
- `feature-modules-v1.3.md` — bagian M12.

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Baseline waktu proses manual Javan belum diukur |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Templat belum divalidasi Javan |
| Technical Constraints | 14/15 | Pustaka ekspor belum diputuskan |
| Scope & Priorities | 10/10 | |
| **Total** | **90/100** | |
