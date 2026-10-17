# Product Requirements Document: M10 — Interpretasi Hasil (LLM)

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M10), `00-prd-overview.md`, PRD M01–M09

---

## Executive Summary

Temuan terukur, skor Jev, dan urutan prioritas sudah benar secara teknis, tetapi belum tentu dipahami pemilik proses. Analis masih harus menerjemahkannya menjadi penjelasan: apa yang terjadi, seberapa besar, apa dasarnya, apa yang belum pasti, dan apa yang perlu ditanyakan. Pekerjaan menulis ini memakan waktu dan rawan dua kesalahan: angka salah salin, atau klaim yang melampaui bukti.

M10 memakai LLM untuk menyusun **draf interpretasi terstruktur** dari paket bukti (M07) yang memuat hasil Jev, keluaran M09, serta bukti asli dan aturan. LLM hanya **menjelaskan**. Ia tidak menghitung, tidak mengubah angka, tidak memperkenalkan intervensi baru, dan tidak memutuskan.

Untuk menegakkan batas itu, M10 memakai tiga mekanisme. Pertama, LLM menulis **placeholder angka** yang diisi kode dari paket bukti, sehingga angka di narasi selalu sama dengan hasil perhitungan. Kedua, setiap klaim wajib merujuk item paket bukti dan diberi tipe (fakta terukur, interpretasi, hipotesis, rekomendasi tervalidasi). Ketiga, kode memeriksa struktur, rujukan, angka, dan kandidat sebelum draf ditampilkan. Draf tetap berstatus draf sampai ditinjau analis di M11.

---

## Problem Statement

**Situasi saat ini**: Analis menulis penjelasan secara manual, atau memakai LLM umum dengan menyalin angka ke prompt. Hasil LLM umum bisa mengubah angka, menyimpulkan penyebab tanpa dasar, atau menyebut tindakan yang tidak pernah dinilai, dan tidak ada jejak bukti apa yang dipakai.

**Solusi yang diusulkan**: Layanan interpretasi yang menerima paket bukti immutable, menghasilkan keluaran JSON terstruktur dengan klaim bertipe, rujukan, dan placeholder angka, lalu menjalankan pemeriksaan otomatis sebelum menyerahkannya ke tinjauan analis.

**Dampak bisnis**: Waktu menyusun penjelasan berkurang, kualitas narasi lebih konsisten, dan klien menerima penjelasan yang dapat ditelusuri ke bukti. Ini menunjukkan pemakaian LLM yang bertanggung jawab, sesuai prinsip sistem.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Integritas angka**: 0 angka dalam draf yang lolos pemeriksaan yang tidak berasal dari placeholder terverifikasi.
- **Validitas rujukan**: 100% klaim pada draf yang lolos pemeriksaan merujuk item yang ada di paket bukti.
- **Lolos pemeriksaan pada percobaan pertama**: ≥ 85% (diukur pada set uji 30 target).
- **Penerimaan analis**: ≥ 70% draf disetujui tanpa perubahan atau dengan suntingan kecil dalam uji dengan 3 pengguna.
- **Kualitas penjelasan**: rata-rata ≥ 4/5 pada rubrik penilaian manusia (kesetiaan pada bukti, kejelasan, pernyataan ketidakpastian).
- **Waktu**: satu interpretasi < 30 detik dari permintaan sampai draf tersedia.

**Validasi**: Set uji 30 target (temuan, perbandingan kandidat, skenario) dari data demo; penilaian manusia oleh anggota tim dan, bila memungkinkan, perwakilan Javan sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Memperoleh draf penjelasan yang akurat dan siap disunting, bukan menulis dari nol.
- **Pain point**: Menyusun narasi untuk banyak temuan; khawatir LLM menulis klaim yang tidak bisa dipertanggungjawabkan.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Memahami temuan dan rekomendasi dalam bahasa bisnis, termasuk apa yang belum pasti.
- **Level teknis**: Pemula–menengah.

---

## User Stories & Acceptance Criteria

### Story 1: Membuat draf interpretasi untuk suatu target

**Sebagai** Analis
**Saya ingin** meminta draf penjelasan untuk temuan, perbandingan kandidat, skenario, atau usulan uji coba
**Sehingga** saya punya narasi awal yang berdasar bukti

**Acceptance Criteria:**
- [ ] Target yang didukung Fase 1: temuan (M06), hasil penilaian kandidat (M08), perbandingan dan prioritas kandidat (M09), skenario (M09), usulan uji coba (M09).
- [ ] Analis memilih audiens: **analis** (lebih teknis) atau **pemilik proses** (bahasa bisnis, istilah teknis dijelaskan).
- [ ] Permintaan memulai pekerjaan di worker; M07 membentuk paket bukti dengan tujuan `llm_interpretation`; API mengembalikan `202`.
- [ ] Draf ditulis dalam Bahasa Indonesia.

### Story 2: Melihat struktur draf yang jelas

**Sebagai** Bu Sari
**Saya ingin** penjelasan yang memisahkan fakta, dugaan, dan hal yang belum diketahui
**Sehingga** saya tidak salah mengira dugaan sebagai fakta

**Acceptance Criteria:**
- [ ] Draf memiliki bagian tetap: ringkasan, apa yang terukur, dasar bukti, interpretasi, hipotesis yang masih terbuka, asumsi, ketidakpastian, dan pertanyaan untuk ditindaklanjuti.
- [ ] Setiap klaim diberi tipe yang terlihat: `fakta_terukur`, `interpretasi`, `hipotesis`, atau `rekomendasi_tervalidasi`.
- [ ] Klaim bertipe `fakta_terukur` hanya boleh merujuk hasil terukur (M05/M06) atau aturan/dokumen (M04).
- [ ] Draf selalu berlabel "Draf dibuat model — belum ditinjau" sampai disetujui di M11.

### Story 3: Angka yang tidak bisa diubah model

**Sebagai** Analis
**Saya ingin** semua angka dalam narasi diambil langsung dari hasil perhitungan
**Sehingga** tidak ada angka salah di laporan

**Acceptance Criteria:**
- [ ] LLM menulis angka sebagai placeholder yang merujuk item paket bukti (mis. `{{metric:finding_42.p90_days}}`); kode menggantinya dengan nilai dan satuan terformat.
- [ ] Placeholder yang tidak ada di paket bukti membuat draf gagal pemeriksaan.
- [ ] Angka literal yang ditulis langsung oleh LLM (di luar placeholder, nomor bagian, atau tanggal yang ada di bukti) ditandai dan membuat draf gagal pemeriksaan.
- [ ] Mengarahkan kursor ke angka menampilkan asal-usulnya (temuan, metrik, versi).

### Story 4: Rujukan yang dapat diperiksa

**Sebagai** Analis
**Saya ingin** setiap klaim menunjuk bukti yang mendasarinya
**Sehingga** saya dapat memverifikasi sebelum menyetujui

**Acceptance Criteria:**
- [ ] Setiap klaim memiliki minimal satu rujukan ke item paket bukti; klik membuka item tersebut (temuan, aturan + kutipan sumber, kasus, hasil Jev).
- [ ] Rujukan ke item yang tidak ada di paket bukti membuat draf gagal pemeriksaan.
- [ ] Item paket bukti yang tidak dipakai sama sekali ditampilkan sebagai "bukti tidak dirujuk" untuk membantu analis menilai kelengkapan.

### Story 5: Tidak ada tindakan atau keputusan baru dari model

**Sebagai** Analis
**Saya ingin** draf hanya membahas kandidat yang ada di paket bukti
**Sehingga** rekomendasi tetap melalui alur penilaian dan validasi

**Acceptance Criteria:**
- [ ] Klaim bertipe `rekomendasi_tervalidasi` wajib merujuk ID kandidat berstatus `tervalidasi` dari M09.
- [ ] Penyebutan tindakan yang tidak cocok dengan kandidat mana pun di paket bukti ditandai sebagai "tindakan tidak dikenal" dan membuat draf gagal pemeriksaan.
- [ ] Draf tidak boleh menyatakan keputusan ("dipilih", "akan diterapkan"); kalimat semacam itu ditandai.
- [ ] Ide tambahan dari model hanya boleh muncul di bagian "pertanyaan untuk ditindaklanjuti" sebagai pertanyaan, bukan rekomendasi.

### Story 6: Menangani kegagalan pemeriksaan

**Sebagai** Analis
**Saya ingin** sistem mencoba memperbaiki draf yang gagal pemeriksaan dan memberi tahu bila tetap gagal
**Sehingga** saya tidak menerima draf yang melanggar batas

**Acceptance Criteria:**
- [ ] Draf gagal pemeriksaan dikirim ulang ke model dengan daftar pelanggaran, maksimal 2 kali.
- [ ] Bila tetap gagal, status `gagal_pemeriksaan` dengan daftar pelanggaran ditampilkan; draf tidak disajikan sebagai hasil.
- [ ] Semua percobaan, termasuk yang gagal, tersimpan untuk audit dan evaluasi.

### Story 7: Meninjau dan menyunting draf

**Sebagai** Analis
**Saya ingin** menyetujui, menyunting, atau menolak draf
**Sehingga** hanya narasi yang saya setujui yang dipakai untuk klien

**Acceptance Criteria:**
- [ ] Draf yang lolos pemeriksaan dapat dibuka di workspace M11 untuk disetujui, disunting, atau ditolak dengan alasan.
- [ ] Suntingan disimpan sebagai versi baru; draf asli model tetap tersimpan.
- [ ] Suntingan analis tetap menjalani pemeriksaan angka dan rujukan; analis dapat mengganti angka hanya melalui placeholder atau dengan catatan eksplisit.
- [ ] Narasi yang disetujui dapat dipakai M12 (Fase 2).

---

## Functional Requirements

### Fitur 1: Skema keluaran interpretasi
- **Deskripsi**: Skema Zod `Interpretation` berisi bagian tetap; setiap bagian berisi daftar `Claim` (teks dengan placeholder, tipe, daftar `citations` berupa ID item paket bukti, ID kandidat bila rekomendasi). Model diminta mengembalikan JSON sesuai skema (memakai fitur keluaran terstruktur penyedia bila tersedia).
- **Edge case**: Paket bukti berstatus "konteks terbatas" (M07) → bagian ketidakpastian wajib menyebutkannya; draf tanpa pernyataan itu gagal pemeriksaan.

### Fitur 2: Templat prompt berversi
- **Deskripsi**: `PromptTemplate` per jenis target dan audiens, berisi instruksi peran ("menjelaskan, tidak menghitung, tidak memutuskan"), aturan placeholder dan rujukan, definisi tipe klaim, dan contoh. Disimpan berversi; setiap draf mencatat versi templat, ID model, dan parameter.
- **Parameter**: suhu rendah untuk konsistensi; nilai pasti ditetapkan tim.

### Fitur 3: Pemeriksa draf (kode)
| Pemeriksaan | Gagal bila |
|---|---|
| Skema | JSON tidak valid terhadap `Interpretation` |
| Placeholder | Placeholder merujuk item/nilai yang tidak ada |
| Angka literal | Ada angka di luar placeholder yang tidak termasuk pengecualian (nomor bagian/halaman, tanggal yang ada di bukti) |
| Rujukan | Klaim tanpa rujukan atau rujukan ke item yang tidak ada |
| Tipe klaim | `fakta_terukur` merujuk item non-terukur; `rekomendasi_tervalidasi` tanpa kandidat tervalidasi |
| Tindakan tidak dikenal | Menyebut tindakan yang tidak cocok dengan kandidat paket bukti |
| Bahasa keputusan/kausal | Klaim `fakta_terukur` atau `interpretasi` memakai frasa kepastian kausal atau keputusan dari daftar kata yang dapat dikonfigurasi |
| Ketidakpastian | Bagian ketidakpastian kosong, atau tidak menyebut "konteks terbatas"/"sampel kecil" bila penanda itu ada di bukti |

- Pemeriksaan "tindakan tidak dikenal" dan "bahasa kausal" bersifat heuristik; hasil positif palsu dapat dikesampingkan analis dengan alasan tercatat.

### Fitur 4: Adapter LLM dan pekerjaan interpretasi
- **Deskripsi**: `LlmAdapter` TypeScript yang netral penyedia (penyedia dan model ditetapkan tim). Pekerjaan berjalan di worker Temporal: paket bukti → prompt → pemanggilan → validasi Zod → pemeriksa → (perbaikan ≤ 2×) → simpan → node `Interpretation` ke M07.
- **Penggunaan ulang**: kunci = hash(paket bukti + versi templat + model + audiens).
- **Biaya**: token dan biaya dicatat per proyek; batas harian dapat diatur.

### Fitur 5: Penyajian dan tinjauan
- **Deskripsi**: Komponen Next.js yang merender klaim dengan lencana tipe, angka dengan tooltip asal-usul, dan rujukan yang dapat diklik; tombol tinjauan terhubung ke M11.

### Out of Scope (Fase 1)
- Chat atau tanya-jawab bebas atas data.
- Pembuatan kandidat, keputusan, atau perubahan angka oleh LLM.
- Pengiriman narasi langsung ke klien tanpa tinjauan.
- Bahasa selain Indonesia (Inggris dipertimbangkan Fase 2).
- Fine-tuning model.
- Pemakaian Jev sebagai pemeriksa kedua keluaran LLM (dipertimbangkan Fase 2).

---

## Technical Constraints

### Performa
- Satu interpretasi < 30 detik, termasuk pemeriksaan; maksimal 2 perbaikan.
- Pemanggilan LLM hanya dari worker, tidak dari request Next.js.

### Keamanan dan pelindungan data
- Kunci API LLM sebagai rahasia server, hanya dibaca worker.
- **Data dikirim ke penyedia LLM eksternal.** Fase 1 hanya data publik/sintetis. Sebelum data klien nyata: periksa kebijakan retensi/pelatihan penyedia, pastikan kontrak (M01) dan persetujuan klien mengizinkan, serta minimalkan atau pseudonimkan data pribadi dalam paket bukti.
- Isi paket bukti diperlakukan sebagai data, bukan instruksi: teks dari sumber data (mis. catatan, nama aktivitas) diberi pembatas yang jelas dalam prompt untuk mengurangi risiko *prompt injection*.
- Permintaan, persetujuan, penolakan, dan pengesampingan pemeriksaan tercatat di audit log.

### Integrasi
- **M07**: paket bukti `llm_interpretation`; hasil sebagai node `Interpretation` yang merujuk paket bukti.
- **M06/M08/M09**: sumber target dan isi paket bukti.
- **M11**: tinjauan, suntingan, dan persetujuan.
- **M12 (Fase 2)**: narasi disetujui untuk laporan dan deck.

### Teknologi
- Service model TypeScript dengan `LlmAdapter`; worker Temporal TypeScript.
- Zod: `InterpretationRequest`, `Interpretation`, `Claim`, `CheckReport`, `PromptTemplate`.
- PostgreSQL untuk draf, versi, laporan pemeriksaan; object storage untuk prompt dan respons mentah.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| POST | `/api/projects/{projectId}/interpretations` | Meminta draf (`202`) |
| GET | `/api/projects/{projectId}/interpretations/{interpretationId}` | Draf, status, laporan pemeriksaan, paket bukti |
| GET | `/api/projects/{projectId}/interpretations?targetId=` | Riwayat draf untuk satu target |
| POST | `/api/projects/{projectId}/interpretations/{interpretationId}/versions` | Simpan suntingan analis |
| GET/POST | `/api/projects/{projectId}/prompt-templates` | Templat prompt berversi |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Skema interpretasi dengan klaim bertipe, placeholder angka, dan rujukan.
- Templat prompt untuk lima jenis target dan dua audiens.
- Pemeriksa draf delapan aturan dengan perbaikan otomatis maksimal 2 kali.
- Adapter LLM netral penyedia, penggunaan ulang hasil, pencatatan biaya.
- Penyajian dengan lencana tipe, asal-usul angka, rujukan yang dapat diklik, dan tautan tinjauan M11.

**Definisi MVP**: Di depan juri, untuk satu indikasi bottleneck dan kandidatnya, sistem menghasilkan penjelasan versi pemilik proses. Setiap angka dapat ditelusuri ke temuan, setiap klaim merujuk bukti, dan hipotesis terlihat berbeda dari fakta. Juri juga melihat satu contoh draf yang gagal pemeriksaan (mis. menyebut tindakan di luar kandidat) lalu diperbaiki otomatis.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Narasi bagian laporan dan deck untuk M12.
- Bahasa Inggris.
- Jev sebagai pemeriksa kedua (mis. menilai apakah klaim didukung bukti yang dirujuk).
- Pemakaian pada data klien nyata setelah persetujuan pemrosesan data.

### Pertimbangan masa depan
- Tanya-jawab yang terikat paket bukti dengan pemeriksaan yang sama.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| LLM menulis klaim melampaui bukti dengan bahasa halus yang lolos heuristik | Sedang | Tinggi | Tipe klaim wajib, rujukan wajib, tinjauan analis sebelum dipakai, label draf |
| Pemeriksa terlalu ketat sehingga banyak draf gagal | Sedang | Sedang | Ukur tingkat lolos; pengecualian terkonfigurasi; pengesampingan dengan alasan |
| Placeholder membuat kalimat kaku | Sedang | Rendah | Format angka dan satuan oleh kode; contoh dalam templat |
| Prompt injection dari teks sumber data | Rendah | Sedang | Pembatas data dalam prompt; pemeriksa struktur dan tindakan |
| Biaya dan latensi LLM saat demo | Sedang | Sedang | Hasil demo dihitung lebih dulu; penggunaan ulang berbasis hash |

---

## Dependencies & Blockers

**Dependensi:**
- M07: paket bukti; M06/M08/M09: target dan isinya; M11: tinjauan.
- Pilihan penyedia dan model LLM serta kuncinya (tim).
- Set uji 30 target dan rubrik penilaian manusia.

**Blocker yang diketahui:**
- Penyedia LLM belum ditetapkan; adapter dan pemeriksa dapat dikembangkan lebih dulu dengan respons tiruan.

---

## Appendix

### Glosarium
- **Interpretasi**: Draf penjelasan terstruktur yang dibuat LLM dari paket bukti.
- **Klaim**: Satu pernyataan dalam interpretasi beserta tipe dan rujukannya.
- **Placeholder angka**: Penanda yang ditulis model dan diganti kode dengan nilai dari paket bukti.
- **Pemeriksa draf**: Aturan kode yang memastikan draf mematuhi batas sebelum ditampilkan.
- **Audiens**: Gaya penjelasan untuk analis atau pemilik proses.
- **Prompt injection**: Upaya teks dalam data untuk mengubah perilaku model.

### Referensi
- `feature-modules-v1.3.md` — bagian M10 dan prinsip "LLM menjelaskan hasil beserta bukti dan ketidakpastiannya".
- [Zod: definisi skema dan validasi](https://zod.dev/basics)

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 27/30 | Target penerimaan belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Tampilan klaim bertipe perlu diuji dengan pemilik proses |
| Technical Constraints | 14/15 | Penyedia LLM belum ditetapkan |
| Scope & Priorities | 9/10 | |
| **Total** | **90/100** | |
