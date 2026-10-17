# Product Requirements Document: M07 — Jejak Bukti dan Pengetahuan Proses

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M07), `00-prd-overview.md`, PRD M01–M06

---

## Executive Summary

Konsultan sering ditanya dua hal oleh klien: "angka ini dari mana?" dan "apa hubungannya dengan masalah lain?". Jawabannya tersebar di banyak tempat: snapshot data (M02), pemetaan (M03), aturan dan SOP (M04), analisis dan temuan (M05–M06), lalu nantinya penilaian model dan keputusan analis (M08–M11). M07 menghubungkan semuanya dalam satu **context graph** sehingga asal-usul setiap hasil dapat ditelusuri dan konteks yang relevan dapat dipilih secara terkendali.

M07 punya dua peran. Pertama, **jejak bukti** bagi manusia: dari temuan ke rumus, filter, aturan, dokumen SOP, versi dataset, sampai snapshot sumber. Kedua, **pemilihan konteks** bagi model: sebelum Jev (M08) atau LLM (M10) dipanggil, aplikasi, bukan model, memilih bukti yang relevan dan berhak diakses, membekukannya sebagai *paket bukti*, dan mencatat apa saja yang diberikan kepada model.

Graph di Neo4j adalah **representasi turunan**, bukan sumber kebenaran. Catatan otoritatif tetap di PostgreSQL dan object storage; graph diperbarui darinya dan dapat dibangun ulang kapan saja. Relasi dibedakan menjadi observasi, dukungan hipotesis, dan keputusan yang ditinjau, sehingga graph tidak pernah dibaca sebagai bukti sebab-akibat. Fase 1 mencakup jejak bukti, eksplorasi dasar, dan pemilihan konteks deterministik; pencarian semantik berbasis embedding masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Asal-usul angka dan alasan rekomendasi tersimpan di kepala analis, catatan pribadi, atau versi file yang tidak lagi jelas. Ketika LLM dipakai, konteks yang diberikan biasanya disalin manual ke prompt, sehingga tidak dapat diaudit dan berisiko memasukkan data proyek lain.

**Solusi yang diusulkan**: Context graph per proyek yang diproyeksikan dari catatan otoritatif, dengan relasi bertipe dan berasal-usul, tampilan jejak bukti, serta layanan retrieval TypeScript yang menghasilkan paket bukti immutable sesuai hak akses untuk M08–M10.

**Dampak bisnis**: Setiap angka, penilaian model, dan rekomendasi dapat dipertanggungjawabkan. Pemakaian AI menjadi dapat diaudit, yang menjadi pembeda utama terhadap "chatbot di atas data" dan syarat kepercayaan klien korporat.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Kelengkapan jejak**: 100% temuan M06 memiliki jalur utuh sampai snapshot sumber (M02) dan, bila melibatkan aturan, sampai dokumen sumber (M04).
- **Kesegaran graph**: keterlambatan proyeksi dari catatan otoritatif ke graph < 30 detik p95 dalam operasi normal.
- **Kecepatan retrieval**: pembentukan paket bukti < 1 detik p95 untuk satu temuan.
- **Isolasi**: 0 node atau relasi dari proyek lain muncul dalam hasil query dan paket bukti (suite uji akses otomatis).
- **Reprodusibilitas**: pembangunan ulang graph dari catatan otoritatif menghasilkan jumlah node/relasi dan hash ringkasan yang sama pada 100% uji.
- **Kepatuhan anggaran konteks**: 100% paket bukti berada dalam batas ukuran yang dikonfigurasi untuk model tujuan.

**Validasi**: Uji otomatis jejak dan isolasi di CI; uji pembangunan ulang sebelum Prototype Readiness Review.

---

## User Personas

### Utama: Dimas — Analis
- **Tujuan**: Mempertahankan temuan dan rekomendasi dengan bukti yang dapat ditunjukkan langkah demi langkah.
- **Pain point**: Harus menelusuri ulang file dan catatan untuk menjawab pertanyaan klien.

### Sekunder: Bu Sari — Pemilik proses
- **Tujuan**: Percaya bahwa temuan dan rekomendasi berasal dari data dan aturan perusahaannya sendiri.

### Sekunder (sistem): Layanan model M08/M10
- **Kebutuhan**: Konteks yang relevan, ringkas, sesuai hak akses, dan tercatat.

---

## Model Graph Fase 1

### Node
| Kelompok | Node | Sumber otoritatif |
|---|---|---|
| Data | `Source`, `Snapshot`, `DatasetVersion`, `MappingVersion`, `RepairRule` | M02, M03 |
| Konteks | `ContextPackage`, `Document`, `Rule`, `BpmnTask`, `Calendar`, `ProcessDefinition` | M04 |
| Proses | `Activity` (label kanonis), `Transition`, `Variant`, `ObjectRef` (mis. dokumen PO, vendor), `OrgUnit` (bila atribut tersedia) | M03, M05 |
| Analisis | `Analysis`, `MetricDefinition`, `Finding`, `SavedView`, `CaseRef` (hanya kasus yang dirujuk sebagai bukti) | M05, M06 |
| Katalog | `Hypothesis`, `Intervention`, `Rubric` | M04 |
| Penilaian & keputusan | `EvidenceBundle`, `Assessment`, `Interpretation`, `Decision` | M07, M08, M10, M11 |

Tidak semua event dan kasus menjadi node. Data event tetap di Parquet; graph hanya memuat kasus yang dirujuk sebagai bukti agar ukuran graph terkendali.

### Kategori relasi
| Kategori | Contoh relasi | Dibuat oleh |
|---|---|---|
| **Asal-usul** | `DERIVED_FROM`, `USES_MAPPING`, `COMPUTED_WITH`, `EVALUATED_AGAINST`, `CITES` | Sistem |
| **Observasi** | `OBSERVED_AT` (temuan ↔ aktivitas/transisi), `SUPPORTED_BY_CASE`, `CO_OCCURS_WITH` | Sistem (dari hasil terukur) |
| **Dukungan hipotesis** | `MAY_EXPLAIN`, `SUPPORTS`, `CONTRADICTS` | Penilaian Jev (M08) atau analis |
| **Keputusan** | `REVIEWED`, `DECIDED`, `SUPERSEDES` | Analis/pemilik proses (M11) |

Setiap relasi membawa: kategori, pembuat (`sistem`/`model`/`pengguna`), ID catatan otoritatif, versi, status, dan waktu. Relasi kategori dukungan hipotesis tidak pernah ditampilkan sebagai fakta.

---

## User Stories & Acceptance Criteria

### Story 1: Menelusuri jejak bukti temuan

**Sebagai** Analis
**Saya ingin** melihat jalur lengkap dari temuan ke data dan aturan sumbernya
**Sehingga** saya dapat menjawab pertanyaan klien tentang asal angka

**Acceptance Criteria:**
- [ ] Dari temuan (M06), tampilan jejak menampilkan jalur: temuan → analisis → definisi metrik + filter → versi dataset → pemetaan + aturan perbaikan → snapshot; dan bila ada: temuan → aturan → dokumen + bagian sumber.
- [ ] Setiap node dapat diklik untuk membuka halaman modul asalnya (M02–M06).
- [ ] Bila salah satu elemen jalur sudah digantikan versi baru, node ditandai "ada versi lebih baru" tanpa mengubah jalur historis.
- [ ] Jejak dapat ditampilkan sebagai graf (React Flow) dan sebagai daftar bertingkat untuk dibaca pengguna non-teknis.

### Story 2: Menjelajah konteks di sekitar aktivitas

**Sebagai** Analis
**Saya ingin** melihat apa saja yang berhubungan dengan suatu aktivitas atau transisi
**Sehingga** saya memahami konteksnya sebelum menyusun hipotesis

**Acceptance Criteria:**
- [ ] Untuk satu aktivitas/transisi ditampilkan: temuan terkait, aturan yang menyebutnya, task BPMN yang dipetakan, hipotesis dan intervensi katalog yang syaratnya merujuknya, serta keputusan sebelumnya.
- [ ] Hasil dikelompokkan per kategori relasi dengan warna/ikon berbeda; relasi dukungan hipotesis diberi label "belum terbukti".
- [ ] Jumlah node yang ditampilkan dibatasi (bawaan 50) dengan opsi memperluas per kelompok.

### Story 3: Membedakan observasi, hipotesis, dan keputusan

**Sebagai** Bu Sari
**Saya ingin** tahu mana yang fakta terukur, mana dugaan, dan mana yang sudah diputuskan
**Sehingga** saya tidak salah menafsirkan hubungan dalam graph

**Acceptance Criteria:**
- [ ] Setiap relasi menampilkan kategori, pembuat, dan status secara eksplisit.
- [ ] Filter tampilan per kategori relasi tersedia.
- [ ] Keterangan tetap pada tampilan graph menyatakan bahwa hubungan dalam graph bukan bukti sebab-akibat.

### Story 4: Memilih konteks untuk model

**Sebagai** layanan model M08/M10
**Saya ingin** menerima paket bukti yang relevan dan sesuai hak akses untuk suatu target
**Sehingga** penilaian dan penjelasan didasarkan pada bukti asli yang dapat diaudit

**Acceptance Criteria:**
- [ ] Layanan retrieval menerima target (temuan, kandidat hipotesis/intervensi, atau pertanyaan analis yang terikat pada temuan), tujuan (`jev_assessment` / `llm_interpretation`), pengguna peminta, dan anggaran ukuran.
- [ ] Pemilihan bersifat deterministik: berdasarkan jarak graph dari target, prioritas jenis node, status (disetujui didahulukan), dan kesegaran; urutan yang sama untuk masukan yang sama.
- [ ] Isi paket: data temuan terukur, definisi metrik, kutipan sumber aturan, aturan terkait, ringkasan kasus pendukung, kandidat katalog dan rubriknya, serta keputusan sebelumnya yang relevan.
- [ ] Semua node difilter berdasarkan `projectId` dan peran peminta (M01) sebelum dipilih.
- [ ] Item yang tidak muat dalam anggaran dicatat sebagai "dikecualikan karena anggaran", bukan dibuang tanpa jejak.

### Story 5: Mengaudit apa yang dilihat model

**Sebagai** Analis
**Saya ingin** melihat paket bukti yang diberikan kepada Jev atau LLM untuk suatu hasil
**Sehingga** saya dapat menilai apakah hasil model didasarkan pada bukti yang tepat

**Acceptance Criteria:**
- [ ] `EvidenceBundle` disimpan immutable dengan ID, hash, daftar item (beserta versi), item dikecualikan, target, tujuan, dan peminta.
- [ ] Setiap penilaian M08 dan interpretasi M10 merujuk tepat satu `EvidenceBundle`.
- [ ] Dari hasil model, analis dapat membuka paket bukti dan setiap itemnya.

### Story 6: Menjaga kesegaran dan membangun ulang graph

**Sebagai** Administrator
**Saya ingin** mengetahui apakah graph sudah sinkron dengan catatan otoritatif dan dapat membangunnya ulang
**Sehingga** konteks yang dipakai tidak usang atau rusak

**Acceptance Criteria:**
- [ ] Halaman proyek menampilkan versi graph, posisi proyeksi terakhir, dan keterlambatan terhadap catatan otoritatif.
- [ ] Bila keterlambatan melebihi ambang (bawaan 5 menit), paket bukti yang dibentuk diberi tanda "konteks mungkin belum terbaru".
- [ ] Administrator dapat memicu pembangunan ulang graph proyek; proses idempoten dan berjalan sebagai workflow Temporal.

---

## Functional Requirements

### Fitur 1: Proyeksi graph dari catatan otoritatif
- **Deskripsi**: Setiap perubahan pada catatan otoritatif menulis event ke tabel *outbox* PostgreSQL dalam transaksi yang sama. Worker TypeScript membaca outbox berurutan dan melakukan `MERGE` idempoten ke Neo4j.
- **Edge case**: Worker proyeksi mati → event menumpuk di outbox dan diproses saat worker kembali; tidak ada perubahan yang hilang.
- **Error handling**: Event yang gagal diproyeksikan berulang kali dipindahkan ke antrean gagal dan ditampilkan ke Administrator, tanpa menghentikan event lain.

### Fitur 2: Tampilan jejak dan eksplorasi
- **Deskripsi**: Query jejak dan lingkungan node melalui repositori TypeScript yang selalu mensyaratkan `projectId`; disajikan dengan React Flow dan daftar bertingkat.

### Fitur 3: Layanan retrieval dan paket bukti
- **Deskripsi**: Modul TypeScript `retrieval` dipakai worker Temporal sebelum memanggil Jev/LLM. Menghasilkan `EvidenceBundle` yang disimpan di PostgreSQL (metadata) dan object storage (isi), lalu diproyeksikan sebagai node.
- **Anggaran**: dinyatakan dalam jumlah item dan perkiraan token per tujuan; nilai bawaan diatur per proyek.
- **Edge case**: Target tidak memiliki konteks memadai (mis. temuan tanpa aturan dan tanpa kandidat katalog) → paket tetap dibentuk dengan tanda "konteks terbatas" agar M08 dapat memilih status "informasi tidak cukup".

### Fitur 4: Isolasi akses
- **Deskripsi**: Satu database Neo4j; setiap node dan relasi memiliki properti `projectId` berindeks. Seluruh query melewati repositori yang menambahkan filter `projectId`; query Cypher mentah dari UI tidak diizinkan.
- **Edge case**: Node bersama lintas proyek (mis. definisi metrik bawaan) disalin per proyek, bukan dibagi, agar filter tetap sederhana.

### Fitur 5: Kesegaran dan pembangunan ulang
- **Deskripsi**: Versi graph = posisi outbox terakhir yang diproyeksikan. Pembangunan ulang menghapus graph proyek dan memutar ulang dari catatan otoritatif.

### Out of Scope (Fase 1)
- Pencarian semantik berbasis embedding atau pemotongan (*chunking*) dokumen SOP penuh untuk retrieval.
- Algoritma graph (sentralitas, deteksi komunitas).
- Query graph dalam bahasa alami oleh pengguna.
- Semua event dan kasus sebagai node.
- Pengetahuan lintas proyek/klien.
- Inferensi kausal dari struktur graph.

---

## Technical Constraints

### Performa
- Proyeksi < 30 detik p95 setelah perubahan catatan otoritatif.
- Query jejak satu temuan < 500 ms p95; pembentukan paket bukti < 1 detik p95.
- Ukuran graph proyek demo diperkirakan puluhan ribu node (tanpa event); konfigurasi memori Neo4j disesuaikan dengan VPS.

### Keamanan
- Neo4j tidak diekspos ke internet; hanya diakses layanan internal.
- Filter `projectId` dan peran wajib di repositori; uji isolasi otomatis di CI.
- Paket bukti tidak memuat data dari luar proyek dan tidak memuat rahasia koneksi.
- Pembangunan ulang graph dan akses paket bukti tercatat di audit log.

### Integrasi
- **M01**: kewenangan dan peran untuk filter.
- **M02–M06**: sumber node dan relasi melalui outbox.
- **M08/M10**: konsumen paket bukti; hasilnya kembali sebagai node `Assessment`/`Interpretation`.
- **M11**: keputusan sebagai relasi berkategori keputusan.
- **M04/M13 (Fase 2)**: pelajaran proyek yang ditinjau memperbarui katalog.

### Teknologi
- Neo4j (Community Edition) di Docker pada VPS; driver resmi JavaScript.
- PostgreSQL outbox; worker proyeksi TypeScript di Temporal.
- Zod: `GraphProjectionEvent`, `RetrievalRequest`, `EvidenceBundle`, `LineageResult`.
- React Flow untuk tampilan jejak.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| GET | `/api/findings/{findingId}/lineage` | Jejak bukti temuan (dipakai bersama M06) |
| GET | `/api/projects/{projectId}/graph/neighborhood?nodeId=` | Lingkungan suatu node per kategori |
| GET | `/api/projects/{projectId}/evidence-bundles/{bundleId}` | Isi paket bukti |
| GET | `/api/projects/{projectId}/graph/status` | Versi dan kesegaran graph |
| POST | `/api/projects/{projectId}/graph/rebuild` | Pembangunan ulang (`202`) |

Retrieval untuk model dipanggil sebagai fungsi service di worker, bukan endpoint publik.

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Proyeksi outbox ke Neo4j untuk node dan relasi pada tabel model graph di atas.
- Tampilan jejak bukti temuan dan eksplorasi lingkungan aktivitas/transisi.
- Kategori relasi dengan pembuat dan status.
- Layanan retrieval deterministik dan `EvidenceBundle` immutable.
- Indikator kesegaran dan pembangunan ulang graph.

**Definisi MVP**: Di depan juri, analis membuka satu temuan dan menunjukkan jalurnya sampai halaman SOP dan snapshot sumber. Lalu ia membuka penilaian Jev terkait dan menunjukkan paket bukti yang diberikan kepada model: apa yang dimasukkan, apa yang dikecualikan, dan dari versi mana.

### Fase 2: Penyempurnaan (Januari–April 2027)
- Retrieval hibrida dengan embedding untuk dokumen SOP dan catatan wawancara.
- Pengetahuan lintas proyek yang dianonimkan untuk katalog Javan.
- Analitik graph untuk menemukan temuan yang saling terkait.

### Pertimbangan masa depan
- Antarmuka tanya-jawab yang terikat pada paket bukti dan tetap melalui alur tinjauan.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Graph tidak sinkron dengan catatan otoritatif | Sedang | Tinggi | Outbox transaksional, indikator kesegaran, pembangunan ulang idempoten |
| Kebocoran data lintas proyek lewat query graph | Rendah | Tinggi | Repositori wajib `projectId`, tanpa Cypher mentah dari UI, uji isolasi |
| Relasi graph dibaca sebagai hubungan sebab-akibat | Sedang | Sedang | Kategori relasi eksplisit, label "belum terbukti", keterangan tetap |
| Paket bukti terlalu besar atau tidak relevan untuk model | Sedang | Sedang | Anggaran per tujuan, prioritas deterministik, pencatatan item dikecualikan |
| Neo4j memakan memori berlebih di VPS | Sedang | Sedang | Hanya kasus yang dirujuk sebagai node; konfigurasi memori; pantau di uji beban |

---

## Dependencies & Blockers

**Dependensi:**
- M01–M06: catatan otoritatif dan outbox.
- Neo4j dan Temporal berjalan di VPS.
- Kesepakatan format isi paket bukti dengan pengembang M08/M10.

**Blocker yang diketahui:**
- Format masukan Jev (TypeSafe AI System One) perlu dipastikan agar struktur paket bukti cocok; dibahas di PRD M08.

---

## Appendix

### Glosarium
- **Context graph**: Graph yang menghubungkan data, konteks, analisis, penilaian, dan keputusan dalam satu proyek.
- **Catatan otoritatif**: Data sumber kebenaran di PostgreSQL/object storage; graph diturunkan darinya.
- **Outbox**: Tabel yang mencatat perubahan untuk diproyeksikan ke sistem lain secara andal.
- **Jejak bukti (lineage)**: Jalur dari suatu hasil ke data, aturan, dan dokumen asalnya.
- **Paket bukti (evidence bundle)**: Kumpulan konteks immutable yang dipilih aplikasi untuk satu pemanggilan model.
- **Anggaran konteks**: Batas jumlah item/token yang boleh dimasukkan ke paket bukti.

### Referensi
- `feature-modules-v1.3.md` — bagian M07 dan prinsip "context graph menyediakan konteks melalui aplikasi".
- Dokumentasi Neo4j dan driver JavaScript.
- Pola *transactional outbox*.

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Target belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Tampilan graph untuk pengguna non-teknis perlu diuji |
| Technical Constraints | 15/15 | |
| Scope & Priorities | 9/10 | Format masukan Jev masih terbuka |
| **Total** | **90/100** | |
