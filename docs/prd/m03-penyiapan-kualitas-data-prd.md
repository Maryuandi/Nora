# Product Requirements Document: M03 — Penyiapan dan Kualitas Data

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M03), `00-prd-overview.md`, PRD M01–M02

---

## Executive Summary

Process mining hanya sebaik event log-nya. Satu kesalahan pemetaan, misalnya zona waktu yang salah, kolom kasus yang keliru, atau label aktivitas yang sama ditulis dua cara, langsung merusak peta proses, durasi, dan indikasi bottleneck. Analis bisa menyajikan temuan yang tampak meyakinkan tetapi salah.

M03 mengubah data mentah dari M02 menjadi **versi dataset event** yang terstandar, dapat diulang, dan disertai laporan kualitas. Pengguna memetakan kolom ke konsep event (kasus, aktivitas, waktu, sumber daya, atribut), menormalkan label aktivitas, menetapkan format dan zona waktu, lalu sistem memeriksa masalah kualitas dan menyatakan analisis apa saja yang layak dijalankan dengan data tersebut.

Data mentah tidak pernah diubah. Setiap perbaikan dicatat sebagai aturan transformasi berversi, sehingga snapshot yang sama dengan pemetaan yang sama selalu menghasilkan dataset yang identik. Fase 1 memakai satu notion kasus dengan objek terkait sebagai atribut; model lintas objek penuh (OCEL) masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Pembersihan log dilakukan di spreadsheet atau notebook pribadi. Langkahnya tidak terdokumentasi, sulit diulang saat data baru datang, dan keterbatasan data (misalnya tidak ada waktu mulai aktivitas) jarang disampaikan ke klien sehingga metrik bisa ditafsirkan berlebihan.

**Solusi yang diusulkan**: Antarmuka pemetaan dengan saran otomatis, aturan normalisasi dan perbaikan yang berversi, pemeriksaan kualitas otomatis di worker Python, serta matriks kemampuan analisis yang diturunkan dari atribut yang tersedia.

**Dampak bisnis**: Temuan di M05–M08 dapat dipertanggungjawabkan, persiapan data untuk ekspor berikutnya dari klien yang sama bisa dipakai ulang, dan batasan data tersampaikan sejak awal.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Akurasi saran pemetaan**: untuk file XES standar dan CSV dengan nama kolom umum, ≥ 90% kolom wajib (kasus, aktivitas, waktu) disarankan benar tanpa koreksi.
- **Waktu sampai dataset valid**: Administrator/Analis yang baru pertama kali memakai dapat menghasilkan versi dataset BPI 2019 < 15 menit kerja aktif (tidak termasuk waktu proses worker).
- **Waktu proses**: BPI 2019 penuh dipetakan dan diperiksa < 10 menit di VPS demo.
- **Reprodusibilitas**: snapshot + versi pemetaan + aturan perbaikan yang sama menghasilkan hash dataset identik pada 100% uji ulang.
- **Keterlacakan masalah**: 100% temuan kualitas dapat dibuka sampai baris/event sumbernya.

**Validasi**: Uji otomatis dengan BPI 2019 dan BPI 2017 (pemetaan berbeda), uji tugas pada 3 pengguna sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Dataset yang ia percaya, dengan batasan yang jelas, sebelum menganalisis.
- **Pain point**: Menghabiskan waktu membersihkan data berulang kali, dan tidak yakin apakah hasil akhirnya sama dengan kemarin.

### Sekunder: Rina — Administrator
- **Tujuan**: Menyiapkan pemetaan awal setelah impor, lalu menyerahkannya ke analis.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Memahami mengapa sebagian kasus tidak dihitung atau mengapa suatu metrik tidak tersedia.
- **Kebutuhan**: Penjelasan batasan data dalam bahasa bisnis.

---

## User Stories & Acceptance Criteria

### Story 1: Memetakan kolom ke konsep event

**Sebagai** Analis atau Administrator
**Saya ingin** memetakan kolom sumber ke kasus, aktivitas, waktu, sumber daya, dan atribut
**Sehingga** data mentah menjadi event log yang dapat dianalisis

**Acceptance Criteria:**
- [ ] Sistem menampilkan kolom dari snapshot `siap_dipetakan` (M02) beserta contoh nilai dan saran pemetaan.
- [ ] Kolom wajib: ID kasus, aktivitas, waktu (selesai). Kolom opsional: waktu mulai, sumber daya, ID event asli, siklus hidup (*lifecycle*), atribut kasus, atribut event.
- [ ] Untuk XES, atribut standar (`case:concept:name`, `concept:name`, `time:timestamp`, `org:resource`, `lifecycle:transition`) dipetakan otomatis.
- [ ] Pengguna menetapkan format waktu (terdeteksi otomatis, dapat diubah) dan zona waktu sumber; waktu disimpan dalam UTC dan ditampilkan sesuai zona waktu proyek.
- [ ] Pratinjau 50 event hasil pemetaan diperbarui setiap kali pemetaan diubah, sebelum diproses penuh.
- [ ] Pemetaan disimpan sebagai template sumber dan diterapkan otomatis ke snapshot berikutnya dari sumber yang sama; kolom baru atau hilang ditandai untuk ditinjau.

### Story 2: Menormalkan label aktivitas

**Sebagai** Analis
**Saya ingin** menggabungkan label aktivitas yang berbeda penulisan tetapi bermakna sama
**Sehingga** peta proses tidak terpecah oleh variasi penulisan

**Acceptance Criteria:**
- [ ] Sistem menampilkan daftar label unik beserta frekuensinya.
- [ ] Sistem menyarankan kelompok label yang mirip (perbedaan huruf besar/kecil, spasi, tanda baca, dan kemiripan string), tetapi tidak menerapkannya tanpa persetujuan pengguna.
- [ ] Pengguna dapat mengganti nama, menggabungkan, atau mengecualikan label; setiap perubahan menjadi bagian versi pemetaan.
- [ ] Label asli tetap tersimpan pada setiap event (`activity_raw`) di samping label kanonis (`activity`).

### Story 3: Memeriksa kualitas data

**Sebagai** Analis
**Saya ingin** laporan kualitas yang menunjukkan masalah dan dampaknya
**Sehingga** saya tahu apakah data layak dianalisis dan apa batasannya

**Acceptance Criteria:**
- [ ] Laporan memuat pemeriksaan pada daftar di Fitur 3, masing-masing dengan jumlah event/kasus terdampak, persentase, tingkat keparahan, dan contoh.
- [ ] Setiap temuan dapat dibuka sampai event/baris sumber (ID snapshot + nomor baris atau ID event asli).
- [ ] Laporan menampilkan ringkasan "siap analisis / siap dengan catatan / belum layak" beserta alasannya.
- [ ] Temuan duplikasi, `ambigu`, dan `konflik` dari M02 muncul di laporan ini.

### Story 4: Menangani masalah melalui antrean perbaikan

**Sebagai** Analis
**Saya ingin** memutuskan tindakan untuk setiap masalah kualitas
**Sehingga** perbaikan terdokumentasi dan dapat diulang

**Acceptance Criteria:**
- [ ] Tindakan yang tersedia: kecualikan event, kecualikan kasus, ubah pemetaan, terima apa adanya dengan catatan.
- [ ] Setiap tindakan wajib disertai alasan singkat dan tercatat (pelaku, waktu, jumlah terdampak).
- [ ] Tindakan disimpan sebagai aturan (mis. "kecualikan event dengan waktu sebelum 2017-01-01"), bukan suntingan sel manual, sehingga berlaku juga untuk snapshot berikutnya.
- [ ] Event yang dikecualikan tidak dihapus; tetap dapat dilihat dengan filter "dikecualikan" beserta alasannya.

### Story 5: Menerbitkan versi dataset dan kemampuan analisis

**Sebagai** Analis
**Saya ingin** menerbitkan versi dataset yang disertai daftar analisis yang tersedia atau terbatas
**Sehingga** modul analisis hanya menjalankan perhitungan yang didukung data

**Acceptance Criteria:**
- [ ] Penerbitan menghasilkan `DatasetVersion` immutable yang merujuk snapshot, versi pemetaan, versi aturan perbaikan, dan hash isi.
- [ ] Matriks kemampuan dihitung otomatis (lihat Fitur 5) dan ditampilkan dalam bahasa bisnis.
- [ ] M05–M08 hanya dapat memilih `DatasetVersion` yang telah diterbitkan.
- [ ] Mengubah pemetaan atau aturan menghasilkan versi baru; versi lama tetap tersedia dan hasil analisis yang merujuknya ditandai "berbasis versi lama".

---

## Functional Requirements

### Fitur 1: Pemetaan kolom dan waktu
- **Deskripsi**: `MappingVersion` berisi peran setiap kolom, format waktu, zona waktu sumber, kolom fingerprint (umpan balik ke M02), dan atribut yang disimpan.
- **Saran otomatis**: berdasarkan atribut standar XES, kecocokan nama kolom (mis. `case`, `case_id`, `activity`, `timestamp`, `resource`), dan tipe nilai (keunikan, pola tanggal). Saran bersifat heuristik berbasis kode.
- **Edge case**: Kolom waktu dengan format campuran → baris yang tidak cocok dihitung sebagai masalah kualitas, bukan menggagalkan seluruh proses. Waktu tanpa informasi zona memakai zona waktu sumber yang ditetapkan pengguna.
- **Error handling**: Pemetaan tanpa kolom wajib tidak dapat diproses; pesan menunjukkan kolom yang kurang.

### Fitur 2: Normalisasi label aktivitas
- **Deskripsi**: Tabel pemetaan `label mentah → label kanonis` (atau `dikecualikan`) yang berversi.
- **Edge case**: Label baru pada snapshot berikutnya yang belum dipetakan ditandai `belum dipetakan` dan dihitung di laporan kualitas.

### Fitur 3: Pemeriksaan kualitas
| Pemeriksaan | Contoh | Keparahan bawaan |
|---|---|---|
| Nilai hilang pada kolom wajib | Event tanpa ID kasus atau waktu | Tinggi |
| Waktu tidak wajar | Di masa depan atau jauh sebelum periode kontrak | Tinggi |
| Duplikasi / `ambigu` / `konflik` (dari M02) | Event identik pada detik yang sama | Sedang |
| Urutan ambigu | Beberapa event satu kasus dengan stempel waktu identik | Sedang |
| Kasus belum selesai | Tidak mencapai aktivitas akhir (bila batas proses di M04 sudah ditetapkan) | Info |
| Waktu mulai > waktu selesai | Bila waktu mulai dipetakan | Tinggi |
| Label belum dipetakan | Label baru di snapshot terbaru | Sedang |
| Kasus di luar periode analisis | Seluruh event di luar periode proyek (M01) | Info |

- **Catatan**: Pemeriksaan "kasus belum selesai" bergantung pada batas awal/akhir proses dari M04. Bila M04 belum diisi, status penyelesaian kasus dilaporkan sebagai "tidak diketahui", bukan ditebak.
- **Keparahan**: Ambang keparahan dapat diatur per proyek; bawaannya ditentukan di atas.

### Fitur 4: Antrean perbaikan dan aturan transformasi
- **Deskripsi**: `RepairRule` berversi (filter + tindakan + alasan + pembuat). Diterapkan berurutan setelah pemetaan.
- **Edge case**: Aturan yang mengecualikan > 20% event memerlukan konfirmasi tambahan dan tercatat sebagai peringatan pada laporan.

### Fitur 5: Versi dataset dan matriks kemampuan
- **Keluaran worker**: `events.parquet` (event kanonis dengan `activity_raw`, status kualitas, flag dikecualikan), `cases.parquet` (ringkasan per kasus), dan statistik ke PostgreSQL, disimpan di `projects/{projectId}/datasets/{datasetVersionId}/`.
- **Matriks kemampuan (contoh aturan)**:

| Kondisi data | Dampak pada analisis |
|---|---|
| Tanpa waktu mulai | Durasi kerja aktivitas (*service time*) tidak tersedia; hanya jeda antar-event dan durasi kasus |
| Tanpa sumber daya | Analisis beban kerja/sumber daya tidak tersedia |
| Urutan ambigu > 10% kasus | Discovery dan conformance ditandai "hasil perlu kehati-hatian" |
| Tanpa batas proses (M04) | Analisis kasus belum selesai dan SLA end-to-end terbatas |
| Kasus < 100 | Perbandingan kelompok/periode dinonaktifkan |

### Fitur 6: Objek terkait (Fase 1 terbatas)
- Fase 1 memakai satu notion kasus (untuk BPI 2019: item purchase order). ID objek terkait (mis. nomor dokumen PO, vendor) disimpan sebagai atribut bertipe `objek` agar M05 dapat memfilter dan mengelompokkan berdasarkan objek tersebut.
- Fase 2: model event-objek yang kompatibel dengan OCEL 2.0, relasi lintas proses (PO–invoice–penerimaan barang) berdasarkan penghubung bisnis yang ditinjau.

### Out of Scope (Fase 1)
- Model event-objek penuh dan ekspor/impor OCEL 2.0.
- Pengelompokan label aktivitas berbasis model bahasa.
- Penyuntingan sel data secara manual.
- Pseudonimisasi/penyamaran kolom sumber daya dan data pribadi (Fase 2, terkait kepatuhan PDP).
- Penggabungan beberapa sumber berbeda menjadi satu dataset.

---

## Technical Constraints

### Performa
- Pratinjau pemetaan (50 event) < 3 detik, dihitung dari sampel staging, bukan seluruh data.
- Pemrosesan penuh berjalan di worker Python secara chunked; memori < 4 GB untuk BPI 2019 penuh.
- Laporan kualitas dibaca dari ringkasan tersimpan < 1 detik.

### Keamanan
- Semua operasi melalui `authorize()` (M01): Administrator dan Analis dapat memetakan; penerbitan versi dataset hanya oleh Analis; Pemilik proses hanya membaca laporan.
- Contoh nilai yang ditampilkan di UI di-escape; tidak ada nilai sumber yang dirender sebagai HTML.
- Perubahan pemetaan, aturan perbaikan, dan penerbitan versi dicatat di audit log.

### Integrasi
- **M02**: membaca staging snapshot; mengirim balik kolom fingerprint yang dikoreksi.
- **M04**: membaca batas awal/akhir proses untuk status penyelesaian kasus; M04 memetakan label kanonis ke model proses.
- **M05–M08, M13**: memakai `DatasetVersion` dan matriks kemampuan.
- **M07**: `DatasetVersion` → `MappingVersion`, `RepairRule`, `Snapshot` sebagai jalur asal-usul.

### Teknologi
- Skema Zod: `MappingConfig`, `RepairRule`, `PrepareDatasetJob`, `QualityReport`; diekspor ke JSON Schema untuk worker Python.
- Workflow Temporal `prepareDataset` (TypeScript) dengan activity Python (pandas/PyArrow).
- Waktu dikirim lintas bahasa sebagai string ISO 8601; disimpan UTC.
- PostgreSQL: `mapping_versions`, `activity_label_maps`, `repair_rules`, `dataset_versions`, `quality_findings`, `capability_matrix`.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET/POST | `/api/projects/{projectId}/sources/{sourceId}/mappings` | Daftar/buat versi pemetaan |
| POST | `/api/projects/{projectId}/mappings/{mappingId}/preview` | Pratinjau 50 event |
| GET/PUT | `/api/projects/{projectId}/mappings/{mappingId}/activity-labels` | Normalisasi label |
| POST | `/api/projects/{projectId}/datasets` | Jalankan persiapan (`202`) |
| GET | `/api/projects/{projectId}/datasets/{datasetVersionId}` | Status, laporan kualitas, matriks kemampuan |
| GET/POST | `/api/projects/{projectId}/datasets/{datasetVersionId}/findings` | Temuan dan tindakan perbaikan |
| POST | `/api/projects/{projectId}/datasets/{datasetVersionId}/publish` | Terbitkan versi |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Pemetaan kolom dengan saran otomatis, format dan zona waktu, template per sumber.
- Normalisasi label aktivitas dengan saran berbasis kemiripan string.
- Delapan pemeriksaan kualitas, laporan, dan antrean perbaikan berbasis aturan.
- Versi dataset immutable dengan hash dan matriks kemampuan.
- Objek terkait sebagai atribut.

**Definisi MVP**: BPI 2019 dipetakan dalam beberapa menit, laporan kualitas menunjukkan masalah nyata beserta event sumbernya, analis mengecualikan event bermasalah dengan alasan tercatat, dan versi dataset yang diterbitkan menyatakan analisis mana yang tersedia atau terbatas.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Model event-objek kompatibel OCEL 2.0 dan relasi lintas proses.
- Pseudonimisasi kolom data pribadi.
- Penggabungan beberapa sumber dalam satu dataset.
- Saran pengelompokan label berbasis model (ditinjau analis).

### Pertimbangan masa depan
- Pustaka template pemetaan untuk ERP yang umum dipakai klien Javan.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Zona waktu sumber salah ditetapkan sehingga durasi dan urutan keliru | Sedang | Tinggi | Zona waktu wajib dikonfirmasi; pratinjau menampilkan waktu sumber dan hasil konversi berdampingan |
| Saran pemetaan salah lalu diterima tanpa diperiksa | Sedang | Tinggi | Kolom wajib harus dikonfirmasi eksplisit; pratinjau 50 event sebelum proses penuh |
| Aturan perbaikan terlalu luas sehingga membuang banyak data | Sedang | Sedang | Konfirmasi tambahan bila > 20% event terdampak; event dikecualikan tetap dapat dilihat |
| Model satu notion kasus tidak cukup untuk kebutuhan Javan | Sedang | Sedang | Objek terkait sebagai atribut di Fase 1; OCEL dirancang di Fase 2 |
| Hasil berbeda untuk input sama (nondeterministik) | Rendah | Tinggi | Urutan stabil saat proses, uji hash dataset di CI |

---

## Dependencies & Blockers

**Dependensi:**
- M02: snapshot `siap_dipetakan` dan staging Parquet.
- M04: batas proses (opsional; tanpa itu status penyelesaian kasus "tidak diketahui").
- M01: kewenangan dan periode proyek.
- Paket kontrak Zod → JSON Schema.

**Blocker yang diketahui:**
- Definisi kualitas data yang dianggap "layak" oleh Javan belum tersedia; ambang bawaan diusulkan Product Owner.

---

## Appendix

### Glosarium
- **Notion kasus**: Objek yang dianggap sebagai satu kasus proses, misalnya item purchase order.
- **Label kanonis**: Nama aktivitas yang telah dinormalisasi dan dipakai analisis.
- **Versi pemetaan**: Konfigurasi peran kolom, waktu, dan label yang immutable setelah dipakai.
- **Aturan perbaikan**: Aturan berversi untuk mengecualikan atau menandai event/kasus bermasalah.
- **Versi dataset**: Hasil immutable dari snapshot + pemetaan + aturan perbaikan; satu-satunya masukan bagi modul analisis.
- **Matriks kemampuan**: Daftar analisis yang tersedia atau terbatas berdasarkan atribut data.
- **OCEL**: Object-Centric Event Log, format event log yang mendukung banyak jenis objek.

### Referensi
- `feature-modules-v1.3.md` — bagian M03 dan "Kontrak validasi TypeScript dan Python".
- Standar XES (IEEE 1849) dan spesifikasi OCEL 2.0.
- [Zod: ekspor JSON Schema](https://zod.dev/json-schema)

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Ambang kualitas belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Alur pemetaan belum diuji dengan pengguna |
| Technical Constraints | 14/15 | |
| Scope & Priorities | 10/10 | |
| **Total** | **90/100** | |
