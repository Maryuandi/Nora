# Product Requirements Document: M13 — Tindak Lanjut dan Evaluasi Intervensi

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Fase**: Fase 2 (Post-Hackathon Acceleration, Januari–April 2027)
**Acuan**: `feature-modules-v1.3.md` (M13), `00-prd-overview.md`, PRD M01–M12

---

## Executive Summary

Proyek konsultasi sering berhenti di rekomendasi. Apakah tindakan benar-benar dijalankan, dan apakah hasilnya sesuai harapan, jarang diukur dengan cara yang sama seperti saat masalah ditemukan. Akibatnya, klien tidak tahu tindakan mana yang berhasil, dan konsultan kehilangan pelajaran berharga untuk proyek berikutnya.

M13 menutup siklus itu. Keputusan `dipilih` dan `usulan_uji_coba` dari M11 menjadi **tindakan** dengan pemilik, jadwal, dan status pelaksanaan. Sebelum tindakan berjalan, metrik, baseline, pembanding, dan tanggal perubahan ditetapkan. Setelah data baru masuk melalui M02–M06, sistem mengukur ulang dengan **definisi metrik yang sama**, membandingkan hasil aktual dengan target dan estimasi skenario M09, serta mencatat perubahan lain yang mungkin ikut memengaruhi hasil.

Perbandingan sebelum/sesudah tidak otomatis membuktikan dampak kausal; M13 menyatakan metode dan keterbatasannya secara eksplisit. Hasil evaluasi dan pelajaran kembali ke M07 dan katalog M04 hanya melalui tinjauan. Intervensi sendiri diterapkan oleh klien melalui prosedur mereka; sistem tidak mengubah proses klien secara langsung.

---

## Problem Statement

**Situasi saat ini**: Tindak lanjut dicatat di spreadsheet atau notulen, baseline jarang ditetapkan sebelum perubahan, dan pengukuran ulang memakai definisi yang berbeda dari analisis awal. Klaim "tindakan berhasil" sering tidak memperhitungkan musim, volume, atau perubahan lain.

**Solusi yang diusulkan**: Pelacakan tindakan yang terhubung ke keputusan, rencana evaluasi yang ditetapkan sebelum perubahan, pengukuran ulang otomatis memakai definisi metrik berversi yang sama, perbandingan dengan target dan estimasi, pencatatan faktor lain, serta keputusan lanjut/perbaiki/hentikan.

**Dampak bisnis**: Javan dapat menunjukkan hasil nyata rekomendasinya dengan cara yang jujur dan dapat diaudit, dan katalog intervensi menjadi semakin akurat dari proyek ke proyek. Ini mendukung jalur komersialisasi dan *technology adoption* pasca-hackathon.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Rencana sebelum perubahan**: 100% tindakan yang dievaluasi memiliki metrik, baseline, dan tanggal perubahan yang ditetapkan sebelum atau pada tanggal perubahan (atau ditandai "rencana retrospektif").
- **Konsistensi definisi**: 100% pengukuran ulang memakai versi definisi metrik dan populasi yang sama dengan baseline, atau ditandai jelas bila berbeda.
- **Pengukuran otomatis**: pengukuran ulang terjadwal berjalan < 1 jam setelah versi dataset baru diterbitkan.
- **Kejujuran evaluasi**: 100% hasil evaluasi mencantumkan metode, ukuran sampel, faktor lain yang tercatat, dan keterbatasan.
- **Umpan balik ke katalog**: ≥ 80% evaluasi selesai menghasilkan usulan pembaruan katalog yang ditinjau (diterima atau ditolak dengan alasan).

**Validasi**: Uji pada skenario simulasi (data BPI dengan perubahan buatan yang diketahui besarnya) untuk memastikan perhitungan menemukan perubahan tersebut; uji coba pada pilot nyata bila Javan menyediakan.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Membuktikan secara jujur apakah rekomendasi berdampak, dan belajar dari hasilnya.
- **Pain point**: Pengukuran ulang manual dengan definisi yang berubah-ubah.

### Utama: Bu Sari — Pemilik proses
- **Tujuan**: Memantau pelaksanaan tindakan di unitnya dan memutuskan apakah dilanjutkan.

---

## User Stories & Acceptance Criteria

### Story 1: Mencatat tindakan dari keputusan

**Sebagai** Bu Sari
**Saya ingin** setiap keputusan yang dipilih menjadi tindakan dengan pemilik dan jadwal
**Sehingga** pelaksanaannya dapat dipantau

**Acceptance Criteria:**
- [ ] Tindakan dibuat dari keputusan `dipilih` atau `usulan_uji_coba` (M11), mewarisi deskripsi, kandidat, dan usulan uji coba (M09).
- [ ] Tindakan berisi pemilik, tanggal mulai/selesai rencana, cakupan penerapan (unit/kategori/filter), kondisi penerapan, dan status: `direncanakan`, `berjalan`, `ditunda`, `selesai`, `dihentikan`.
- [ ] Perubahan status mencatat pelaku, waktu, dan catatan.

### Story 2: Menetapkan rencana evaluasi

**Sebagai** Analis
**Saya ingin** menetapkan metrik, baseline, pembanding, dan tanggal perubahan sebelum tindakan berjalan
**Sehingga** evaluasi tidak dipengaruhi hasil yang sudah terlihat

**Acceptance Criteria:**
- [ ] Metrik utama dan pengaman dipilih dari registri definisi metrik M06 (versi dikunci).
- [ ] Baseline: periode sebelum perubahan dengan populasi M04 yang sama; nilai dihitung otomatis.
- [ ] Pembanding opsional: kelompok yang tidak menerima tindakan (mis. unit/kategori lain) bila tersedia.
- [ ] Target ditetapkan analis; estimasi skenario M09 (bila ada) dilampirkan sebagai pembanding prediksi.
- [ ] Rencana dikunci setelah tanggal perubahan; perubahan setelahnya membuat versi baru dan ditandai.
- [ ] Rencana yang dibuat setelah tanggal perubahan ditandai "rencana retrospektif".

### Story 3: Mengukur ulang dengan data baru

**Sebagai** Analis
**Saya ingin** metrik diukur ulang otomatis ketika data baru tersedia
**Sehingga** saya memantau hasil tanpa menghitung manual

**Acceptance Criteria:**
- [ ] Setelah versi dataset baru diterbitkan (M03), pengukuran ulang dijalankan untuk tindakan `berjalan`/`selesai` memakai definisi metrik dan populasi yang dikunci.
- [ ] Hasil menampilkan nilai periode sesudah, selisih terhadap baseline, ukuran sampel, dan tren mingguan/bulanan.
- [ ] Periode dengan sampel di bawah ambang ditandai dan tidak dipakai menyimpulkan.
- [ ] Bila definisi metrik atau aturan berubah, pengukuran tetap memakai versi terkunci dan menampilkan bahwa versi lebih baru tersedia.

### Story 4: Membandingkan hasil aktual dengan target dan estimasi

**Sebagai** Bu Sari
**Saya ingin** melihat hasil aktual dibandingkan target dan estimasi awal
**Sehingga** saya tahu apakah tindakan memenuhi harapan

**Acceptance Criteria:**
- [ ] Tampilan berdampingan: baseline, target, estimasi skenario (berlabel `estimasi`), dan hasil aktual (berlabel `aktual`).
- [ ] Metode ditampilkan: **sebelum–sesudah** (bawaan) atau **selisih dari selisih** (bila ada kelompok pembanding).
- [ ] Interval ketidakpastian ditampilkan bila metode mendukungnya (mis. bootstrap pada perbedaan median).
- [ ] Keterangan tetap: "Perbandingan ini tidak otomatis membuktikan dampak kausal tindakan."

### Story 5: Mencatat faktor lain yang relevan

**Sebagai** Analis
**Saya ingin** mencatat perubahan lain selama periode evaluasi
**Sehingga** hasil tidak salah dikaitkan sepenuhnya dengan tindakan

**Acceptance Criteria:**
- [ ] Faktor lain dapat dicatat (tanggal, deskripsi, perkiraan arah pengaruh), mis. perubahan volume, musim, sistem baru, pergantian staf.
- [ ] Sistem menandai otomatis perubahan besar yang terdeteksi (mis. volume kasus berubah > 30%, versi aturan berubah) sebagai faktor yang perlu dipertimbangkan.
- [ ] Faktor lain dicantumkan pada hasil evaluasi.

### Story 6: Menyimpulkan dan memutuskan kelanjutan

**Sebagai** Bu Sari
**Saya ingin** memutuskan melanjutkan, memperbaiki, atau menghentikan tindakan berdasarkan evaluasi
**Sehingga** sumber daya dipakai untuk tindakan yang efektif

**Acceptance Criteria:**
- [ ] Hasil evaluasi berisi: kesimpulan analis (`memenuhi target`, `sebagian`, `tidak memenuhi`, `belum dapat disimpulkan`), metode, ukuran sampel, faktor lain, dan keterbatasan.
- [ ] Keputusan kelanjutan (`lanjutkan`, `perbaiki`, `hentikan`, `perluas`) dicatat sebagai keputusan M11 dengan kewenangan Pemilik proses.
- [ ] Narasi evaluasi dapat dibuat M10 dan harus disetujui sebelum dipakai di laporan M12.

### Story 7: Mengembalikan pelajaran ke pengetahuan proyek

**Sebagai** Analis
**Saya ingin** hasil evaluasi memperbarui pengetahuan proyek dan katalog
**Sehingga** rekomendasi berikutnya lebih akurat

**Acceptance Criteria:**
- [ ] Hasil evaluasi diproyeksikan ke M07 sebagai node berkategori keputusan/hasil aktual, terhubung ke tindakan, kandidat, dan temuan.
- [ ] Usulan pembaruan katalog M04 (mis. perkiraan usaha, syarat penerapan, catatan efektivitas) dibuat dan masuk alur tinjauan; tidak ada perubahan katalog otomatis.

---

## Functional Requirements

### Fitur 1: Pelacakan tindakan
- **Deskripsi**: `Action` terhubung ke `Decision` (M11) dan `TrialProposal` (M09); riwayat status.
- **Edge case**: Keputusan asal diubah menjadi `ditolak` → tindakan ditandai dan dimintakan konfirmasi untuk dihentikan.

### Fitur 2: Rencana evaluasi
- **Deskripsi**: `EvaluationPlan` berversi (metrik terkunci, populasi, baseline, pembanding, target, tanggal perubahan, metode).

### Fitur 3: Pengukuran ulang
- **Deskripsi**: Workflow Temporal yang dipicu penerbitan versi dataset; worker Python menghitung metrik dengan definisi M06 versi terkunci; hasil sebagai `MeasurementRun`.
- **Metode**: sebelum–sesudah; selisih dari selisih bila ada pembanding; bootstrap untuk interval pada median.
- **Edge case**: Kasus yang berjalan melintasi tanggal perubahan → dikelompokkan berdasarkan tanggal awal kasus (bawaan, dapat diubah) dan dilaporkan jumlahnya.

### Fitur 4: Faktor lain dan deteksi perubahan
- **Deskripsi**: `ConfoundingNote` manual dan penanda otomatis dari perubahan volume, versi aturan, atau pemetaan.

### Fitur 5: Hasil evaluasi dan umpan balik
- **Deskripsi**: `EvaluationResult` dan `CatalogUpdateProposal`; keputusan kelanjutan melalui M11.

### Out of Scope
- Penerapan perubahan langsung ke sistem klien.
- Inferensi kausal lanjutan (mis. synthetic control, regression discontinuity).
- Eksperimen acak yang dikelola sistem.
- Pelacakan biaya pelaksanaan tindakan.

---

## Technical Constraints

### Performa
- Pengukuran ulang < 1 jam setelah versi dataset baru; satu pengukuran < 5 menit untuk dataset penuh.

### Keamanan
- `authorize()` M01: Analis menetapkan rencana dan kesimpulan; Pemilik proses mengubah status tindakan dan memutuskan kelanjutan.
- Rencana terkunci tidak dapat diubah tanpa versi baru; semua perubahan tercatat di audit log.

### Integrasi
- **M02–M06**: data baru dan definisi metrik; **M09**: usulan uji coba dan estimasi skenario.
- **M11**: keputusan asal dan keputusan kelanjutan; **M10**: narasi evaluasi.
- **M07/M04**: hasil dan pelajaran melalui tinjauan; **M12**: bagian hasil tindakan dalam laporan.

### Teknologi
- Worker Python (pandas, PM4Py) untuk pengukuran; Temporal untuk pemicu dan jadwal; PostgreSQL; Next.js + Recharts untuk tampilan.
- Zod: `Action`, `EvaluationPlan`, `MeasurementRun`, `ConfoundingNote`, `EvaluationResult`, `CatalogUpdateProposal`.

---

## MVP Scope & Phasing

### Fase 1 (Demo Day)
- Tidak dikembangkan. Pada demo cukup ditunjukkan bahwa keputusan `dipilih` di M11 dan usulan uji coba di M09 sudah membawa baseline dan metrik keberhasilan sebagai dasar M13.

### Fase 2: MVP M13 (Februari–Maret 2027)
- Pelacakan tindakan, rencana evaluasi terkunci, pengukuran ulang sebelum–sesudah, perbandingan dengan target dan estimasi, faktor lain manual.

### Fase 2 lanjutan (Maret–April 2027)
- Selisih dari selisih dengan kelompok pembanding, interval bootstrap, deteksi perubahan otomatis, usulan pembaruan katalog.

**Definisi MVP M13**: Pada data uji dengan perubahan buatan yang diketahui (mis. jeda transisi dikurangi 40% setelah tanggal tertentu), sistem mendeteksi perubahan dengan definisi metrik yang sama, membandingkannya dengan target dan estimasi M09, dan menampilkan keterbatasan evaluasi.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Hasil sebelum/sesudah diklaim sebagai dampak kausal | Tinggi | Tinggi | Metode dan keterbatasan wajib, keterangan tetap, pencatatan faktor lain |
| Data baru dari klien tidak datang tepat waktu | Sedang | Sedang | Status "menunggu data"; integrasi sinkronisasi M02 Fase 2 |
| Definisi metrik berubah di tengah evaluasi | Sedang | Sedang | Versi definisi dikunci pada rencana |
| Belum ada pilot nyata untuk menguji modul | Tinggi | Sedang | Uji dengan perubahan buatan pada data publik; ajukan pilot ke Javan |

---

## Dependencies & Blockers

**Dependensi:** M02 (data baru), M03, M06, M09, M11 dari Fase 1; pilot atau data pasca-intervensi dari Javan/klien.

**Blocker yang diketahui:** Pilot nyata belum tersedia; pengujian awal memakai data simulasi.

---

## Appendix

### Glosarium
- **Tindakan**: Intervensi yang diputuskan untuk dijalankan, dengan pemilik dan jadwal.
- **Baseline**: Nilai metrik sebelum perubahan, dengan definisi dan populasi yang sama.
- **Rencana evaluasi terkunci**: Rencana yang tidak dapat diubah setelah tanggal perubahan tanpa versi baru.
- **Sebelum–sesudah**: Membandingkan periode sebelum dan sesudah perubahan pada kelompok yang sama.
- **Selisih dari selisih (difference-in-differences)**: Membandingkan perubahan pada kelompok yang menerima tindakan dengan perubahan pada kelompok pembanding.
- **Faktor lain (confounder)**: Perubahan selain tindakan yang dapat memengaruhi hasil.

### Referensi
- `feature-modules-v1.3.md` — bagian M13 dan prinsip "hasil prediksi/simulasi dipisahkan dari hasil aktual".

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 27/30 | Target belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Alur pemilik proses belum diuji |
| Technical Constraints | 14/15 | |
| Scope & Priorities | 9/10 | Bergantung ketersediaan pilot |
| **Total** | **90/100** | |
