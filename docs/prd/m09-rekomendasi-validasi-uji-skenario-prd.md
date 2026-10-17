# Product Requirements Document: M09 — Rekomendasi, Validasi, dan Uji Skenario

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M09), `00-prd-overview.md`, PRD M01–M08

---

## Executive Summary

Setelah M06 menemukan masalah dan M08 menilai kandidat hipotesis/intervensi, analis masih harus menjawab: kandidat mana yang benar-benar layak diusulkan kepada klien, mana yang perlu didahulukan, dan apa kira-kira dampaknya? Di titik ini risiko terbesar adalah rekomendasi yang terdengar meyakinkan tetapi tidak didukung angka, tidak sesuai kewenangan pemilik proses, atau menyembunyikan asumsi.

M09 menyusun **kandidat tindakan yang tervalidasi dan layak ditinjau**. Kode menggabungkan penilaian Jev dengan temuan terukur, memeriksa angka, sumber, versi aturan, kewenangan, dan syarat penerapan, lalu menghitung prioritas dengan **kebijakan bobot yang eksplisit**. Untuk kandidat terpilih, M09 menyediakan uji skenario sederhana dan draf usulan uji coba (pilot) dengan metrik keberhasilan.

M09 tidak memutuskan dan tidak membuat kandidat baru. Keputusan tetap di M11. Fase 1 memakai uji skenario **aritmetika berbasis kasus teramati**, yang diberi label jelas bahwa efek antrean dan kapasitas diabaikan. Simulasi SimPy yang terkalibrasi masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Rekomendasi disusun dari pengalaman analis dan diprioritaskan secara intuitif. Dasar angka, asumsi usaha/risiko, dan syarat penerapannya jarang ditulis. Klien sulit membandingkan pilihan dan sulit menilai mengapa satu tindakan didahulukan.

**Solusi yang diusulkan**: Mesin validasi dan prioritas berbasis aturan yang transparan, tampilan perbandingan kandidat beserta bukti dan kekurangan informasinya, uji skenario dengan asumsi terlihat, serta templat usulan uji coba.

**Dampak bisnis**: Rekomendasi Javan menjadi dapat dipertanggungjawabkan: setiap urutan prioritas dapat dijelaskan dengan rumus dan data, dan setiap estimasi menyatakan asumsinya. Ini menjembatani "insight" menjadi "aksi", yang dinilai pada kriteria hilirisasi dan dampak.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Kelengkapan validasi**: 100% kandidat memiliki status validasi dengan alasan per pemeriksaan (lolos/gagal/tidak dapat diperiksa).
- **Reprodusibilitas prioritas**: masukan + versi kebijakan yang sama menghasilkan urutan identik pada 100% uji.
- **Transparansi asumsi**: 100% kandidat dengan nilai usaha/risiko kosong ditandai "asumsi belum tersedia" dan tidak diberi nilai bawaan diam-diam.
- **Ketepatan uji skenario**: hasil aritmetika cocok dengan perhitungan referensi di notebook (toleransi 0,1%).
- **Asal kandidat**: 0 kandidat yang berasal dari luar katalog M04 atau tambahan analis.
- **Waktu**: validasi dan prioritas untuk satu temuan (≤ 20 kandidat) < 30 detik; uji skenario < 30 detik pada subset demo.

**Validasi**: Uji otomatis atas aturan validasi dan rumus prioritas; review kebijakan bobot bersama Javan di Problem Owner Clinic.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Menyusun daftar rekomendasi yang dapat dipertahankan di depan klien, lengkap dengan dasar angka dan asumsi.
- **Pain point**: Prioritas berdasarkan intuisi sulit dijelaskan; estimasi dampak sering dibuat tanpa menyebut asumsinya.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Membandingkan pilihan tindakan dan memilih yang sesuai kewenangan serta sumber dayanya.
- **Kebutuhan**: Perbandingan sederhana, risiko dan kekurangan informasi yang jelas.

---

## User Stories & Acceptance Criteria

### Story 1: Menyusun kandidat untuk suatu temuan

**Sebagai** Analis
**Saya ingin** mengumpulkan kandidat hipotesis dan intervensi untuk satu temuan
**Sehingga** saya punya daftar pilihan yang lengkap sebelum memprioritaskan

**Acceptance Criteria:**
- [ ] Kandidat diambil dari katalog M04 yang syaratnya merujuk aktivitas/metrik temuan, ditambah kandidat yang ditambahkan analis.
- [ ] Kandidat tambahan analis wajib berisi deskripsi, hipotesis yang ditangani, dan metrik keberhasilan; ditandai "tambahan analis" dan dapat diusulkan masuk katalog melalui tinjauan.
- [ ] Setiap kandidat menampilkan hasil Jev dari M08 (status, skor per kriteria, probabilitas) atau keterangan "belum dinilai".

### Story 2: Memvalidasi kandidat

**Sebagai** Analis
**Saya ingin** setiap kandidat diperiksa secara otomatis terhadap data, aturan, dan kewenangan
**Sehingga** hanya kandidat yang memenuhi syarat yang diajukan

**Acceptance Criteria:**
- [ ] Pemeriksaan yang dijalankan kode (lihat Fitur 2): syarat penerapan, keberadaan dan kesesuaian angka rujukan, versi sumber/aturan, kewenangan, dan status penilaian Jev.
- [ ] Status kandidat: `tervalidasi`, `belum_layak_dinilai` (data/informasi kurang), `tidak_memenuhi_syarat`, atau `perlu_review`.
- [ ] Setiap status menampilkan daftar pemeriksaan beserta hasil dan alasannya.
- [ ] Kandidat `belum_layak_dinilai` menampilkan informasi apa yang kurang dan dari modul mana bisa dilengkapi.

### Story 3: Memprioritaskan dengan kebijakan eksplisit

**Sebagai** Analis
**Saya ingin** kandidat tervalidasi diurutkan dengan rumus dan bobot yang terlihat
**Sehingga** saya dan klien memahami alasan urutan prioritas

**Acceptance Criteria:**
- [ ] Kebijakan prioritas berversi berisi komponen, bobot, dan normalisasi (bawaan pada Fitur 3), dapat diubah analis per proyek.
- [ ] Setiap kandidat menampilkan rincian skor per komponen dan kontribusinya terhadap total.
- [ ] Komponen yang nilainya tidak tersedia (mis. usaha) tidak diisi nilai bawaan; kandidat diberi tanda dan urutannya ditampilkan dengan keterangan "berdasarkan komponen yang tersedia".
- [ ] Mengubah bobot menampilkan urutan baru beserta perbandingannya dengan urutan sebelumnya.

### Story 4: Membandingkan kandidat

**Sebagai** Bu Sari
**Saya ingin** membandingkan 2–4 kandidat berdampingan
**Sehingga** saya dapat memilih tindakan yang paling sesuai

**Acceptance Criteria:**
- [ ] Perbandingan menampilkan: masalah yang ditangani, besaran masalah (kasus terdampak, waktu tunggu terkait), hasil penilaian Jev, prasyarat, kewenangan yang dibutuhkan, usaha/risiko (atau "belum tersedia"), pengecualian, dan informasi yang masih kurang.
- [ ] Setiap baris dapat dibuka ke bukti (temuan M06, paket bukti M07, aturan M04).

### Story 5: Menguji skenario sederhana

**Sebagai** Analis
**Saya ingin** memperkirakan perubahan durasi bila suatu jeda atau aktivitas diperbaiki
**Sehingga** saya dapat membicarakan besaran dampak dengan asumsi yang jelas

**Acceptance Criteria:**
- [ ] Jenis skenario Fase 1: (a) jeda transisi tertentu berkurang X% atau dibatasi maksimum N hari; (b) rework aktivitas tertentu dihilangkan untuk Y% kasus; (c) aktivitas tertentu dilewati untuk kasus yang memenuhi filter.
- [ ] Perhitungan dilakukan dengan menyesuaikan durasi pada kasus teramati di dataset (bukan model antrean), menghasilkan median/P90 durasi kasus sebelum dan sesudah serta jumlah kasus terdampak.
- [ ] Hasil selalu disertai keterangan tetap: "Estimasi aritmetika pada kasus historis; mengabaikan efek kapasitas, antrean, dan perubahan perilaku."
- [ ] Skenario disimpan dengan parameter, versi dataset, dan paket konteks; berstatus `estimasi`, terpisah dari hasil aktual M13.
- [ ] Skenario yang memerlukan model kapasitas/antrean ditandai "memerlukan simulasi (Fase 2)".

### Story 6: Menyusun usulan uji coba

**Sebagai** Analis
**Saya ingin** draf usulan uji coba untuk kandidat terpilih
**Sehingga** klien dapat menjalankan tindakan secara terkendali dan hasilnya dapat diukur

**Acceptance Criteria:**
- [ ] Draf berisi: tindakan, cakupan (unit/kategori/periode), durasi, metrik keberhasilan (dari katalog), baseline (dari M06), target, metrik pengaman (*guardrail*, mis. kepatuhan tidak turun), pemilik, risiko, dan kondisi penghentian.
- [ ] Baseline dan metrik diisi otomatis oleh kode dari analisis yang dirujuk; target diisi analis.
- [ ] Draf berstatus `draf` sampai diputuskan di M11; narasi penjelasan dibuat M10.

---

## Functional Requirements

### Fitur 1: Pengumpulan kandidat
- **Deskripsi**: `CandidateSet` per temuan: kandidat katalog yang relevan, tambahan analis, dan hasil M08 terkait.
- **Edge case**: Kandidat yang sama relevan untuk beberapa temuan → satu kandidat dengan relasi ke beberapa temuan; prioritas dihitung per temuan.

### Fitur 2: Pemeriksaan validasi
| Pemeriksaan | Lolos bila | Hasil bila gagal |
|---|---|---|
| Syarat penerapan (M04) | Semua kondisi terhitung bernilai benar | `tidak_memenuhi_syarat`; bila tidak dapat dihitung → `belum_layak_dinilai` |
| Angka rujukan | Metrik yang dirujuk ada di analisis M06 yang sama dan nilainya cocok | `perlu_review` |
| Versi sumber/aturan | Aturan dan dokumen yang dirujuk masih versi aktif dalam paket konteks | `perlu_review` dengan tanda "acuan telah diperbarui" |
| Kewenangan | Peran pemilik tindakan yang dibutuhkan tercantum dan ada anggota proyek dengan peran tersebut | `perlu_review` |
| Penilaian Jev | Status M08 `otomatis` atau dikonfirmasi analis, dengan kesimpulan relevan/sebagian relevan | `perlu_review` atau `belum_layak_dinilai` sesuai status M08 |

- Pemeriksaan dijalankan oleh service/worker TypeScript dan bersifat deterministik.

### Fitur 3: Kebijakan prioritas
- **Rumus bawaan** [perlu validasi Javan]:
  `prioritas = w1·relevansi + w2·besaran_masalah + w3·kepastian_bukti − w4·usaha − w5·risiko`
  - **relevansi**: skor total rubrik M08 (dinormalisasi 0–1).
  - **besaran_masalah**: proporsi kasus terdampak × proporsi kontribusi waktu tunggu terkait (dari M06), dinormalisasi 0–1.
  - **kepastian_bukti**: probabilitas kesimpulan Jev dikalikan faktor kecukupan kasus pendukung.
  - **usaha/risiko**: skala 1–5 dari katalog atau analis; bila kosong, komponen dikeluarkan dan kandidat ditandai.
  - Bobot bawaan: w1 = 0,30, w2 = 0,30, w3 = 0,15, w4 = 0,15, w5 = 0,10.
- **Catatan**: besaran masalah adalah ukuran masalah yang ditangani, **bukan** prediksi penghematan.

### Fitur 4: Uji skenario aritmetika
- **Deskripsi**: Worker Python (pandas) menerapkan penyesuaian pada durasi kasus teramati sesuai parameter dan menghitung ulang statistik dengan definisi metrik M06 yang sama.
- **Edge case**: Penyesuaian membuat urutan event tidak konsisten → hanya durasi agregat kasus yang disesuaikan, bukan stempel waktu event; batasan ini dicantumkan.
- **Edge case**: Kasus terdampak < 30 → hasil ditandai "sampel kecil".

### Fitur 5: Usulan uji coba
- **Deskripsi**: `TrialProposal` dari templat terstruktur; nilai baseline diisi kode, target dan pemilik diisi analis.

### Out of Scope (Fase 1)
- Simulasi SimPy untuk kapasitas, antrean, dan sumber daya (Fase 2).
- Optimasi otomatis kombinasi intervensi.
- Prediksi penghematan biaya (memerlukan data biaya).
- Pembuatan kandidat baru oleh model.
- Keputusan pemilihan tindakan (M11).

---

## Technical Constraints

### Performa
- Validasi dan prioritas satu temuan (≤ 20 kandidat) < 30 detik.
- Uji skenario pada subset demo < 30 detik; dataset penuh sebagai pekerjaan latar.

### Keamanan
- `authorize()` M01: Analis menyusun kandidat, mengubah kebijakan, menjalankan skenario; Pemilik proses membaca perbandingan dan usulan.
- Perubahan kebijakan prioritas dan penambahan kandidat tercatat di audit log.

### Integrasi
- **M04**: katalog, syarat penerapan, atribut usaha/risiko, metrik keberhasilan.
- **M06**: temuan, metrik, kontribusi waktu tunggu, baseline.
- **M07**: relasi kandidat–temuan–bukti; kandidat dan skenario sebagai node.
- **M08**: hasil penilaian Jev.
- **M10**: menjelaskan prioritas, perbandingan, skenario, dan usulan uji coba.
- **M11**: tempat memutuskan kandidat dan usulan.
- **M13 (Fase 2)**: membandingkan hasil aktual dengan estimasi skenario.

### Teknologi
- Service/worker TypeScript untuk validasi dan prioritas; worker Python (pandas) untuk uji skenario.
- Zod: `CandidateSet`, `ValidationResult`, `PriorityPolicy`, `ScenarioSpec`, `ScenarioResult`, `TrialProposal`; JSON Schema untuk `ScenarioSpec` ke worker Python.
- PostgreSQL untuk kandidat, hasil validasi, kebijakan, skenario, dan usulan.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET/POST | `/api/findings/{findingId}/candidates` | Kandidat dan tambahan analis |
| POST | `/api/findings/{findingId}/candidates/validate` | Menjalankan validasi dan prioritas (`202`) |
| GET/PUT | `/api/projects/{projectId}/priority-policy` | Kebijakan prioritas |
| GET | `/api/findings/{findingId}/candidates/compare?ids=` | Perbandingan kandidat |
| POST | `/api/projects/{projectId}/scenarios` | Menjalankan uji skenario (`202`) |
| GET | `/api/projects/{projectId}/scenarios/{scenarioId}` | Hasil skenario |
| GET/POST/PATCH | `/api/projects/{projectId}/trial-proposals` | Usulan uji coba |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Pengumpulan kandidat dari katalog dan tambahan analis.
- Lima pemeriksaan validasi dengan status dan alasan.
- Kebijakan prioritas eksplisit dengan rincian skor.
- Perbandingan kandidat.
- Tiga jenis uji skenario aritmetika.
- Draf usulan uji coba.

**Definisi MVP**: Untuk satu indikasi bottleneck, juri melihat kandidat yang tervalidasi, satu yang `belum_layak_dinilai` beserta informasi yang kurang, dan urutan prioritas dengan rincian bobot. Juri juga melihat estimasi "jika jeda transisi X turun 50%, P90 durasi kasus turun dari A ke B" lengkap dengan keterangan asumsi, serta draf pilot dengan baseline yang terisi otomatis.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Simulasi SimPy terkalibrasi untuk kapasitas, antrean, dan alokasi sumber daya.
- Estimasi biaya bila data biaya tersedia.
- Kalibrasi bobot prioritas berdasarkan hasil intervensi (M13).

### Pertimbangan masa depan
- Rekomendasi kombinasi intervensi dengan analisis interaksi.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Estimasi skenario dibaca sebagai janji hasil | Sedang | Tinggi | Keterangan asumsi tetap, status `estimasi`, terpisah dari hasil aktual |
| Bobot prioritas bawaan tidak sesuai cara Javan menilai | Tinggi | Sedang | Kebijakan dapat diubah dan berversi; validasi di Problem Owner Clinic |
| Kandidat tanpa data usaha/risiko mendominasi urutan | Sedang | Sedang | Komponen kosong ditandai, tidak diisi bawaan; tampilkan urutan per komponen tersedia |
| Pemeriksaan kewenangan terlalu sederhana | Sedang | Rendah | Fase 1 berbasis peran; detail kewenangan klien divalidasi bersama Javan |
| Ruang lingkup melebar ke simulasi penuh | Sedang | Sedang | SimPy dikunci di Fase 2 |

---

## Dependencies & Blockers

**Dependensi:**
- M04: katalog dengan syarat penerapan dan atribut intervensi.
- M06: temuan dan metrik; M08: hasil penilaian Jev.
- Perhitungan referensi uji skenario di notebook.

**Blocker yang diketahui:**
- Tidak ada untuk Fase 1.

---

## Appendix

### Glosarium
- **Kandidat**: Hipotesis atau intervensi dari katalog/analis yang dipertimbangkan untuk suatu temuan.
- **Validasi**: Pemeriksaan otomatis atas syarat, angka, sumber, kewenangan, dan status penilaian.
- **Kebijakan prioritas**: Rumus dan bobot berversi untuk mengurutkan kandidat.
- **Besaran masalah**: Ukuran masalah yang ditangani kandidat (kasus terdampak dan waktu terkait), bukan prediksi penghematan.
- **Uji skenario aritmetika**: Estimasi dengan menyesuaikan durasi kasus historis, tanpa model antrean.
- **Usulan uji coba (pilot)**: Rencana penerapan terbatas dengan metrik, baseline, dan kondisi penghentian.

### Referensi
- `feature-modules-v1.3.md` — bagian M09 dan prinsip "kode memeriksa aturan, referensi, angka, dan syarat kandidat".
- Dokumentasi SimPy (untuk Fase 2).

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 27/30 | Bobot prioritas belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Tampilan perbandingan belum diuji dengan pengguna |
| Technical Constraints | 14/15 | |
| Scope & Priorities | 9/10 | Batas uji skenario aritmetika vs simulasi perlu dikomunikasikan |
| **Total** | **90/100** | |
