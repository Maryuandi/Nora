# Product Requirements Document: M06 — Monitoring Performa dan Kesesuaian

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M06), `00-prd-overview.md`, PRD M01–M05

---

## Executive Summary

M05 menunjukkan bagaimana proses berjalan. M06 menjawab pertanyaan berikutnya: **seberapa baik proses berjalan, di mana waktu habis, dan aturan mana yang tidak dipatuhi**. Hasilnya berupa metrik performa, indikasi bottleneck dan rework, status kepatuhan terhadap aturan dan SLA dari M04, serta sinyal bila suatu kondisi baru muncul atau memburuk.

Setiap hasil M06 adalah **temuan terukur**, bukan diagnosis. Sistem dapat menyatakan bahwa transisi "Record Invoice → Clear Invoice" menyumbang waktu tunggu terbesar, atau bahwa 18% kasus tidak mematuhi aturan three-way match versi 2. Sistem tidak menyatakan mengapa itu terjadi. Penjelasan penyebab adalah ranah hipotesis (M08–M09) dan investigasi analis (M11).

Semua perhitungan dikerjakan kode: PM4Py dan pandas di worker Python untuk metrik dan conformance, serta evaluator aturan untuk aturan terstruktur M04. Setiap angka dapat ditelusuri ke filter, definisi rumus berversi, versi dataset, versi aturan, dan kasus pendukungnya.

---

## Problem Statement

**Situasi saat ini**: Metrik proses dihitung manual di spreadsheet, dengan definisi yang berbeda antar-analis (rata-rata vs median, kasus terbuka ikut dihitung atau tidak). Pemeriksaan kepatuhan dilakukan dengan sampling, sehingga pelanggaran yang jarang terlewat. Perubahan performa antar-periode baru disadari ketika klien mengeluh.

**Solusi yang diusulkan**: Mesin metrik dan kepatuhan dengan definisi rumus berversi, evaluasi aturan terhadap seluruh kasus (bukan sampel), serta objek **temuan** yang membawa ukuran, pembanding, kasus pendukung, dan asal-usul lengkap.

**Dampak bisnis**: Analis Javan dapat menyajikan angka yang konsisten dan dapat diaudit, menemukan masalah lebih awal, dan memberi dasar terukur bagi rekomendasi. Ini inti dari Industrial Challenge "AI-Driven Process Intelligence & Optimization".

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Ketepatan perhitungan**: 100% metrik pada set uji cocok dengan perhitungan referensi di notebook PM4Py/pandas (toleransi 0,1% untuk nilai desimal).
- **Waktu analisis**: satu putaran monitoring lengkap (metrik, bottleneck, rework, aturan) pada subset demo < 60 detik; BPI 2019 penuh < 5 menit sebagai pekerjaan latar.
- **Waktu muat dashboard**: < 2 detik dari hasil tersimpan.
- **Keterlacakan temuan**: 100% temuan memiliki filter, definisi rumus + versi, versi dataset, paket konteks, versi aturan (bila ada), dan minimal satu kasus pendukung yang dapat dibuka.
- **Disiplin bahasa**: 0 temuan yang dilabeli sebagai "penyebab" atau "pelanggaran" tanpa aturan disetujui sebagai dasar (diuji pada teks templat temuan).

**Validasi**: Set uji referensi dari BPI 2019 dengan nilai yang dihitung independen; review templat teks temuan sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menemukan masalah performa dan kepatuhan yang dapat dipertanggungjawabkan, lengkap dengan bukti.
- **Pain point**: Menghitung ulang metrik setiap kali data baru datang; sulit menjelaskan definisi angka kepada klien.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Mengetahui kondisi prosesnya saat ini, apa yang memburuk, dan seberapa besar dampaknya.
- **Kebutuhan**: Ringkasan visual dengan istilah bisnis dan penjelasan definisi tiap angka.

---

## User Stories & Acceptance Criteria

### Story 1: Melihat dashboard performa

**Sebagai** Bu Sari
**Saya ingin** melihat ringkasan performa proses
**Sehingga** saya tahu kondisi proses saya secara cepat

**Acceptance Criteria:**
- [ ] Kartu ringkasan: jumlah kasus (dimulai/selesai), durasi kasus median dan P90, persentase kasus dengan rework, persentase kepatuhan per aturan, jumlah kasus terbuka.
- [ ] Setiap kartu menampilkan populasi metrik (M04), periode, dan cakupan data (mis. "dihitung dari 18.240 kasus selesai, 91% dari total").
- [ ] Ikon info pada setiap angka menampilkan definisi rumus dalam bahasa bisnis beserta versinya.
- [ ] Grafik tren mingguan/bulanan (Recharts) untuk volume dan durasi; periode dengan kasus < ambang minimum diberi tanda "sampel kecil".

### Story 2: Menemukan indikasi bottleneck

**Sebagai** Analis
**Saya ingin** melihat aktivitas dan transisi yang paling banyak menyumbang waktu tunggu
**Sehingga** saya tahu di mana harus menyelidiki lebih dulu

**Acceptance Criteria:**
- [ ] Daftar transisi diurutkan berdasarkan **kontribusi waktu tunggu** (total jeda pada transisi tersebut di seluruh kasus populasi), dengan median, P90, frekuensi, dan persentase kontribusi terhadap total waktu.
- [ ] Bila waktu mulai tersedia, ditampilkan juga waktu kerja (*service time*) per aktivitas, terpisah dari waktu tunggu.
- [ ] Transisi menjadi temuan "indikasi bottleneck" bila memenuhi definisi yang dikonfigurasi di proyek (bawaan: termasuk 3 teratas berdasarkan kontribusi dan P90 di atas ambang yang dapat diatur).
- [ ] Klik membuka kasus pendukung di M05, diurutkan dari jeda terpanjang.
- [ ] Teks temuan memakai kata "indikasi" dan tidak menyebut penyebab.

### Story 3: Mengukur rework

**Sebagai** Analis
**Saya ingin** melihat seberapa sering dan di mana rework terjadi sesuai definisi proyek
**Sehingga** saya dapat mengukur pemborosan akibat pengulangan

**Acceptance Criteria:**
- [ ] Rework dihitung sesuai `ReworkDefinition` di paket konteks M04; tanpa definisi, fitur menampilkan ajakan menetapkannya, bukan memakai definisi tersembunyi.
- [ ] Per aktivitas: persentase kasus dengan rework, rata-rata jumlah pengulangan, dan selisih median durasi kasus dengan vs tanpa rework.
- [ ] Selisih durasi diberi keterangan "perbandingan deskriptif, bukan dampak kausal".

### Story 4: Memeriksa kepatuhan aturan dan SLA

**Sebagai** Analis
**Saya ingin** mengevaluasi setiap kasus terhadap aturan yang disetujui di M04
**Sehingga** saya tahu seberapa luas ketidakpatuhan terjadi

**Acceptance Criteria:**
- [ ] Setiap aturan dalam paket konteks dievaluasi untuk seluruh kasus dalam cakupannya, menghasilkan status per kasus: `patuh`, `tidak patuh`, atau `tidak dapat dievaluasi` (dengan alasan, mis. atribut sumber daya tidak ada, kasus belum mencapai aktivitas B).
- [ ] SLA hari/jam kerja memakai kalender M04; bila kalender tidak ada, SLA kerja berstatus `tidak dapat dievaluasi`.
- [ ] Tabel kepatuhan per aturan menampilkan versi aturan, rujukan sumber, jumlah dan persentase tiap status, serta tren per periode.
- [ ] Kasus dievaluasi dengan versi aturan yang berlaku pada event awal kasus (sesuai M04).
- [ ] Istilah "pelanggaran" hanya dipakai untuk aturan berstatus disetujui; selain itu digunakan "tidak sesuai dengan acuan".

### Story 5: Membandingkan dengan model BPMN

**Sebagai** Analis
**Saya ingin** melihat seberapa jauh pelaksanaan menyimpang dari model BPMN yang dipetakan
**Sehingga** saya dapat menunjukkan penyimpangan alur secara terukur

**Acceptance Criteria:**
- [ ] Bila paket konteks memuat model BPMN yang lolos konversi (M04), worker menjalankan token-based replay PM4Py dan menampilkan nilai *fitness* keseluruhan dan per varian.
- [ ] Aktivitas yang sering tidak sesuai model (token hilang/tersisa) ditampilkan sebagai daftar dan disorot pada peta M05.
- [ ] Tanpa model BPMN, bagian ini menampilkan bahwa kesesuaian alur hanya dinilai melalui aturan terstruktur.
- [ ] Untuk dataset besar, replay dapat dijalankan pada varian unik (bobot sesuai jumlah kasus) agar waktu proses tetap dalam target.

### Story 6: Memantau backlog dan kasus terbuka

**Sebagai** Bu Sari
**Saya ingin** melihat berapa kasus yang masih terbuka dan sudah berapa lama
**Sehingga** saya dapat menindaklanjuti kasus yang tertahan

**Acceptance Criteria:**
- [ ] Jumlah kasus terbuka per tanggal akhir data, distribusi umur kasus terbuka (kelompok umur yang dapat diatur), dan aktivitas terakhir tempat kasus berhenti.
- [ ] Status terbuka/selesai mengikuti batas proses M04; bila batas belum ada, bagian ini menampilkan "status penyelesaian tidak diketahui".
- [ ] Umur dihitung terhadap stempel waktu event terakhir dalam dataset (bukan tanggal hari ini), dan acuan ini ditampilkan.

### Story 7: Membandingkan kelompok dan periode

**Sebagai** Analis
**Saya ingin** membandingkan metrik antar-kelompok (mis. kategori item, unit) atau antar-periode
**Sehingga** saya dapat melihat di mana perbedaan performa terjadi

**Acceptance Criteria:**
- [ ] Pengguna memilih satu atribut kelompok atau dua periode; sistem menampilkan metrik utama berdampingan, selisih, dan ukuran sampel tiap kelompok.
- [ ] Kelompok dengan kasus di bawah ambang minimum (bawaan 100, dari matriks kemampuan M03) tidak dibandingkan dan diberi tanda.
- [ ] Distribusi durasi ditampilkan sebagai box plot atau histogram agar perbedaan tidak hanya terlihat dari satu angka.
- [ ] Hasil diberi keterangan bahwa perbedaan deskriptif tidak menunjukkan penyebab.

### Story 8: Menandai temuan baru atau memburuk

**Sebagai** Analis
**Saya ingin** mengetahui temuan mana yang baru muncul atau memburuk dibanding analisis sebelumnya
**Sehingga** saya memprioritaskan perhatian pada perubahan

**Acceptance Criteria:**
- [ ] Setiap temuan dibandingkan dengan analisis pembanding yang dipilih (analisis sebelumnya dengan populasi yang sama, atau periode sebelumnya).
- [ ] Status perubahan: `baru`, `memburuk`, `stabil`, `membaik`, `tidak lagi terdeteksi`.
- [ ] Ambang perubahan dikonfigurasi per proyek (bawaan: P90 atau persentase ketidakpatuhan berubah > 20% relatif, dengan minimal 30 kasus di kedua sisi).
- [ ] Fase 1: notifikasi berupa lencana dan daftar di aplikasi; notifikasi email masuk Fase 2.

### Story 9: Menelusuri asal-usul temuan

**Sebagai** Analis
**Saya ingin** melihat dari mana suatu temuan berasal
**Sehingga** saya dapat mempertahankannya ketika klien bertanya

**Acceptance Criteria:**
- [ ] Panel asal-usul menampilkan: versi dataset, paket konteks, filter, definisi rumus + versi, versi aturan dan rujukan sumbernya, waktu analisis, dan kasus pendukung.
- [ ] Dari panel tersebut pengguna dapat membuka kasus di M05 dan dokumen sumber aturan di M04.
- [ ] Temuan dapat ditambahkan ke workspace investigasi M11.

---

## Functional Requirements

### Fitur 1: Registri definisi metrik
- **Deskripsi**: `MetricDefinition` berversi (ID, nama, deskripsi bisnis, rumus teknis, populasi, satuan). Implementasi berada di worker Python; perubahan rumus = versi baru dan uji referensi.
- **Metrik Fase 1**: durasi kasus (median, P90, rata-rata), jeda per transisi, waktu kerja per aktivitas (bila ada waktu mulai), volume dimulai/selesai per periode, throughput, persentase rework, persentase kepatuhan per aturan, jumlah dan umur kasus terbuka, cakupan data.

### Fitur 2: Pekerjaan monitoring
- **Alur**: `POST /api/analyses` tipe `monitoring` (dataset, paket konteks, filter, pembanding opsional) → workflow Temporal → activity Python menghitung metrik, bottleneck, rework, backlog, replay BPMN → activity evaluasi aturan (TypeScript untuk aturan sederhana, Python untuk aturan yang perlu operasi data besar; penempatan diputuskan tim) → penyusunan temuan → penyimpanan manifest dan Parquet.
- **Penggunaan ulang**: kunci hasil berbasis hash seperti M05; perhitungan dasar yang sama dengan M05 (varian, statistik transisi) dipakai bersama.
- **Edge case**: Kasus dengan durasi negatif atau event dikecualikan M03 tidak dihitung dan dilaporkan jumlahnya.

### Fitur 3: Evaluator aturan
- **Deskripsi**: Mengevaluasi lima jenis aturan M04 per kasus dan menyimpan hasil per kasus beserta alasan status.
- **Edge case**: Aktivitas A terjadi beberapa kali dalam satu kasus → aturan SLA memakai pasangan yang ditetapkan di definisi aturan (bawaan: kemunculan pertama A ke kemunculan pertama B setelahnya); pilihan ini ditampilkan di deskripsi aturan.
- **Edge case**: Kasus belum mencapai aktivitas B → `tidak dapat dievaluasi` untuk SLA, tetapi dapat diberi tanda "berisiko melewati SLA" bila umur sudah melampaui batas.

### Fitur 4: Objek temuan
- **Deskripsi**: `Finding` (jenis, judul berbasis templat, ukuran, pembanding, jumlah kasus terdampak, tingkat keparahan, status perubahan, asal-usul, kasus pendukung).
- **Jenis Fase 1**: indikasi bottleneck, rework tinggi, ketidakpatuhan aturan/SLA, penyimpangan model, backlog menua, tren memburuk.
- **Bahasa**: judul dihasilkan dari templat kode (bukan LLM), misalnya "Indikasi bottleneck pada transisi X → Y: P90 12,4 hari, 31% total waktu tunggu".
- **Keparahan**: dihitung dari aturan eksplisit (persentase kasus terdampak × besaran penyimpangan) yang dapat diatur per proyek.

### Fitur 5: Dashboard dan penyajian
- **Deskripsi**: Halaman monitoring Next.js dengan kartu ringkasan, grafik Recharts, tabel bottleneck, tabel kepatuhan, backlog, dan daftar temuan dengan filter status/jenis.

### Out of Scope (Fase 1)
- Prediksi (sisa waktu kasus, risiko keterlambatan berbasis model).
- Analisis penyebab akar (ranah M08, M09, M11).
- Conformance berbasis *alignments* (Fase 2; Fase 1 memakai token-based replay).
- Uji signifikansi statistik dalam perbandingan kelompok.
- Monitoring real-time/streaming dan notifikasi email.
- Metrik biaya (memerlukan data biaya yang belum tersedia).

---

## Technical Constraints

### Performa
- Subset demo: satu putaran monitoring < 60 detik. BPI 2019 penuh: < 5 menit sebagai pekerjaan latar.
- Token-based replay dijalankan per varian unik untuk menekan waktu proses.
- Dashboard dibaca dari hasil teragregasi tersimpan, < 2 detik.

### Keamanan
- `authorize()` M01 pada semua endpoint dan worker. Analis menjalankan analisis dan mengatur ambang; Pemilik proses membaca dashboard dan temuan.
- Hasil per kasus hanya dapat dibaca anggota proyek; tidak ada cache lintas proyek.
- Perubahan ambang dan definisi temuan tercatat di audit log.

### Integrasi
- **M03**: versi dataset, flag kualitas, matriks kemampuan.
- **M04**: batas proses, definisi rework, populasi metrik, aturan, kalender, model BPMN dalam paket konteks.
- **M05**: statistik dasar bersama; penyorotan pada peta; penelusuran kasus.
- **M07**: temuan dan asal-usulnya menjadi node bukti.
- **M08/M09**: temuan menjadi masukan penilaian Jev dan syarat penerapan kandidat.
- **M11**: temuan ditambahkan ke workspace investigasi.
- **M13 (Fase 2)**: mengukur ulang metrik yang sama setelah intervensi.

### Teknologi
- Worker Python: PM4Py (statistik, token-based replay), pandas/PyArrow.
- Evaluator aturan: service/worker TypeScript dan/atau Python melalui kontrak JSON Schema yang sama.
- Temporal untuk orkestrasi; PostgreSQL untuk temuan, definisi metrik, dan ambang; object storage untuk hasil per kasus.
- Recharts pada komponen klien Next.js.
- Zod: `MonitoringRequest`, `MetricDefinition`, `RuleEvaluationResult`, `Finding`, `ThresholdConfig`.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| POST | `/api/analyses` | Memulai monitoring (`202` + `analysisId`) |
| GET | `/api/analyses/{analysisId}/metrics` | Kartu ringkasan dan tren |
| GET | `/api/analyses/{analysisId}/bottlenecks` | Daftar kontribusi waktu tunggu |
| GET | `/api/analyses/{analysisId}/rework` | Statistik rework |
| GET | `/api/analyses/{analysisId}/conformance` | Kepatuhan aturan, SLA, dan fitness model |
| GET | `/api/analyses/{analysisId}/backlog` | Kasus terbuka dan umurnya |
| GET | `/api/analyses/{analysisId}/findings` | Temuan beserta status perubahan |
| GET | `/api/findings/{findingId}/lineage` | Asal-usul temuan |
| GET/PUT | `/api/projects/{projectId}/monitoring/thresholds` | Ambang temuan dan perubahan |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Registri definisi metrik dan dashboard performa.
- Indikasi bottleneck berbasis kontribusi waktu tunggu dan statistik rework.
- Evaluasi lima jenis aturan M04, SLA dengan kalender, dan token-based replay BPMN.
- Backlog dan umur kasus terbuka; perbandingan kelompok/periode deskriptif.
- Objek temuan dengan status perubahan dan panel asal-usul.

**Definisi MVP**: Di depan juri, analis menunjukkan tiga temuan pada data P2P: satu indikasi bottleneck, satu aturan three-way match dengan persentase ketidakpatuhan, dan satu temuan yang memburuk dibanding periode sebelumnya. Setiap temuan dapat dibuka sampai aturan sumber di SOP dan kasus pendukung di M05.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Alignments untuk conformance yang lebih presisi.
- Uji signifikansi dan interval kepercayaan pada perbandingan.
- Notifikasi email dan jadwal monitoring otomatis setelah sinkronisasi (M02).
- Metrik biaya bila data biaya tersedia.

### Pertimbangan masa depan
- Prediksi risiko keterlambatan kasus terbuka (dengan evaluasi model terpisah dari temuan terukur).

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Temuan dibaca klien sebagai penyebab atau tuduhan pelanggaran | Sedang | Tinggi | Templat bahasa terkontrol ("indikasi", "tidak sesuai acuan"); "pelanggaran" hanya untuk aturan disetujui |
| Definisi metrik berbeda dengan yang dipakai Javan | Sedang | Sedang | Registri definisi berversi dengan deskripsi bisnis; validasi di Problem Owner Clinic |
| Replay BPMN terlalu lambat pada dataset besar | Sedang | Sedang | Replay per varian unik; alignments ditunda ke Fase 2 |
| Perbandingan kelompok kecil menyesatkan | Sedang | Sedang | Ambang sampel minimum dan tampilan distribusi |
| Terlalu banyak temuan sehingga yang penting tenggelam | Sedang | Sedang | Keparahan berbasis aturan eksplisit, filter status, dan fokus pada `baru`/`memburuk` |

---

## Dependencies & Blockers

**Dependensi:**
- M03: versi dataset dan matriks kemampuan.
- M04: paket konteks yang memuat aturan disetujui, kalender, dan (opsional) BPMN.
- M05: statistik dasar dan penelusuran kasus.
- Set uji referensi metrik yang dihitung independen oleh anggota tim.

**Blocker yang diketahui:**
- Aturan nyata klien belum tersedia; Fase 1 memakai aturan dari SOP contoh P2P (lihat tindak lanjut di `00-prd-overview.md`).

---

## Appendix

### Glosarium
- **Durasi kasus**: Selang waktu dari event awal sampai event akhir satu kasus.
- **Waktu tunggu (jeda)**: Selang antara selesainya satu event dan event berikutnya dalam kasus yang sama.
- **Waktu kerja (*service time*)**: Selang antara waktu mulai dan selesai satu aktivitas; hanya tersedia bila waktu mulai dicatat.
- **Kontribusi waktu tunggu**: Total jeda pada suatu transisi di seluruh kasus, dibandingkan dengan total waktu semua kasus.
- **Token-based replay**: Teknik conformance yang "memutar ulang" kasus pada model untuk mengukur kesesuaian (*fitness*).
- **Temuan**: Hasil terukur yang memenuhi definisi tertentu, beserta pembanding, kasus pendukung, dan asal-usulnya.
- **Backlog**: Kasus yang belum mencapai aktivitas akhir pada titik akhir data.

### Referensi
- `feature-modules-v1.3.md` — bagian M06 dan prinsip "metrik terukur, interpretasi, hipotesis, keputusan memiliki status terpisah".
- Dokumentasi PM4Py (statistik performa, token-based replay).
- Dokumentasi Recharts.

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 27/30 | Target dan definisi metrik belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Belum ada mockup dashboard |
| Technical Constraints | 14/15 | Penempatan evaluator aturan (TS vs Python) belum diputuskan |
| Scope & Priorities | 9/10 | Batas jelas, tetapi M06 adalah modul terbesar Fase 1 |
| **Total** | **90/100** | |
