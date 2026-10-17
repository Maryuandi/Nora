# Product Requirements Document: M02 — Integrasi Sumber dan Sinkronisasi

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M02), `00-prd-overview.md`, `m01-manajemen-proyek-akses-prd.md`

---

## Executive Summary

Semua analisis bergantung pada data proses yang masuk dengan benar, utuh, dan dapat ditelusuri ke sumber aslinya. Saat ini konsultan menerima ekspor log dari klien dalam format beragam (CSV dari ERP, XES dari tool process mining, ekspor tabel database). Ekspor sering dikirim ulang dengan periode yang tumpang tindih, sehingga event mudah tergandakan dan sulit diketahui data mana yang dipakai pada suatu analisis.

M02 menyediakan pintu masuk data yang tunggal: menyimpan file sumber asli apa adanya, mencatat metadata dan checksum, mencegah penggandaan event saat data diambil ulang, dan menunjukkan kesegaran data. M02 tidak menafsirkan arti kolom; pemetaan kolom, zona waktu, dan identitas kasus adalah tugas M03.

Fase 1 hanya mendukung **impor file** (CSV dan XES) yang dijalankan sebagai workflow Temporal. Konektor API/database, sinkronisasi terjadwal, dan webhook masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Log proses dikirim sebagai file lepas. Tidak ada catatan versi, file yang diperbarui menimpa yang lama, dan impor ulang periode yang tumpang tindih menggandakan event sehingga metrik seperti volume dan durasi menjadi salah.

**Solusi yang diusulkan**: Setiap impor menjadi *snapshot* sumber yang immutable (file asli + checksum + metadata). Event diberi sidik jari (*fingerprint*) sehingga impor ulang hanya menambahkan event baru. Proses berat berjalan di worker, bukan di request Next.js.

**Dampak bisnis**: Analis dapat menjawab "angka ini dihitung dari data yang mana?" dan klien dapat mengirim ekspor ulang tanpa merusak hasil sebelumnya. Ini dasar penelusuran bukti di M07.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Keberhasilan impor file valid**: ≥ 95% file CSV/XES valid dari dataset uji berhasil sampai status `siap_dipetakan` tanpa intervensi manual.
- **Bebas duplikasi**: 0 event tergandakan saat file yang sama atau periode yang tumpang tindih diimpor ulang (diuji dengan BPI Challenge 2019 dibagi menjadi dua file beririsan).
- **Waktu sampai pratinjau**: pratinjau 100 baris pertama dan statistik dasar tersedia < 60 detik setelah unggahan file 100 MB selesai.
- **Kapasitas**: BPI Challenge 2019 penuh (sekitar 1,6 juta event / 250 ribu kasus) selesai diproses ke staging < 10 menit di VPS demo.
- **Transparansi kegagalan**: 100% baris yang ditolak dihitung dan contohnya ditampilkan; tidak ada baris yang dibuang diam-diam.

**Validasi**: Uji otomatis pada dataset BPI 2019 (penuh, terpotong, beririsan, rusak sengaja) sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Rina — Administrator proyek/integrasi
- **Tujuan**: Memasukkan data klien dengan cepat dan yakin tidak ada yang hilang atau tergandakan.
- **Pain point**: Harus membersihkan ekspor dan menggabungkan file secara manual di spreadsheet.

### Sekunder: Dimas — Analis
- **Tujuan**: Tahu data versi mana yang mendasari analisisnya dan seberapa segar data itu.
- **Pain point**: Tidak yakin apakah file terbaru sudah memuat seluruh periode.

---

## User Stories & Acceptance Criteria

### Story 1: Mengunggah file log

**Sebagai** Administrator
**Saya ingin** mengunggah file log CSV atau XES ke proyek
**Sehingga** data proses klien tersedia untuk dipetakan dan dianalisis

**Acceptance Criteria:**
- [ ] Format diterima: `.csv`, `.xes`, `.xes.gz`, dan `.zip` berisi tepat satu file CSV/XES; batas ukuran 500 MB per file.
- [ ] Format diperiksa dari isi file (bukan hanya ekstensi); file yang tidak cocok ditolak dengan pesan jelas.
- [ ] File diunggah langsung ke object storage melalui URL unggah bertanda tangan; request Next.js tidak membawa isi file.
- [ ] Unggahan hanya diizinkan untuk Administrator pada proyek berstatus `aktif` (M01).
- [ ] Setelah unggahan selesai, API mengembalikan `202 Accepted` dengan `snapshotId` dan status `memvalidasi`.

### Story 2: Memeriksa hasil impor

**Sebagai** Administrator
**Saya ingin** melihat pratinjau, statistik, dan kesalahan impor
**Sehingga** saya bisa memutuskan apakah data layak diteruskan ke pemetaan

**Acceptance Criteria:**
- [ ] Halaman snapshot menampilkan: 100 baris pertama, daftar kolom/atribut beserta contoh nilai, jumlah baris, jumlah baris ditolak, rentang nilai kolom yang tampak sebagai waktu, encoding, dan delimiter terdeteksi.
- [ ] Baris yang gagal di-parse dihitung per jenis kesalahan dan ditampilkan maksimal 50 contoh beserta nomor barisnya.
- [ ] Bila baris ditolak > 5% dari total, snapshot berstatus `perlu_tinjauan` dan Administrator harus mengonfirmasi sebelum diteruskan.
- [ ] Administrator dapat membatalkan snapshot; snapshot batal tidak dipakai modul lain, tetapi file asli dan catatannya tetap tersimpan untuk audit.

### Story 3: Impor ulang tanpa menggandakan event

**Sebagai** Administrator
**Saya ingin** mengunggah ekspor terbaru yang periodenya tumpang tindih dengan ekspor sebelumnya
**Sehingga** data diperbarui tanpa event ganda

**Acceptance Criteria:**
- [ ] File dengan checksum SHA-256 identik dengan snapshot sebelumnya pada sumber yang sama terdeteksi; sistem menawarkan untuk memakai snapshot lama, bukan memproses ulang.
- [ ] Setiap event diberi fingerprint (lihat Fitur 3); event dengan fingerprint yang sudah ada pada sumber yang sama dilewati.
- [ ] Ringkasan impor menampilkan jumlah event baru, event duplikat yang dilewati, dan event yang ditolak.
- [ ] Bila fingerprint sama tetapi atribut lain berbeda (misalnya status diperbarui), event ditandai `konflik` untuk ditinjau di M03, bukan ditimpa diam-diam.

### Story 4: Melihat kesegaran dan riwayat sumber

**Sebagai** Analis
**Saya ingin** melihat daftar sumber dan snapshot beserta kesegarannya
**Sehingga** saya tahu data mana yang mendasari analisis

**Acceptance Criteria:**
- [ ] Daftar sumber menampilkan: nama, jenis, jumlah snapshot, waktu impor terakhir, dan stempel waktu event terbaru yang terdeteksi.
- [ ] Riwayat snapshot menampilkan pengunggah, waktu, ukuran, checksum, status, dan ringkasan event baru/duplikat/ditolak.
- [ ] Setiap analisis (M05–M06) merujuk ID snapshot yang dipakai; M02 menyediakan ID tersebut secara stabil.

---

## Functional Requirements

### Fitur 1: Sumber dan snapshot
- **Deskripsi**: `Source` = asal data dalam proyek (mis. "Ekspor SAP P2P"), jenis Fase 1 = `file`. `SourceSnapshot` = satu impor: file asli immutable, checksum, format, ukuran, pengunggah, status, statistik, dan kunci staging.
- **Status snapshot**: `menunggu_unggah` → `memvalidasi` → `siap_dipetakan` / `perlu_tinjauan` / `gagal` / `dibatalkan`.
- **Edge case**: Unggahan terputus → snapshot tetap `menunggu_unggah` dan kedaluwarsa setelah 24 jam; tidak ada data setengah jadi diteruskan.

### Fitur 2: Workflow impor (Temporal)
- **Alur**:
  1. `POST .../uploads` membuat snapshot dan URL unggah bertanda tangan.
  2. Browser mengunggah ke object storage `projects/{projectId}/raw/{sourceId}/{snapshotId}/`.
  3. `POST .../complete` memvalidasi kewenangan, lalu memulai workflow `ingestSnapshot` secara idempoten (ID workflow = `snapshotId`).
  4. Activity TypeScript memverifikasi ukuran dan checksum.
  5. Activity Python (pandas untuk CSV, PM4Py untuk XES) mendeteksi encoding/delimiter, mem-parse, menghitung fingerprint, dan menulis staging Parquet ke `projects/{projectId}/staging/{snapshotId}/`.
  6. Activity TypeScript menyimpan statistik, contoh kesalahan, dan status ke PostgreSQL, lalu memberi tahu M03.
- **Kontrak**: payload `IngestSnapshotJob` (versi kontrak, `projectId`, `snapshotId`, kunci file, format) didefinisikan dengan Zod dan diekspor sebagai JSON Schema untuk worker Python.
- **Error handling**: Activity diulang otomatis untuk kegagalan sementara (mis. 3 kali dengan backoff); kesalahan permanen (file rusak, format salah) langsung `gagal` dengan pesan yang dapat dipahami Administrator.

### Fitur 3: Fingerprint event dan pencegahan duplikasi
- **Deskripsi**: Bila sumber memiliki ID event asli, fingerprint = hash(`sourceId` + ID event). Bila tidak, fingerprint = hash(`sourceId` + nilai mentah kolom kasus + aktivitas + waktu + sumber daya/atribut pembeda yang dipilih). Pemilihan kolom fingerprint dapat dikoreksi di M03; perubahan memicu perhitungan ulang.
- **Edge case**: Dua event sah yang identik pada semua kolom (mis. dua kali "Ubah harga" pada detik yang sama) dibedakan dengan urutan kemunculan dalam file sumber dan ditandai `ambigu` untuk M03.
- **Batasan**: M02 menggunakan nilai mentah; normalisasi (zona waktu, label aktivitas) dilakukan M03, sehingga fingerprint tidak bergantung pada pemetaan.

### Fitur 4: Kesegaran data
- **Deskripsi**: Per sumber dicatat waktu impor terakhir, stempel waktu event mentah terbaru, dan jumlah hari sejak impor terakhir. Ambang "data usang" dikonfigurasi per proyek (bawaan 30 hari) dan ditampilkan sebagai lencana.

### Fitur 5 (Fase 2): Konektor dan sinkronisasi berkelanjutan
- Konektor database read-only (PostgreSQL/MySQL/SQL Server) dengan query tersimpan dan kolom *watermark*.
- Konektor REST API dengan paginasi/kursor.
- Jadwal sinkronisasi via Temporal Schedule; webhook dari sumber yang mendukung.
- Pencatatan posisi sinkronisasi, percobaan ulang, dan riwayat kegagalan.
- Rahasia koneksi dienkripsi dan hanya dibaca worker.
- Sinkronisasi berhenti otomatis saat proyek tidak `aktif` (sinyal dari M01).

### Out of Scope (Fase 1)
- Konektor API/database, jadwal, dan webhook (Fase 2).
- Format XLSX, Parquet, dan OCEL 2.0 sebagai masukan (OCEL dipertimbangkan di Fase 2 bersama M03).
- Unggahan yang dapat dilanjutkan (*resumable*).
- Pemindaian malware otomatis.
- Pemetaan kolom, zona waktu, dan identitas kasus (M03).

---

## Technical Constraints

### Performa
- Request `complete` dan pembacaan status < 500 ms p95; tidak ada parsing di Route Handler.
- Parsing dilakukan bertahap (*chunked*) agar memori worker Python tetap < 4 GB untuk file 500 MB.
- Pratinjau dibaca dari ringkasan yang telah disimpan, bukan membaca ulang file mentah.

### Keamanan
- Kewenangan unggah/baca diperiksa melalui `authorize()` M01; URL bertanda tangan berlaku 15 menit dan terikat pada kunci objek proyek.
- File mentah immutable; tidak ada endpoint untuk mengubah isinya.
- Enkripsi saat disimpan pada object storage diaktifkan bila tersedia di penyimpanan VPS (mis. enkripsi sisi server MinIO); bila tidak, enkripsi disk VPS.
- Nama file dan isi tidak dieksekusi atau dirender sebagai HTML (mencegah injeksi pada pratinjau).
- Pengunggahan, pembatalan, dan pemakaian snapshot dicatat di audit log M01.

### Integrasi
- **M01**: status proyek dan kewenangan; penghentian sinkronisasi (Fase 2).
- **M03**: menerima pemberitahuan snapshot `siap_dipetakan` beserta kunci staging dan daftar kolom.
- **M07**: snapshot menjadi node asal-usul (`Source` → `Snapshot` → event).

### Teknologi
- Next.js Route Handlers + Zod untuk endpoint.
- Object storage kompatibel S3 di VPS (mis. MinIO) untuk file mentah dan staging Parquet.
- Temporal: workflow TypeScript `ingestSnapshot`; activity Python dengan pandas/PyArrow dan PM4Py.
- PostgreSQL: `sources`, `source_snapshots`, `ingest_error_samples`, `event_fingerprints` (indeks unik per `source_id` + `fingerprint`).

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET/POST | `/api/projects/{projectId}/sources` | Daftar/buat sumber |
| POST | `/api/projects/{projectId}/sources/{sourceId}/uploads` | Buat snapshot + URL unggah |
| POST | `/api/projects/{projectId}/sources/{sourceId}/uploads/{snapshotId}/complete` | Tandai selesai, mulai workflow (`202`) |
| GET | `/api/projects/{projectId}/snapshots/{snapshotId}` | Status, statistik, pratinjau, contoh kesalahan |
| POST | `/api/projects/{projectId}/snapshots/{snapshotId}/confirm` | Konfirmasi snapshot `perlu_tinjauan` |
| POST | `/api/projects/{projectId}/snapshots/{snapshotId}/cancel` | Batalkan snapshot |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Sumber berjenis file; unggah CSV/XES (termasuk gz/zip) hingga 500 MB.
- Workflow impor Temporal dengan activity Python.
- Pratinjau, statistik, contoh kesalahan, konfirmasi/batal.
- Deteksi checksum identik dan fingerprint event untuk impor ulang beririsan.
- Riwayat snapshot dan indikator kesegaran.

**Definisi MVP**: Di depan juri, BPI 2019 diimpor dalam dua bagian yang beririsan. Ringkasan menunjukkan event baru dan duplikat yang dilewati, total event sama dengan dataset asli, dan setiap analisis merujuk snapshot yang dipakai.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Konektor database dan REST API, sinkronisasi terjadwal, webhook.
- Unggahan resumable dan pemindaian malware.
- Masukan XLSX, Parquet, dan OCEL 2.0.
- Penghapusan data sesuai retensi kontrak.

### Pertimbangan masa depan
- Konektor siap pakai untuk ERP yang umum dipakai klien Javan (mis. SAP, Odoo), setelah divalidasi kebutuhan.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Fingerprint tanpa ID event asli salah menganggap event sah sebagai duplikat | Sedang | Tinggi | Gunakan urutan kemunculan untuk event identik, tandai `ambigu`, dan izinkan koreksi kolom fingerprint di M03 |
| File besar membuat worker Python kehabisan memori di VPS | Sedang | Sedang | Parsing chunked ke Parquet; uji dengan BPI 2019 penuh sejak awal |
| Ekspor klien memakai encoding/delimiter tidak umum | Tinggi | Rendah | Deteksi otomatis + opsi penggantian manual pada pratinjau |
| Format sumber Javan berbeda jauh dari dataset publik | Sedang | Sedang | Minta contoh ekspor anonim di Problem Owner Clinic; parser modular per format |
| Waktu habis untuk konektor sebelum analisis inti berjalan | Sedang | Sedang | Konektor dikunci di Fase 2 |

---

## Dependencies & Blockers

**Dependensi:**
- M01: kewenangan dan status proyek.
- Object storage dan Temporal berjalan di VPS (tim operasional).
- Paket kontrak Zod → JSON Schema (layanan bersama).
- Unduhan dataset BPI Challenge 2019 dan pembagian file uji.

**Blocker yang diketahui:**
- Contoh format ekspor dari Javan belum tersedia; Fase 1 berjalan dengan dataset publik.

---

## Appendix

### Glosarium
- **Sumber**: Asal data dalam proyek, misalnya ekspor ERP tertentu.
- **Snapshot**: Satu kali impor dari sumber; file asli dan hasilnya tidak diubah setelah tersimpan.
- **Staging**: Hasil parse mentah dalam Parquet, belum dipetakan maknanya.
- **Fingerprint event**: Hash identitas event untuk mendeteksi duplikasi antar-impor.
- **Watermark**: Penanda posisi terakhir sinkronisasi (Fase 2).

### Referensi
- `feature-modules-v1.3.md` — bagian M02 dan "Kontrak validasi TypeScript dan Python".
- [Temporal TypeScript](https://docs.temporal.io/develop/typescript)
- [Zod: ekspor JSON Schema](https://zod.dev/json-schema)
- BPI Challenge 2019 (4TU.ResearchData).

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Target diusulkan, belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Alur unggah belum diuji dengan pengguna |
| Technical Constraints | 14/15 | Pilihan object storage final di tangan tim |
| Scope & Priorities | 10/10 | |
| **Total** | **90/100** | |
