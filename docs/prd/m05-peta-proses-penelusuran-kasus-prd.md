# Product Requirements Document: M05 — Peta Proses dan Penelusuran Kasus

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M05), `00-prd-overview.md`, PRD M01–M04

---

## Executive Summary

Pemilik proses biasanya hanya mengenal proses dari SOP atau diagram ideal. Kenyataannya, satu proses P2P bisa dijalankan dalam ratusan variasi: ada persetujuan yang diulang, invoice yang datang sebelum barang diterima, atau perubahan harga di tengah jalan. M05 menampilkan alur yang **benar-benar terjadi** berdasarkan event log, sehingga analis dan klien melihat gambaran yang sama sebelum membahas masalah.

M05 menyediakan peta proses hasil discovery (dengan mode frekuensi dan performa), daftar varian pelaksanaan, filter, penelusuran dari setiap simpul dan transisi ke kasus pendukungnya, timeline kasus, serta jalur ke event dan baris sumber aslinya. Semua perhitungan dilakukan PM4Py di worker Python; Next.js hanya menyajikan hasil dengan React Flow.

Ini modul pertama yang dilihat juri dan Javan saat demo, jadi kejelasan visual dan kecepatan interaksi sama pentingnya dengan ketepatan angka. Fase 1 memakai satu notion kasus dengan pengelompokan berdasarkan objek terkait; peta berpusat objek (object-centric) masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Gambaran proses aktual diperoleh dari wawancara dan sampel dokumen, sehingga variasi yang jarang tetapi mahal sering terlewat. Tool process mining komersial mahal, dan hasilnya sulit dihubungkan kembali ke aturan dan bukti yang dipakai konsultan.

**Solusi yang diusulkan**: Peta proses berbasis directly-follows graph (DFG) yang dapat disederhanakan, daftar varian, filter, dan penelusuran kasus yang selalu merujuk versi dataset dan paket konteks yang dipakai.

**Dampak bisnis**: Diskusi dengan klien dimulai dari fakta yang sama. Analis menemukan pola menyimpang lebih cepat, dan setiap pola dapat dibuktikan dengan kasus serta event sumbernya.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Waktu sampai peta pertama**: < 30 detik setelah analisis dimulai untuk subset demo (≤ 250 ribu event); BPI 2019 penuh < 3 menit sebagai pekerjaan latar.
- **Responsivitas interaksi**: perubahan slider penyederhanaan dan mode tampilan < 300 ms; memuat hasil yang sudah tersimpan < 2 detik.
- **Konsistensi angka**: 100% uji otomatis lulus untuk konsistensi (jumlah kasus per varian = total kasus terfilter; frekuensi transisi sama dengan jumlah pasangan event berurutan pada kasus terkait).
- **Keterlacakan**: 100% simpul, transisi, dan varian dapat dibuka sampai daftar kasus dan event sumber.
- **Keterpahaman**: dalam uji tugas, 3 dari 3 pengguna non-teknis dapat menyebutkan varian paling sering dan transisi paling lambat < 5 menit tanpa bantuan.

**Validasi**: Uji otomatis pada BPI 2019 dibandingkan dengan hasil PM4Py langsung di notebook; uji tugas sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menjelajah alur aktual, menemukan penyimpangan, dan membuktikannya dengan kasus.
- **Pain point**: Peta dari tool umum menjadi "spaghetti" dan sulit ditelusuri ke data sumber.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Memahami bagaimana prosesnya benar-benar berjalan dan di mana waktu habis.
- **Pain point**: Diagram teknis sulit dibaca; perlu tampilan sederhana dengan istilah bisnis.
- **Level teknis**: Pemula–menengah.

---

## User Stories & Acceptance Criteria

### Story 1: Melihat peta proses aktual

**Sebagai** Analis
**Saya ingin** melihat peta proses dari versi dataset dan paket konteks yang dipilih
**Sehingga** saya memahami alur yang benar-benar terjadi

**Acceptance Criteria:**
- [ ] Pengguna memilih `DatasetVersion` terbit (M03) dan `ContextPackage` (M04); analisis dimulai melalui `POST /api/analyses` dan mengembalikan `202` dengan `analysisId`.
- [ ] Peta menampilkan simpul aktivitas, simpul awal/akhir sesuai batas proses M04 (atau awal/akhir yang teramati bila belum ada), dan transisi berarah.
- [ ] Mode **frekuensi**: jumlah kasus/kemunculan pada simpul dan transisi. Mode **performa**: median dan P90 waktu antar-event pada transisi.
- [ ] Ketebalan dan warna garis mencerminkan nilai; legenda selalu terlihat.
- [ ] Header peta menampilkan versi dataset, paket konteks, filter aktif, dan cakupan (jumlah serta persentase kasus yang ditampilkan).
- [ ] Bila matriks kemampuan M03 menyatakan tidak ada waktu mulai, label performa ditulis "jeda antar-event selesai", bukan "durasi aktivitas".

### Story 2: Menyederhanakan peta

**Sebagai** Bu Sari
**Saya ingin** menyederhanakan peta ke jalur yang paling umum
**Sehingga** saya tidak tenggelam dalam detail

**Acceptance Criteria:**
- [ ] Dua slider: persentase aktivitas dan persentase transisi yang ditampilkan (berdasarkan frekuensi).
- [ ] Bawaan: peta dengan > 30 simpul dibuka pada cakupan yang membatasi tampilan ke sekitar 30 simpul teratas.
- [ ] Penyederhanaan dihitung di klien dari hasil DFG lengkap yang sudah dimuat, tanpa memanggil worker lagi.
- [ ] Jumlah aktivitas/transisi yang disembunyikan selalu ditampilkan ("12 aktivitas disembunyikan").

### Story 3: Menelusuri varian

**Sebagai** Analis
**Saya ingin** melihat daftar varian pelaksanaan
**Sehingga** saya tahu seberapa seragam proses dijalankan

**Acceptance Criteria:**
- [ ] Daftar varian diurutkan berdasarkan jumlah kasus, menampilkan urutan aktivitas, jumlah dan persentase kasus, persentase kumulatif, serta median durasi kasus.
- [ ] Memilih satu atau beberapa varian memfilter peta dan daftar kasus.
- [ ] Ringkasan menunjukkan berapa varian yang mencakup 80% kasus.
- [ ] Untuk jumlah varian sangat besar, daftar dipaginasi (100 per halaman) tanpa memuat seluruhnya ke browser.

### Story 4: Memfilter data

**Sebagai** Analis
**Saya ingin** memfilter berdasarkan periode, atribut, aktivitas, varian, dan durasi
**Sehingga** saya dapat membandingkan subkelompok proses

**Acceptance Criteria:**
- [ ] Filter tersedia: periode (berdasarkan awal kasus, akhir kasus, atau event), atribut kasus/event yang tersedia, kehadiran/ketiadaan aktivitas, varian, rentang durasi kasus, status penyelesaian kasus, dan objek terkait.
- [ ] Filter yang bergantung pada atribut tidak tersedia dinonaktifkan dengan penjelasan dari matriks kemampuan.
- [ ] Perubahan filter memicu analisis baru di worker; hasil dengan kombinasi dataset + konteks + filter yang sama dipakai ulang dari penyimpanan.
- [ ] Filter yang menghasilkan 0 kasus menampilkan keadaan kosong dengan saran melonggarkan filter, bukan peta kosong tanpa penjelasan.

### Story 5: Dari pola ke kasus

**Sebagai** Analis
**Saya ingin** membuka kasus yang membentuk suatu simpul, transisi, atau varian
**Sehingga** saya dapat membuktikan temuan dengan contoh nyata

**Acceptance Criteria:**
- [ ] Klik pada simpul/transisi/varian membuka panel daftar kasus terkait dengan jumlah yang sama persis dengan angka di peta.
- [ ] Daftar kasus dapat diurutkan (durasi, jumlah event, waktu mulai) dan dipaginasi.
- [ ] Pengguna dapat menyimpan kumpulan kasus atau tampilan (dataset + konteks + filter + elemen terpilih) sebagai **tampilan tersimpan** untuk dirujuk M07 dan M11.

### Story 6: Timeline kasus dan sumber event

**Sebagai** Analis
**Saya ingin** melihat timeline satu kasus dan sumber setiap event
**Sehingga** saya dapat menjelaskan apa yang terjadi pada kasus tersebut kepada klien

**Acceptance Criteria:**
- [ ] Timeline menampilkan event berurutan dengan label kanonis, label asli, waktu (zona waktu proyek), sumber daya, atribut, dan jeda dari event sebelumnya.
- [ ] Event dengan masalah kualitas (dari M03), dikecualikan, atau berurutan ambigu ditandai.
- [ ] Setiap event menampilkan asal-usul: snapshot, nomor baris atau ID event asli, dan versi pemetaan.
- [ ] Atribut objek terkait (mis. nomor dokumen PO, vendor) dapat diklik untuk melihat kasus lain dengan objek yang sama.

### Story 7: Mengelompokkan berdasarkan objek terkait

**Sebagai** Analis
**Saya ingin** melihat kasus yang berbagi objek yang sama (misalnya item-item dalam satu dokumen PO)
**Sehingga** saya memahami hubungan di luar satu notion kasus

**Acceptance Criteria:**
- [ ] Untuk atribut bertipe `objek` (M03), tersedia tampilan ringkasan per objek: jumlah kasus, rentang waktu, dan varian yang muncul.
- [ ] Membuka satu objek menampilkan timeline gabungan seluruh kasus terkait, dibedakan per kasus.
- [ ] Tampilan ini diberi label "pengelompokan atribut", bukan analisis object-centric penuh.

---

## Functional Requirements

### Fitur 1: Pekerjaan analisis peta
- **Alur**: `POST /api/analyses` (tipe `process_map`, dataset, konteks, filter) → Route Handler memvalidasi dengan Zod dan `authorize()` → workflow Temporal → activity Python PM4Py menghitung DFG (frekuensi dan performa), statistik simpul, varian, dan indeks kasus per elemen → hasil disimpan sebagai manifest JSON + Parquet di `projects/{projectId}/analyses/{analysisId}/` → status `selesai`.
- **Penggunaan ulang**: kunci hasil = hash(dataset + paket konteks + filter + versi algoritma). Bila sudah ada, analisis baru langsung merujuk hasil lama.
- **Edge case**: Dataset diganti versi baru saat analisis berjalan → analisis tetap memakai versi yang dipilih; UI menampilkan bahwa versi lebih baru tersedia.
- **Error handling**: Kegagalan worker menampilkan status `gagal` dengan pesan yang dapat dipahami dan tombol coba ulang; detail teknis hanya di log.

### Fitur 2: Penyajian peta
- **Deskripsi**: Komponen klien React Flow dengan tata letak otomatis berarah kiri→kanan (mis. elkjs atau dagre; pilihan diputuskan tim). Posisi simpul stabil saat slider diubah agar pengguna tidak kehilangan orientasi.
- **Edge case**: Loop pada satu aktivitas (A→A) ditampilkan sebagai lengkung pada simpul; transisi dua arah ditampilkan sebagai dua garis terpisah.

### Fitur 3: Varian
- **Deskripsi**: Varian = urutan label kanonis per kasus setelah filter dan pengecualian M03. Disimpan dengan ID stabil (hash urutan) agar dapat dirujuk M06–M11.
- **Edge case**: Kasus dengan urutan ambigu dihitung dengan urutan stabil (waktu, lalu urutan sumber) dan ditandai pada daftar varian.

### Fitur 4: Filter
- **Deskripsi**: Definisi filter sebagai objek Zod berversi; diterjemahkan ke operasi pandas/PM4Py di worker. Filter disimpan bersama hasil agar setiap angka dapat dijelaskan.

### Fitur 5: Penelusuran kasus dan asal-usul event
- **Deskripsi**: Endpoint baca daftar kasus dan timeline dari Parquet hasil/dataset, dengan paginasi di server.
- **Integrasi M07**: elemen peta, varian, kasus, dan event menjadi node yang terhubung ke `DatasetVersion`, `ContextPackage`, filter, dan snapshot sumber.

### Fitur 6: Tampilan tersimpan
- **Deskripsi**: `SavedView` (nama, pembuat, referensi analisis, elemen terpilih, catatan). Dipakai sebagai rujukan bukti di M07/M11.

### Out of Scope (Fase 1)
- Peta berpusat objek (OCEL) dan relasi lintas proses.
- Animasi/replay token pada peta.
- Analisis jejaring sosial dan serah terima antar-sumber daya.
- Perbandingan dua peta berdampingan (dipertimbangkan bersama perbandingan kelompok di M06).
- Overlay model BPMN vs alur aktual (bagian conformance di M06).
- Ekspor gambar peta (M12, Fase 2).

---

## Technical Constraints

### Performa
- Subset ≤ 250 ribu event: analisis < 30 detik. BPI 2019 penuh: < 3 menit sebagai pekerjaan latar dengan indikator progres.
- Hasil DFG yang dikirim ke browser dibatasi pada elemen yang diperlukan untuk penyederhanaan (≤ 2 MB per peta); daftar kasus dan varian dipaginasi di server.
- Interaksi slider < 300 ms pada laptop standar juri.

### Keamanan
- Semua endpoint dan worker memakai `authorize()` M01; hasil analisis tersimpan di prefiks proyek dan tidak di-cache lintas pengguna tanpa kunci proyek.
- Nilai atribut dari data sumber di-escape saat ditampilkan.
- Tampilan tersimpan dan analisis yang dijalankan tercatat di audit log.

### Integrasi
- **M03**: `DatasetVersion`, matriks kemampuan, flag kualitas event.
- **M04**: batas proses dan populasi metrik dari `ContextPackage`.
- **M06**: memakai varian, statistik, dan filter yang sama untuk metrik dan conformance.
- **M07**: asal-usul elemen dan tampilan tersimpan.
- **M10/M11**: tampilan tersimpan sebagai bukti untuk interpretasi dan investigasi.

### Teknologi
- Worker Python: PM4Py (DFG, varian, statistik) dan pandas/PyArrow.
- Temporal: workflow TypeScript `runAnalysis` dengan activity Python.
- Next.js: komponen klien React Flow; Route Handlers untuk memulai, status, dan hasil.
- Zod: `AnalysisRequest`, `FilterSpec`, `ProcessMapResult`, `VariantPage`, `CaseTimeline`; JSON Schema diekspor ke worker Python.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| POST | `/api/analyses` | Memulai analisis peta (`202` + `analysisId`) |
| GET | `/api/analyses/{analysisId}` | Status dan manifest hasil |
| GET | `/api/analyses/{analysisId}/map` | Data DFG lengkap untuk penyederhanaan di klien |
| GET | `/api/analyses/{analysisId}/variants` | Daftar varian terpaginasi |
| GET | `/api/analyses/{analysisId}/cases` | Daftar kasus per elemen/varian, terpaginasi |
| GET | `/api/projects/{projectId}/datasets/{datasetVersionId}/cases/{caseId}` | Timeline kasus dan asal-usul event |
| GET/POST | `/api/projects/{projectId}/saved-views` | Tampilan tersimpan |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Peta DFG mode frekuensi dan performa dengan penyederhanaan di klien.
- Daftar varian, filter utama, dan penggunaan ulang hasil.
- Penelusuran simpul/transisi/varian → kasus → timeline → event sumber.
- Pengelompokan berdasarkan objek terkait (atribut).
- Tampilan tersimpan.

**Definisi MVP**: Di depan juri, analis membuka peta P2P dari BPI 2019, menyederhanakannya ke jalur utama, mengklik transisi paling lambat, membuka satu kasus, dan menunjukkan baris sumber event tersebut. Semuanya dalam kurang dari dua menit, dengan angka yang konsisten di setiap langkah.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Peta object-centric dan relasi PO–penerimaan barang–invoice.
- Animasi replay, analisis serah terima dan jejaring sosial.
- Perbandingan peta antar-kelompok/periode.
- Ekspor gambar peta.

### Pertimbangan masa depan
- Pemberitahuan ketika varian baru yang signifikan muncul pada data terbaru (berkaitan dengan M06).

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Peta "spaghetti" membingungkan juri dan klien | Tinggi | Tinggi | Penyederhanaan bawaan ke ~30 simpul, legenda jelas, mode frekuensi sebagai tampilan awal |
| Waktu analisis dataset penuh terlalu lama saat demo | Sedang | Tinggi | Subset demo yang sudah dihitung sebelumnya; penggunaan ulang hasil berbasis hash |
| Angka di peta tidak cocok dengan daftar kasus | Rendah | Tinggi | Indeks kasus per elemen dihitung di worker yang sama; uji konsistensi otomatis |
| Tata letak berubah drastis saat slider digeser | Sedang | Sedang | Hitung tata letak sekali dari peta lengkap; posisi simpul dipertahankan |
| Pengguna salah menafsirkan "jeda antar-event" sebagai durasi kerja | Sedang | Sedang | Label mengikuti matriks kemampuan M03 dan keterangan di legenda |

---

## Dependencies & Blockers

**Dependensi:**
- M03: versi dataset terbit dan matriks kemampuan.
- M04: paket konteks (batas proses, populasi metrik).
- M01: kewenangan.
- Infrastruktur Temporal + worker Python di VPS.

**Blocker yang diketahui:**
- Tidak ada untuk Fase 1; dapat dikembangkan paralel dengan M04 memakai batas proses teramati.

---

## Appendix

### Glosarium
- **Discovery**: Menyusun model alur proses dari event log.
- **DFG (Directly-Follows Graph)**: Graf yang menunjukkan aktivitas mana yang langsung diikuti aktivitas lain, beserta frekuensinya.
- **Varian**: Satu urutan aktivitas yang sama persis; kasus dengan urutan identik termasuk varian yang sama.
- **Timeline kasus**: Urutan event satu kasus beserta waktu dan atributnya.
- **Tampilan tersimpan**: Kombinasi analisis, filter, dan elemen terpilih yang disimpan untuk dirujuk sebagai bukti.
- **P90**: Nilai yang tidak dilampaui 90% pengamatan.

### Referensi
- `feature-modules-v1.3.md` — bagian M05 dan "Alur eksekusi analisis pada Next.js".
- Dokumentasi PM4Py (discovery DFG, varian, statistik).
- Dokumentasi React Flow.

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Target belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 17/20 | Belum ada mockup; perlu uji dengan pengguna non-teknis |
| Technical Constraints | 14/15 | Pustaka tata letak graf belum diputuskan |
| Scope & Priorities | 9/10 | Batas pengelompokan objek vs object-centric perlu dikomunikasikan ke juri |
| **Total** | **90/100** | |
