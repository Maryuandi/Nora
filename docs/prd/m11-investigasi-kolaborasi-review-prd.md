# Product Requirements Document: M11 — Investigasi, Kolaborasi, dan Review

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M11), `00-prd-overview.md`, PRD M01–M10

---

## Executive Summary

Modul M05–M10 menghasilkan peta, temuan, penilaian Jev, kandidat tervalidasi, skenario, dan draf penjelasan. Semua itu masih keluaran sistem. Dalam pekerjaan konsultasi, keluaran baru bernilai setelah diselidiki, dilengkapi informasi lapangan, dan diputuskan oleh orang yang berwenang. M11 adalah tempat proses itu terjadi.

M11 menyediakan **workspace investigasi** yang menghimpun temuan, kasus, aturan, kandidat, hasil Jev, dan draf LLM dalam satu tempat. Analis mencatat wawancara dan bukti tambahan, menulis hipotesis alternatif, berdiskusi dengan pemilik proses, meninjau dan mengoreksi keluaran model, lalu menetapkan status kandidat: perlu investigasi, usulan uji coba, dipilih, ditolak, atau digantikan.

Setiap keputusan mencatat siapa yang memutuskan, dengan kewenangan apa, kapan, mengapa, dan berdasarkan bukti versi mana. Ketika data atau aturan berubah, keputusan lama tidak dihapus atau dibatalkan otomatis, tetapi ditandai untuk ditinjau ulang. Fase 1 menyediakan workspace, catatan, komentar, tinjauan keluaran model, keputusan berjejak, dan penanda tinjau ulang; kolaborasi real-time dan notifikasi email masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Investigasi tersebar di email, chat, catatan rapat, dan spreadsheet. Alasan memilih atau menolak suatu tindakan jarang tercatat, sehingga ketika data baru datang tidak jelas keputusan mana yang perlu dipertimbangkan ulang. Keluaran AI, bila dipakai, tidak memiliki jejak tinjauan manusia.

**Solusi yang diusulkan**: Workspace investigasi per pertanyaan/temuan, dengan rujukan langsung ke objek sistem, catatan dan bukti lapangan, alur tinjauan keluaran Jev/LLM, keputusan terstruktur dengan kewenangan dan asal-usul, serta penanda tinjau ulang otomatis.

**Dampak bisnis**: Javan dapat menunjukkan bahwa setiap rekomendasi kepada klien telah ditinjau manusia yang berwenang, dengan alasan dan bukti yang tercatat. Ini menyelesaikan rantai "data → temuan → penilaian → keputusan" yang menjadi inti sistem dan menjadi dasar M12–M13.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Kelengkapan keputusan**: 100% keputusan mencatat peninjau, peran/kewenangan, waktu, alasan, versi keputusan, dan potret bukti (versi dataset, paket konteks, paket bukti terkait).
- **Penegakan kewenangan**: 0 keputusan oleh peran yang tidak berwenang (suite uji akses otomatis).
- **Penanda tinjau ulang**: keputusan terdampak ditandai < 1 menit setelah versi dataset/paket konteks baru dipakai analisis.
- **Alur ujung-ke-ujung**: dalam uji tugas, pengguna dapat bergerak dari temuan ke keputusan yang tercatat (termasuk meninjau satu hasil Jev dan satu draf LLM) < 10 menit.
- **Jejak tinjauan AI**: 100% hasil Jev/LLM yang dipakai dalam keputusan berstatus dikonfirmasi, dikoreksi, atau disetujui manusia.

**Validasi**: Uji otomatis kewenangan dan penanda; uji tugas dengan 3 pengguna sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menyelidiki temuan secara sistematis dan menyiapkan keputusan yang dapat dipertanggungjawabkan.
- **Pain point**: Informasi investigasi tersebar; sulit mengingat mengapa suatu opsi ditolak.

### Utama: Bu Sari — Pemilik proses
- **Tujuan**: Memberi konteks lapangan dan memutuskan tindakan dalam kewenangannya.
- **Pain point**: Diminta menyetujui rekomendasi tanpa melihat dasarnya.

### Sekunder: Rina — Administrator
- **Tujuan**: Memastikan peran dan kewenangan keputusan sesuai kesepakatan proyek.

---

## Kewenangan keputusan (Fase 1)

| Aksi | Analis | Pemilik proses | Administrator |
|---|---|---|---|
| Membuat workspace, catatan, komentar | ✓ | Catatan & komentar | — |
| Mengonfirmasi/mengoreksi hasil Jev | ✓ | — | — |
| Menyetujui/menyunting/menolak draf LLM | ✓ | Komentar | — |
| Menetapkan `perlu_investigasi`, `ditolak` (analitis), `digantikan` | ✓ | — | — |
| Menetapkan `usulan_uji_coba` | ✓ (mengusulkan) | — | — |
| Menetapkan `dipilih` untuk intervensi | — | ✓ (dalam kewenangannya) | — |
| Mengusulkan perubahan katalog/aturan ke M04 | ✓ | ✓ (usulan) | — |

Matriks ini memperluas M01 dan perlu dicocokkan dengan kewenangan aktual Javan dan klien.

---

## User Stories & Acceptance Criteria

### Story 1: Membuka workspace investigasi

**Sebagai** Analis
**Saya ingin** membuat workspace untuk satu pertanyaan atau temuan dan menautkan objek terkait
**Sehingga** semua bahan investigasi ada di satu tempat

**Acceptance Criteria:**
- [ ] Workspace dapat dibuat dari temuan (M06), tampilan tersimpan (M05), atau kosong dengan pertanyaan investigasi.
- [ ] Objek yang dapat ditautkan: temuan, kasus/tampilan tersimpan, aturan dan dokumen, kandidat, hasil Jev, draf interpretasi, skenario, usulan uji coba.
- [ ] Objek tertaut ditampilkan dengan status terkini (mis. "dinilai model", "tervalidasi", "versi lebih baru tersedia").
- [ ] Workspace memiliki status: `terbuka`, `menunggu informasi`, `siap diputuskan`, `selesai`.

### Story 2: Mencatat bukti lapangan dan hipotesis alternatif

**Sebagai** Analis
**Saya ingin** mencatat hasil wawancara, bukti tambahan, dan hipotesis alternatif
**Sehingga** informasi di luar event log ikut menjadi dasar keputusan

**Acceptance Criteria:**
- [ ] Jenis catatan: catatan wawancara (narasumber, peran, tanggal), bukti tambahan (unggah file ≤ 20 MB atau tautan), hipotesis alternatif, pertanyaan investigasi.
- [ ] Hipotesis alternatif dapat dihubungkan ke temuan dan ditandai `didukung`, `dibantah`, atau `belum diuji` beserta bukti rujukannya.
- [ ] Pertanyaan investigasi memiliki penanggung jawab dan status (`terbuka`/`terjawab`).
- [ ] Catatan wawancara diberi tanda bahwa isinya informasi kualitatif, bukan hasil terukur.

### Story 3: Berdiskusi dengan pemilik proses

**Sebagai** Bu Sari
**Saya ingin** memberi komentar dan konteks pada temuan dan kandidat
**Sehingga** analis memahami kondisi lapangan sebelum keputusan dibuat

**Acceptance Criteria:**
- [ ] Komentar berutas pada workspace dan pada objek tertaut.
- [ ] Menyebut anggota (`@nama`) membuat notifikasi di aplikasi.
- [ ] Komentar dapat ditandai "selesai dibahas".

### Story 4: Meninjau keluaran Jev dan LLM

**Sebagai** Analis
**Saya ingin** meninjau hasil Jev dan draf LLM dari dalam workspace
**Sehingga** hanya keluaran model yang sudah diperiksa manusia yang menjadi dasar keputusan

**Acceptance Criteria:**
- [ ] Hasil Jev dapat dikonfirmasi atau dikoreksi; koreksi disimpan sebagai `AssessmentCorrection` (M08) dengan alasan.
- [ ] Draf LLM dapat disetujui, disunting (versi baru, M10), atau ditolak dengan kode alasan (mis. klaim tidak didukung, bahasa tidak sesuai, informasi kurang).
- [ ] Penolakan dan koreksi dapat ditandai untuk set acuan evaluasi.
- [ ] Workspace menampilkan jumlah keluaran model yang belum ditinjau; status `siap diputuskan` tidak dapat dipilih selama ada keluaran model tertaut yang belum ditinjau.

### Story 5: Menetapkan keputusan atas kandidat

**Sebagai** Bu Sari
**Saya ingin** memilih atau menolak kandidat tindakan dengan alasan yang tercatat
**Sehingga** keputusan dapat dipertanggungjawabkan dan dilacak

**Acceptance Criteria:**
- [ ] Status keputusan: `perlu_investigasi`, `usulan_uji_coba`, `dipilih`, `ditolak`, `digantikan` (wajib menunjuk kandidat pengganti).
- [ ] Keputusan mencatat peninjau, peran, waktu, alasan (wajib), dan potret bukti: versi dataset, paket konteks, analisis, paket bukti, dan versi narasi yang disetujui.
- [ ] Sistem menolak keputusan dari peran yang tidak berwenang sesuai matriks.
- [ ] Mengubah keputusan membuat versi baru; versi sebelumnya tetap terlihat di riwayat.
- [ ] Keputusan diproyeksikan ke M07 sebagai relasi kategori keputusan.

### Story 6: Menandai keputusan yang perlu ditinjau ulang

**Sebagai** Analis
**Saya ingin** diberi tahu ketika data atau aturan yang mendasari keputusan berubah
**Sehingga** keputusan lama tidak terus dipakai tanpa dipertimbangkan ulang

**Acceptance Criteria:**
- [ ] Ketika analisis baru memakai versi dataset atau paket konteks yang lebih baru untuk temuan yang sama, keputusan terkait ditandai `perlu_ditinjau_ulang` dengan ringkasan perubahan (mis. "aturan SLA v2 → v3", "P90 berubah dari A ke B").
- [ ] Penanda tidak mengubah status keputusan; analis atau pemilik proses menegaskan, mengubah, atau mengganti keputusan.
- [ ] Daftar keputusan yang perlu ditinjau ulang tersedia di halaman proyek.

### Story 7: Mengusulkan pembaruan konteks dan katalog

**Sebagai** Analis
**Saya ingin** mengusulkan perubahan aturan, definisi, atau katalog berdasarkan hasil investigasi
**Sehingga** pengetahuan proyek bertambah melalui tinjauan, bukan perubahan diam-diam

**Acceptance Criteria:**
- [ ] Usulan perubahan dibuat dari workspace dan dikirim ke M04 sebagai draf berstatus `ditinjau`, merujuk workspace asalnya.
- [ ] Usulan baru berlaku setelah disetujui di M04 dan masuk paket konteks baru.

---

## Functional Requirements

### Fitur 1: Workspace dan tautan objek
- **Deskripsi**: `Investigation` (judul, pertanyaan, status, pemilik, anggota) dengan `InvestigationLink` ke objek modul lain (tipe + ID + versi saat ditautkan).
- **Edge case**: Objek tertaut digantikan versi baru → tautan tetap ke versi lama, dengan tanda "versi lebih baru tersedia" dan opsi memperbarui tautan.

### Fitur 2: Catatan, bukti, dan hipotesis alternatif
- **Deskripsi**: `InvestigationNote` dengan jenis; file disimpan di `projects/{projectId}/investigations/{id}/`; hipotesis alternatif diproyeksikan ke M07 dengan kategori dukungan hipotesis dan pembuat `pengguna`.

### Fitur 3: Komentar dan notifikasi di aplikasi
- **Deskripsi**: Komentar berutas, sebutan anggota, notifikasi di aplikasi (lencana dan daftar). Pembaruan tampil saat halaman dimuat ulang atau melalui polling berkala (mis. 30 detik).

### Fitur 4: Tinjauan keluaran model
- **Deskripsi**: Antarmuka tinjauan yang memakai endpoint M08 (koreksi) dan M10 (versi narasi); kode alasan penolakan dikonfigurasi per proyek.

### Fitur 5: Keputusan berjejak
- **Deskripsi**: `Decision` (target kandidat/usulan, status, peninjau, peran, alasan, potret bukti, versi). Pemeriksaan kewenangan melalui `authorize()` M01 yang diperluas dengan aksi keputusan.
- **Edge case**: Dua pengguna memutuskan target yang sama bersamaan → pemeriksaan versi optimistis; yang kedua diminta memuat ulang dan melihat keputusan terbaru.

### Fitur 6: Penanda tinjau ulang
- **Deskripsi**: Saat analisis selesai, workflow membandingkan versi dataset/paket konteks dan nilai temuan dengan potret bukti keputusan terkait; bila berbeda, buat `RevalidationFlag` beserta ringkasan perubahan.

### Out of Scope (Fase 1)
- Penyuntingan bersama real-time dan kehadiran pengguna.
- Notifikasi email/chat eksternal.
- Portal klien terpisah di luar peran Pemilik proses.
- Alur persetujuan bertingkat dan tanda tangan elektronik.
- Penjadwalan rapat dan integrasi kalender.

---

## Technical Constraints

### Performa
- Workspace dengan ≤ 100 objek tertaut dan ≤ 500 komentar termuat < 2 detik.
- Penanda tinjau ulang dibuat < 1 menit setelah analisis selesai.

### Keamanan
- `authorize()` M01 dengan aksi keputusan; uji matriks kewenangan otomatis.
- File bukti tambahan diperiksa tipe isinya dan disimpan di prefiks proyek; tidak dirender sebagai HTML.
- Catatan wawancara dapat memuat data pribadi narasumber; hanya anggota proyek yang dapat membacanya dan nama narasumber dapat diganti inisial.
- Semua keputusan, perubahan keputusan, koreksi, persetujuan, dan penolakan tercatat di audit log.

### Integrasi
- **M05–M10**: objek yang ditautkan dan ditinjau.
- **M04**: usulan perubahan konteks/katalog.
- **M07**: catatan, hipotesis alternatif, dan keputusan sebagai node/relasi.
- **M12 (Fase 2)**: workspace dan keputusan sebagai bahan framework dan laporan.
- **M13 (Fase 2)**: keputusan `dipilih` dan `usulan_uji_coba` menjadi tindak lanjut.

### Teknologi
- Next.js UI dan Server Actions untuk formulir; Route Handlers untuk endpoint; service TypeScript.
- Zod: `Investigation`, `InvestigationLink`, `InvestigationNote`, `Comment`, `Decision`, `RevalidationFlag`.
- PostgreSQL; object storage untuk file bukti; proyeksi ke Neo4j via outbox (M07).

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET/POST | `/api/projects/{projectId}/investigations` | Daftar/buat workspace |
| GET/PATCH | `/api/projects/{projectId}/investigations/{id}` | Detail/ubah status |
| POST/DELETE | `/api/projects/{projectId}/investigations/{id}/links` | Tautkan/lepas objek |
| GET/POST | `/api/projects/{projectId}/investigations/{id}/notes` | Catatan dan bukti |
| GET/POST | `/api/projects/{projectId}/comments` | Komentar pada workspace/objek |
| POST | `/api/projects/{projectId}/decisions` | Membuat keputusan |
| GET | `/api/projects/{projectId}/decisions?flag=perlu_ditinjau_ulang` | Keputusan dan penanda |
| GET | `/api/projects/{projectId}/notifications` | Notifikasi di aplikasi |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Workspace investigasi dengan tautan objek dan status.
- Catatan wawancara, bukti tambahan, hipotesis alternatif, pertanyaan investigasi.
- Komentar berutas dan notifikasi di aplikasi.
- Tinjauan hasil Jev dan draf LLM.
- Keputusan berjejak dengan kewenangan dan riwayat versi.
- Penanda tinjau ulang dan usulan perubahan ke M04.

**Definisi MVP**: Di depan juri, analis membuka workspace dari satu bottleneck, mengoreksi satu hasil Jev, menyetujui narasi untuk pemilik proses, dan mengusulkan pilot. Lalu akun pemilik proses menetapkan `dipilih` dengan alasan. Setelah data baru diimpor dan dianalisis, keputusan tersebut otomatis ditandai `perlu_ditinjau_ulang` beserta ringkasan perubahannya.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Kolaborasi real-time, notifikasi email/chat.
- Alur persetujuan bertingkat sesuai struktur klien.
- Ekspor riwayat keputusan untuk dokumen proyek.

### Pertimbangan masa depan
- Integrasi dengan alat manajemen tugas klien untuk tindak lanjut.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Pengguna melewati tinjauan keluaran model | Sedang | Tinggi | Status `siap diputuskan` terkunci sampai keluaran model tertaut ditinjau |
| Matriks kewenangan tidak sesuai struktur klien | Sedang | Sedang | Validasi di Problem Owner Clinic; Fase 2 alur bertingkat |
| Terlalu banyak penanda tinjau ulang sehingga diabaikan | Sedang | Sedang | Penanda hanya bila versi atau nilai temuan berubah melewati ambang M06 |
| Ruang lingkup melebar ke alat kolaborasi umum | Sedang | Sedang | Tanpa real-time dan email di Fase 1 |
| Data pribadi narasumber di catatan wawancara | Rendah | Sedang | Akses terbatas, opsi inisial, data demo fiktif |

---

## Dependencies & Blockers

**Dependensi:**
- M01: kewenangan (diperluas dengan aksi keputusan).
- M05–M10: objek yang ditautkan dan ditinjau.
- M04: penerimaan usulan perubahan; M07: proyeksi node.

**Blocker yang diketahui:**
- Tidak ada untuk Fase 1.

---

## Appendix

### Glosarium
- **Workspace investigasi**: Ruang kerja per pertanyaan/temuan yang menghimpun objek, catatan, diskusi, dan keputusan.
- **Hipotesis alternatif**: Dugaan penjelasan lain yang dicatat analis di luar katalog.
- **Potret bukti**: Daftar versi data, konteks, analisis, dan paket bukti saat keputusan dibuat.
- **Penanda tinjau ulang**: Tanda bahwa dasar suatu keputusan telah berubah.
- **Keputusan berjejak**: Keputusan dengan pelaku, kewenangan, alasan, waktu, dan versi tercatat.

### Referensi
- `feature-modules-v1.3.md` — bagian M11 dan prinsip "analis dan pemilik proses menetapkan keputusan serta tindak lanjut".

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Target belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 17/20 | Alur workspace perlu diuji dengan pemilik proses |
| Technical Constraints | 14/15 | |
| Scope & Priorities | 9/10 | Matriks kewenangan keputusan masih asumsi |
| **Total** | **90/100** | |
