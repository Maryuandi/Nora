# Product Requirements Document: M08 — Klasifikasi dan Penilaian Terstruktur (Jev)

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M08), `00-prd-overview.md`, PRD M01–M07

---

## Executive Summary

Sebagian pekerjaan analis tidak bisa diselesaikan dengan rumus. Contohnya: menggolongkan aktivitas "Change Approval for Purchase Order" sebagai jenis persetujuan, membaca catatan penolakan untuk mengetahui alasannya, atau menilai apakah hipotesis "persetujuan menumpuk pada satu approver" relevan dengan suatu indikasi bottleneck. Keputusan semacam ini semantik, berulang, dan jumlahnya banyak.

M08 menyerahkan keputusan semantik tersebut kepada **Jev**, model *System One* dari TypeSafe AI. Jev tidak menghasilkan teks; ia mengembalikan nilai dari skema yang ditetapkan sebelumnya (pilihan, skor, atau ya/tidak) beserta probabilitas. Karena itu Jev cocok untuk prinsip sistem ini: model memilih dari opsi dan rubrik yang dikurasi analis (M04), berdasarkan paket bukti yang dipilih aplikasi (M07), dan hasilnya disimpan terpisah dari fakta sumber maupun keputusan manusia.

Jev tetap bisa salah. Skema hanya menjamin bentuk keluaran, bukan kebenarannya. Karena itu M08 menyimpan probabilitas, menandai hasil yang tidak pasti untuk ditinjau, menyimpan koreksi analis tanpa menimpa hasil asli, dan mengevaluasi model dengan set acuan berlabel. Akses Jev masih *early access*, sehingga integrasinya dibungkus adapter yang dapat disesuaikan setelah dokumentasi resmi dipastikan.

---

## Problem Statement

**Situasi saat ini**: Penggolongan aktivitas dan pembacaan catatan dilakukan manual atau dengan LLM yang menghasilkan teks bebas, lalu di-parse. Keluaran LLM perlu divalidasi ulang, tidak konsisten antar-pemanggilan, sulit diukur ketidakpastiannya, dan mahal bila dijalankan untuk ribuan item.

**Solusi yang diusulkan**: Layanan penilaian terstruktur yang mengajukan pertanyaan bertipe kepada Jev dengan opsi dan rubrik eksplisit, memakai paket bukti M07 sebagai konteks, menyimpan hasil beserta probabilitas dan versi model, lalu mengarahkan hasil tidak pasti ke antrean tinjauan analis.

**Dampak bisnis**: Ribuan keputusan semantik dapat diproses cepat dan murah dengan ketidakpastian yang terlihat, sementara analis fokus meninjau kasus yang benar-benar meragukan. Ini juga menunjukkan kepada juri pembagian kerja AI yang jelas: Jev menilai, kode menghitung, LLM menjelaskan, manusia memutuskan.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Akurasi klasifikasi aktivitas**: ≥ 85% kesesuaian dengan label analis pada set acuan (≈ 60–100 label aktivitas dari dataset demo).
- **Kesesuaian penilaian relevansi kandidat**: ≥ 70% kesesuaian kategori dengan penilaian analis pada set acuan (≈ 50 pasangan temuan–kandidat).
- **Kalibrasi**: pada hasil dengan probabilitas pilihan teratas ≥ 0,8, akurasi aktual ≥ 80% (diukur dengan diagram reliabilitas pada set acuan).
- **Efisiensi tinjauan**: ≤ 30% hasil masuk antrean `perlu_review` pada ambang bawaan, tanpa menurunkan akurasi hasil otomatis di bawah target.
- **Keterlacakan**: 100% hasil memiliki paket bukti, spesifikasi pertanyaan + versi, versi model, dan keluaran mentah.
- **Waktu**: satu batch 100 penilaian selesai < 2 menit (dipengaruhi batas laju API).

**Validasi**: Set acuan dilabeli dua anggota tim secara independen sebelum Prototype Readiness Review; evaluasi diulang setiap ganti versi model atau spesifikasi pertanyaan.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menyerahkan keputusan semantik berulang ke model dan hanya meninjau yang meragukan.
- **Pain point**: Menggolongkan dan membaca ratusan item secara manual; tidak percaya keluaran LLM bebas tanpa tahu tingkat keyakinannya.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Tahu bagian mana yang dinilai mesin dan seberapa yakin penilaian itu.

---

## Tentang Jev dan pemetaannya

Informasi publik (September 2026) menyebut Jev sebagai model *System One* dari TypeSafe AI yang mengembalikan keputusan bertipe dengan probabilitas terkalibrasi, dengan tiga primitif pertanyaan: **Noul** (ya/tidak), **Choice** (pilihan dari daftar), dan **Score** (skor ordinal). Akses langsung masih *early access*; Jev juga dilaporkan tersedia melalui layanan inferensi pihak ketiga.

**Detail API (nama endpoint, format permintaan/respons, batas laju, harga, kebijakan data) wajib dikonfirmasi dari dokumentasi resmi sebelum implementasi.** PRD ini hanya bergantung pada konsep tiga primitif di atas melalui adapter.

| Tugas M08 | Primitif Jev | Keluaran yang disimpan |
|---|---|---|
| Apakah bukti cukup untuk menilai? | Noul | Probabilitas "cukup" |
| Golongan aktivitas / alasan catatan | Choice | Distribusi probabilitas atas opsi |
| Nilai per kriteria rubrik | Score | Skor ordinal + probabilitas per tingkat (bila tersedia) |
| Kesimpulan relevansi kandidat | Choice | Relevan / sebagian relevan / tidak relevan / informasi tidak cukup |

**Agregasi skor kriteria menjadi skor total dilakukan kode** dengan bobot rubrik M04, bukan oleh model.

---

## User Stories & Acceptance Criteria

### Story 1: Menggolongkan aktivitas secara semantik

**Sebagai** Analis
**Saya ingin** setiap label aktivitas kanonis digolongkan ke kategori yang saya tetapkan
**Sehingga** definisi rework, filter, dan hipotesis dapat memakai jenis aktivitas, bukan hanya namanya

**Acceptance Criteria:**
- [ ] Analis memilih atau menyunting daftar kategori (bawaan: persetujuan, pembuatan, perubahan, pembatalan, penerimaan, pencatatan dokumen, pembayaran, lainnya).
- [ ] Setiap label kanonis dinilai dengan primitif Choice; konteks = label, contoh atribut, posisi umum dalam varian (dari M05), dan definisi kategori.
- [ ] Hasil menampilkan kategori teratas, probabilitasnya, dan kategori kedua.
- [ ] Hasil yang disetujui analis tersedia sebagai atribut turunan untuk filter M05 dan definisi rework M04.

### Story 2: Mengklasifikasikan catatan teks

**Sebagai** Analis
**Saya ingin** catatan pengembalian, penolakan, atau keterangan aktivitas digolongkan berdasarkan alasan
**Sehingga** saya tahu alasan dominan di balik rework atau penolakan

**Acceptance Criteria:**
- [ ] Fitur aktif bila dataset memiliki atribut bertipe teks yang dipilih analis; bila tidak ada, fitur dinonaktifkan dengan penjelasan dari matriks kemampuan M03.
- [ ] Taksonomi alasan ditetapkan analis (mis. harga tidak sesuai, kuantitas tidak sesuai, dokumen kurang, vendor salah, lainnya) dan diberi versi.
- [ ] Setiap catatan dinilai dengan Choice; hasil teragregasi per aktivitas dan per periode.
- [ ] Untuk Demo Day, karena BPI 2019 tidak memiliki catatan teks, fitur ini didemokan dengan **subset catatan sintetis yang diberi label jelas sebagai data sintetis**.

### Story 3: Menilai relevansi kandidat hipotesis dan intervensi

**Sebagai** Analis
**Saya ingin** setiap kandidat dari katalog dinilai relevansinya terhadap suatu temuan berdasarkan rubrik
**Sehingga** saya mendapat daftar kandidat yang layak diselidiki lebih dulu

**Acceptance Criteria:**
- [ ] Kandidat yang dinilai hanya berasal dari katalog M04 (dan tambahan analis); M08 tidak membuat kandidat baru.
- [ ] Kandidat yang syarat penerapannya tidak terpenuhi atau tidak dapat dihitung (M04/M09) tidak dikirim ke Jev dan diberi status sesuai.
- [ ] Alur per pasangan temuan–kandidat: (1) Noul "apakah bukti cukup?"; bila probabilitas < ambang, status `informasi_tidak_cukup`; (2) Score untuk setiap kriteria rubrik; (3) Choice kesimpulan relevansi.
- [ ] Paket bukti dibentuk M07 dengan tujuan `jev_assessment` dan dirujuk oleh hasil.
- [ ] Skor total dihitung kode dari skor kriteria dan bobot rubrik, ditampilkan beserta rinciannya.

### Story 4: Menandai ketidakpastian dan meninjau

**Sebagai** Analis
**Saya ingin** hasil yang tidak pasti masuk antrean tinjauan
**Sehingga** saya hanya memeriksa yang perlu

**Acceptance Criteria:**
- [ ] Status hasil: `otomatis` (yakin), `perlu_review`, `informasi_tidak_cukup`, `gagal`.
- [ ] Hasil menjadi `perlu_review` bila probabilitas teratas < ambang (bawaan 0,6) atau selisih dengan opsi kedua < margin (bawaan 0,15); ambang dapat diatur per jenis tugas.
- [ ] Antrean tinjauan dapat difilter per tugas, temuan, dan status; menampilkan opsi, probabilitas, dan tautan ke paket bukti.
- [ ] Hasil `otomatis` tetap dapat ditinjau; label "dinilai model" selalu terlihat sampai dikonfirmasi analis.

### Story 5: Mengoreksi hasil model

**Sebagai** Analis
**Saya ingin** mengoreksi label atau skor yang salah
**Sehingga** keputusan akhir benar tanpa menghilangkan jejak penilaian model

**Acceptance Criteria:**
- [ ] Koreksi disimpan sebagai catatan terpisah (pelaku, waktu, nilai baru, alasan) yang merujuk hasil model asli; hasil asli tidak diubah.
- [ ] Nilai efektif = koreksi analis bila ada, selain itu hasil model; keduanya ditampilkan.
- [ ] Koreksi dapat ditandai untuk dimasukkan ke set acuan evaluasi.

### Story 6: Mengevaluasi kinerja model

**Sebagai** Analis
**Saya ingin** melihat seberapa akurat dan terkalibrasi Jev pada tugas proyek ini
**Sehingga** saya tahu seberapa jauh hasil otomatis dapat dipercaya

**Acceptance Criteria:**
- [ ] Set acuan per tugas dikelola di aplikasi (item, label analis, pelabel).
- [ ] Laporan evaluasi: akurasi, macro-F1 (klasifikasi), kesesuaian kategori (relevansi), diagram reliabilitas, dan cakupan otomatis pada ambang aktif.
- [ ] Evaluasi dicatat per versi model dan versi spesifikasi pertanyaan, sehingga perubahan kinerja dapat dibandingkan.

---

## Functional Requirements

### Fitur 1: Spesifikasi pertanyaan
- **Deskripsi**: `QuestionSpec` berversi (Zod): tugas, primitif, teks pertanyaan, opsi beserta definisinya (Choice), skala dan definisi tiap tingkat (Score), templat pembentuk status dari paket bukti, dan ambang.
- **Sumber opsi**: kategori aktivitas/taksonomi alasan dari konfigurasi proyek; kandidat dan rubrik dari katalog M04.
- **Edge case**: Opsi berubah setelah hasil dibuat → hasil lama tetap merujuk versi spesifikasi lamanya dan ditandai "spesifikasi telah diperbarui".

### Fitur 2: Adapter model keputusan
- **Deskripsi**: Antarmuka TypeScript `DecisionModelAdapter` dengan operasi `noul`, `choice`, dan `score` yang menerima status (teks/terstruktur dari paket bukti), pertanyaan, dan opsi/skala; mengembalikan nilai bertipe, probabilitas, ID model + versi, ID permintaan, latensi, dan biaya bila tersedia.
- **Implementasi**: `JevAdapter` (HTTP ke penyedia yang dipilih tim) dan `FixtureAdapter` (hasil deterministik untuk uji otomatis). Keluaran adapter divalidasi dengan Zod sebelum disimpan.
- **Tanpa pengganti diam-diam**: bila Jev tidak tersedia, pekerjaan berstatus `tertunda` dan diulang; sistem **tidak** beralih otomatis ke LLM untuk penilaian.

### Fitur 3: Pekerjaan penilaian batch
- **Alur**: Pemicu (setelah analisis M06 selesai, atau manual) → workflow Temporal → M07 membentuk paket bukti per target → activity adapter memanggil Jev dengan batas laju dan percobaan ulang → hasil + keluaran mentah disimpan → status diturunkan dari ambang → node `Assessment` diproyeksikan ke M07.
- **Penggunaan ulang**: kunci = hash(paket bukti + spesifikasi pertanyaan + versi model); hasil yang sama tidak dipanggil ulang. Untuk demo, hasil dihitung lebih dulu.
- **Biaya**: jumlah pemanggilan dan biaya per proyek dicatat; batas harian per proyek dapat diatur.

### Fitur 4: Antrean tinjauan dan koreksi
- **Deskripsi**: Daftar hasil per status dengan aksi konfirmasi/koreksi; koreksi sebagai `AssessmentCorrection`.

### Fitur 5: Evaluasi
- **Deskripsi**: `GoldSet` dan `EvaluationRun` per tugas; perhitungan metrik di worker; laporan di UI.

### Out of Scope (Fase 1)
- Pembuatan kandidat hipotesis/intervensi oleh model.
- Fine-tuning atau pelatihan ulang Jev.
- Penilaian langsung atas angka/metrik (dihitung kode di M06/M09).
- Ensembel dengan model lain atau fallback LLM untuk penilaian.
- Pengiriman data klien nyata ke API eksternal sebelum ada persetujuan pemrosesan data (lihat Keamanan).

---

## Technical Constraints

### Performa
- Latensi per pemanggilan mengikuti penyedia; target batch 100 penilaian < 2 menit dengan paralelisme yang menghormati batas laju.
- Pemanggilan Jev hanya dari worker Temporal, tidak pernah dari request Next.js.

### Keamanan dan pelindungan data
- Kunci API disimpan sebagai rahasia server, hanya dibaca worker.
- **Data dikirim ke penyedia eksternal.** Fase 1 memakai dataset publik dan data sintetis. Sebelum memakai data klien nyata: kebijakan retensi/pelatihan penyedia harus diperiksa, persetujuan klien dan kontrak (M01) harus mengizinkannya, dan kolom data pribadi (mis. nama sumber daya) diminimalkan atau dipseudonimkan sebelum dikirim. Pertimbangan ini masuk tahap IP & Compliance pasca-hackathon.
- Paket bukti hanya berisi data proyek peminta (M07).
- Konfigurasi ambang, koreksi, dan eksekusi batch tercatat di audit log.

### Integrasi
- **M04**: kategori, taksonomi, kandidat, rubrik, syarat penerapan.
- **M06**: temuan sebagai target penilaian.
- **M07**: paket bukti (`jev_assessment`); hasil kembali sebagai node `Assessment` dengan relasi kategori dukungan hipotesis.
- **M09**: memakai skor dan status relevansi untuk validasi dan prioritas.
- **M10**: memakai hasil Jev beserta bukti aslinya untuk penjelasan.
- **M11**: tinjauan dan koreksi di workspace investigasi.

### Teknologi
- Service model TypeScript dengan `DecisionModelAdapter`; worker Temporal TypeScript.
- Zod: `QuestionSpec`, `DecisionRequest`, `DecisionResult`, `Assessment`, `AssessmentCorrection`, `GoldSetItem`, `EvaluationRun`.
- PostgreSQL untuk hasil, koreksi, set acuan, dan evaluasi; object storage untuk keluaran mentah.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET/POST | `/api/projects/{projectId}/assessment-specs` | Spesifikasi pertanyaan |
| POST | `/api/projects/{projectId}/assessments/runs` | Memulai batch (`202`) |
| GET | `/api/projects/{projectId}/assessments?status=&findingId=` | Hasil dan antrean tinjauan |
| GET | `/api/projects/{projectId}/assessments/{assessmentId}` | Detail, keluaran mentah, paket bukti |
| POST | `/api/projects/{projectId}/assessments/{assessmentId}/corrections` | Koreksi analis |
| GET/POST | `/api/projects/{projectId}/gold-sets` | Set acuan |
| POST | `/api/projects/{projectId}/evaluations` | Menjalankan evaluasi (`202`) |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Adapter Jev dengan tiga primitif, divalidasi Zod, ditambah adapter fixture untuk uji.
- Klasifikasi semantik aktivitas.
- Klasifikasi catatan teks pada subset sintetis berlabel.
- Penilaian relevansi kandidat hipotesis/intervensi dengan alur Noul → Score → Choice.
- Status ketidakpastian, antrean tinjauan, koreksi terpisah.
- Set acuan dan laporan evaluasi dasar.

**Definisi MVP**: Di depan juri, untuk satu indikasi bottleneck, sistem menampilkan 5 kandidat hipotesis dari katalog yang dinilai Jev. Setiap kandidat memiliki skor per kriteria, probabilitas, dan paket bukti. Satu kandidat berstatus `perlu_review` dan dikoreksi analis, dan laporan evaluasi menunjukkan akurasi serta kalibrasi pada set acuan.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Penilaian pada data klien nyata setelah persetujuan pemrosesan data.
- Klasifikasi catatan teks pada data nyata dan taksonomi yang divalidasi Javan.
- Penyesuaian ambang otomatis berdasarkan hasil evaluasi.
- Pemakaian Jev sebagai pemeriksa (*guardrail*) keluaran LLM di M10, bila sesuai.

### Pertimbangan masa depan
- Penilaian berkelanjutan pada data baru setelah sinkronisasi M02.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Akses early access Jev tidak tersedia atau API berubah | Sedang | Tinggi | Adapter netral; konfirmasi akses sedini mungkin; hasil demo dihitung lebih dulu; status `tertunda` bila layanan mati |
| Hasil model yang salah tetapi yakin diterima tanpa tinjauan | Sedang | Tinggi | Label "dinilai model", evaluasi kalibrasi, sampel acak hasil `otomatis` untuk ditinjau |
| Set acuan terlalu kecil sehingga evaluasi tidak meyakinkan | Sedang | Sedang | Dua pelabel independen; laporkan ukuran set dan kesepakatan antar-pelabel |
| Data sensitif klien terkirim ke penyedia eksternal | Rendah (Fase 1) | Tinggi | Fase 1 hanya data publik/sintetis; minimisasi dan pseudonimisasi sebelum Fase 2 |
| Juri menganggap Jev sekadar pengganti LLM | Sedang | Sedang | Tunjukkan perbedaan: keluaran bertipe, probabilitas, agregasi oleh kode, tanpa teks bebas |

---

## Dependencies & Blockers

**Dependensi:**
- Akses Jev (early access TypeSafe atau penyedia inferensi pihak ketiga) dan dokumentasi API resmi.
- M04: katalog dan rubrik; M06: temuan; M07: paket bukti.
- Set acuan berlabel dan subset catatan sintetis (disusun tim).

**Blocker yang diketahui:**
- ✅ Akses API Jev sudah dimiliki tim (dikonfirmasi 2026-10-17).
- Detail API (format permintaan/respons, batas laju, biaya, kebijakan retensi data) masih perlu dicocokkan dengan dokumentasi resmi; adapter dikerjakan lebih dulu dengan adapter fixture lalu disesuaikan.

---

## Appendix

### Glosarium
- **Jev**: Model *System One* TypeSafe AI yang mengembalikan keputusan bertipe beserta probabilitas, bukan teks.
- **Noul / Choice / Score**: Tiga primitif pertanyaan Jev: ya/tidak, pilihan dari daftar, skor ordinal.
- **Spesifikasi pertanyaan**: Definisi berversi atas pertanyaan, opsi/skala, dan ambang untuk satu tugas.
- **Kalibrasi**: Kesesuaian antara probabilitas yang diberikan model dan frekuensi benar yang sebenarnya.
- **Set acuan (gold set)**: Item berlabel analis untuk mengukur kinerja model.
- **Koreksi**: Nilai yang ditetapkan analis atas hasil model, disimpan terpisah dari hasil asli.

### Referensi
- `feature-modules-v1.3.md` — bagian M08 dan prinsip "Jev memproses penilaian semantik terstruktur".
- TypeSafe AI, pengumuman *System One Models & Jev*, 15 September 2026 (via liputan DigitalOcean, DataCamp, dan media lain).
- Dokumentasi API resmi Jev (perlu diperoleh tim).

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 27/30 | Target akurasi belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Antrean tinjauan belum diuji dengan pengguna |
| Technical Constraints | 13/15 | Detail API, batas laju, dan kebijakan data Jev belum dikonfirmasi |
| Scope & Priorities | 10/10 | |
| **Total** | **90/100** | |
