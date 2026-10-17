# Product Requirements Document: M01 — Manajemen Klien, Proyek, Akses, dan Kontrak

**Versi**: 1.0
**Tanggal**: 2026-10-17
**Penyusun**: Sarah (Product Owner) bersama Jabriel
**Quality Score**: 90/100
**Acuan**: `feature-modules-v1.3.md` (M01), `00-prd-overview.md`

---

## Executive Summary

Konsultan Javan menangani beberapa klien sekaligus, dan setiap klien menyerahkan data proses yang sensitif: purchase order, invoice, catatan penolakan, hingga nama pegawai. Tanpa batas konteks yang tegas, data dan temuan satu klien berisiko terlihat oleh klien lain, analis yang tidak ditugaskan, atau tercampur di cache dan graph. M01 menetapkan batas itu: siapa kliennya, proyek apa, proses mana yang dianalisis, periode kontraknya, siapa anggotanya, dan apa yang boleh mereka lakukan.

M01 tidak menghasilkan analisis apa pun, tetapi semua modul lain bergantung padanya. Setiap request API, payload worker, query Neo4j, dan objek di object storage membawa identitas proyek yang diperiksa oleh satu fungsi kewenangan bersama.

Untuk Demo Day, M01 cukup tipis: satu organisasi (Javan), tiga peran tetap, pembuatan klien/proyek/cakupan, undangan anggota, penegakan akses di seluruh lapisan, dan audit log dasar. Otomasi retensi, SSO, dan peran kustom masuk Fase 2.

---

## Problem Statement

**Situasi saat ini**: Data proses klien biasanya dikirim sebagai file lewat email atau drive bersama. Akses ditentukan per orang secara manual, tidak ada catatan siapa membuka apa, dan berakhirnya kontrak tidak otomatis menghentikan akses atau pengambilan data.

**Solusi yang diusulkan**: Ruang proyek per klien dengan cakupan proses, periode kontrak, keanggotaan berbasis peran, dan kebijakan akses yang ditegakkan oleh satu lapisan kewenangan di service TypeScript, dipakai oleh Route Handler, Server Component/Action, dan worker.

**Dampak bisnis**: Javan dapat menunjukkan kepada klien bahwa data mereka terisolasi dan aksesnya tercatat. Ini syarat kepercayaan sebelum klien mau menghubungkan sistem mereka (M02), dan menjadi poin penilaian kepatuhan pada Post-Hackathon Acceleration.

---

## Success Metrics

**KPI utama** [perlu validasi Javan]:
- **Isolasi lintas proyek**: 0 kebocoran. Diukur dengan suite uji matriks akses otomatis (setiap peran × setiap endpoint × proyek sendiri/proyek lain); target 100% lulus di CI.
- **Waktu setup proyek baru**: < 10 menit dari membuat klien sampai anggota pertama bisa masuk. Diukur dengan uji tugas pada 3 pengguna uji.
- **Cakupan audit**: 100% aksi penting (lihat daftar di Fitur 5) tercatat dengan pelaku, waktu, objek, dan hasil.
- **Latensi pemeriksaan kewenangan**: < 20 ms p95 per pemeriksaan di VPS demo.

**Validasi**: Uji matriks akses dijalankan di setiap commit sejak minggu pertama Prototype Alpha Refinement; uji tugas dilakukan sebelum Prototype Readiness Review (November).

---

## User Personas

Persona lengkap ada di `00-prd-overview.md`. Peran mereka di M01:

### Utama: Rina — Administrator proyek/integrasi
- **Tujuan**: Menyiapkan proyek klien dengan cepat dan memastikan hanya orang yang tepat punya akses.
- **Pain point**: Akses diberikan lewat berbagi file; sulit mencabut akses atau membuktikan siapa yang pernah melihat data.
- **Level teknis**: Lanjut.

### Sekunder: Dimas — Analis Javan
- **Tujuan**: Langsung melihat proyek yang ditugaskan kepadanya tanpa memilah data klien lain.
- **Pain point**: Tercampurnya file antar-klien di folder kerja.

### Sekunder: Bu Sari — Pemilik proses klien
- **Tujuan**: Melihat hasil proyek perusahaannya saja, dan yakin data tidak dipakai di luar kontrak.
- **Pain point**: Tidak tahu siapa saja di pihak konsultan yang mengakses datanya.

---

## Matriks Kewenangan (Fase 1)

| Aksi | Administrator | Analis | Pemilik proses |
|---|---|---|---|
| Membuat/mengubah klien | ✓ | — | — |
| Membuat proyek, cakupan proses, periode kontrak | ✓ | — | — |
| Mengundang/mencabut anggota proyek | ✓ | — | — |
| Mengatur sumber data & menghentikan sinkronisasi (M02) | ✓ | — | — |
| Melihat data event & kasus | ✓ | ✓ | ✓ (proyek sendiri) |
| Menjalankan analisis, mengubah aturan/katalog | — | ✓ | — |
| Meninjau hasil & mencatat keputusan (M11) | — | ✓ | ✓ (sesuai kewenangan) |
| Melihat audit log proyek | ✓ | Baca | Baca (proyek sendiri) |

Semua aksi hanya berlaku pada proyek tempat pengguna menjadi anggota. Tidak ada akses default ke proyek lain, termasuk untuk Administrator yang bukan anggota proyek tersebut.

---

## User Stories & Acceptance Criteria

### Story 1: Membuat klien dan proyek

**Sebagai** Administrator
**Saya ingin** membuat klien dan proyek beserta cakupan proses dan periode kontraknya
**Sehingga** pekerjaan analisis punya batas konteks yang jelas sejak awal

**Acceptance Criteria:**
- [ ] Administrator dapat membuat klien (nama, sektor, kontak) dan proyek di bawahnya (nama, deskripsi, cakupan proses, tanggal mulai–selesai kontrak, kebijakan retensi).
- [ ] Input divalidasi dengan skema Zod; tanggal selesai sebelum tanggal mulai ditolak dengan pesan yang jelas.
- [ ] Nama proyek unik dalam satu klien; duplikat ditolak.
- [ ] Pembuat proyek otomatis menjadi anggota dengan peran Administrator.
- [ ] Pembuatan klien dan proyek tercatat di audit log.

### Story 2: Mengelola anggota dan peran

**Sebagai** Administrator
**Saya ingin** mengundang anggota ke proyek dengan peran tertentu dan mencabutnya kembali
**Sehingga** hanya orang yang ditugaskan dapat mengakses data klien

**Acceptance Criteria:**
- [ ] Administrator dapat menambahkan pengguna ke proyek dengan peran Administrator, Analis, atau Pemilik proses.
- [ ] Undangan untuk email yang belum terdaftar membuat akun tertunda yang aktif setelah pengguna menyetel kata sandi.
- [ ] Pencabutan anggota berlaku pada request berikutnya (sesi lama tidak bisa lagi membaca data proyek).
- [ ] Sistem menolak penghapusan atau penurunan peran Administrator terakhir di proyek.
- [ ] Setiap perubahan keanggotaan tercatat (siapa, kepada siapa, peran lama → baru).

### Story 3: Penegakan akses di semua lapisan

**Sebagai** Pemilik proses klien
**Saya ingin** yakin hanya anggota proyek saya yang dapat melihat data dan hasil perusahaan saya
**Sehingga** data sensitif tidak bocor ke klien lain

**Acceptance Criteria:**
- [ ] Setiap Route Handler, Server Component, dan Server Action memanggil `authorize(user, action, projectId)` sebelum membaca/mengubah data.
- [ ] Request ke sumber daya proyek lain mengembalikan `404 Not Found` (bukan `403`) agar keberadaan proyek tidak terungkap.
- [ ] Payload pekerjaan Temporal membawa `projectId` dan `requestedBy`; worker memverifikasi ulang kewenangan sebelum memproses.
- [ ] Query PostgreSQL dan Neo4j selalu difilter `project_id`; kunci object storage berawalan `projects/{projectId}/`.
- [ ] Data proyek tidak disimpan di cache bersama Next.js tanpa kunci proyek; uji otomatis memverifikasi dua pengguna dari proyek berbeda tidak menerima respons satu sama lain.

### Story 4: Siklus hidup kontrak

**Sebagai** Administrator
**Saya ingin** proyek otomatis berubah status saat kontrak berakhir atau dihentikan
**Sehingga** data tidak terus diambil atau diubah di luar masa kontrak

**Acceptance Criteria:**
- [ ] Status proyek: `draft` → `aktif` → `ditangguhkan` / `berakhir` → `diarsipkan`.
- [ ] Administrator dapat menangguhkan proyek secara manual; saat ditangguhkan, sinkronisasi M02 dan analisis baru diblokir, data tetap dapat dibaca.
- [ ] Proyek melewati tanggal selesai kontrak berubah menjadi `berakhir` (pemeriksaan terjadwal harian): hanya-baca, tanpa sinkronisasi atau analisis baru.
- [ ] Analisis yang sedang berjalan saat penangguhan diselesaikan, tetapi hasilnya ditandai "selesai setelah penangguhan".
- [ ] Perubahan status tercatat dengan alasan.

### Story 5: Status dan aktivitas proyek

**Sebagai** Analis
**Saya ingin** melihat daftar proyek saya beserta status dan aktivitas terakhirnya
**Sehingga** saya tahu proyek mana yang perlu saya kerjakan

**Acceptance Criteria:**
- [ ] Beranda menampilkan hanya proyek tempat pengguna menjadi anggota, dengan status, periode kontrak, peran pengguna, dan waktu aktivitas terakhir.
- [ ] Halaman proyek menampilkan ringkasan: anggota, sumber data terhubung (dari M02), analisis terakhir, dan 20 aktivitas audit terbaru.
- [ ] Pengguna tanpa proyek melihat keadaan kosong dengan petunjuk menghubungi Administrator.

---

## Functional Requirements

### Fitur 1: Entitas klien dan proyek
- **Deskripsi**: Entitas `Client`, `Project`, `ProcessScope` (nama proses, deskripsi, aktivitas awal/akhir indikatif), dan `ContractTerm` (tanggal mulai/selesai, kebijakan retensi, izin koneksi sumber).
- **Alur**: Administrator → Klien baru → isi formulir → Proyek baru → pilih klien → isi cakupan & kontrak → simpan sebagai `draft` → aktifkan.
- **Edge case**: Mengubah tanggal kontrak saat proyek sudah `berakhir` mengaktifkan kembali proyek hanya bila tanggal baru di masa depan, dan tercatat di audit.
- **Error handling**: Kegagalan validasi menampilkan pesan per kolom; kegagalan database mengembalikan pesan umum dan ID korelasi untuk penelusuran.

### Fitur 2: Keanggotaan dan peran
- **Deskripsi**: Entitas `Membership(userId, projectId, role, addedBy, addedAt)`; tiga peran tetap di Fase 1.
- **Alur**: Halaman anggota → Tambah → email + peran → simpan → pengguna menerima tautan aktivasi (Fase 1: tautan ditampilkan ke Administrator untuk disalin bila email belum dikonfigurasi).
- **Edge case**: Satu pengguna dapat menjadi anggota beberapa proyek dengan peran berbeda; peran dievaluasi per proyek.
- **Error handling**: Menambahkan anggota yang sudah ada mengubah perannya setelah konfirmasi, bukan membuat duplikat.

### Fitur 3: Lapisan kewenangan bersama
- **Deskripsi**: Modul `authz` di paket service TypeScript berisi matriks kewenangan dan fungsi `authorize()`; dipakai Next.js dan worker TypeScript. Worker Python menerima `projectId` yang telah diverifikasi oleh workflow dan hanya membaca referensi data di bawah prefiks proyek tersebut.
- **Edge case**: Keanggotaan dicabut di tengah workflow → activity berikutnya gagal kewenangan, workflow berhenti dengan status `dibatalkan_akses`.
- **Error handling**: Kegagalan kewenangan dicatat di audit log sebagai percobaan akses ditolak.

### Fitur 4: Siklus hidup kontrak
- **Deskripsi**: Status proyek dan aturan apa yang diizinkan di tiap status; pemeriksaan harian via jadwal Temporal.
- **Integrasi**: Mengirim sinyal ke M02 untuk menghentikan jadwal sinkronisasi saat status bukan `aktif`.
- **Edge case**: Jadwal harian gagal berjalan → pemeriksaan status juga dilakukan saat request analisis/sinkronisasi baru dimulai, sehingga kontrak berakhir tetap ditegakkan.

### Fitur 5: Audit log
- **Deskripsi**: Tabel `AuditEvent` append-only (pelaku, aksi, objek, projectId, waktu, hasil, ID korelasi).
- **Aksi wajib dicatat**: login, pembuatan/perubahan klien & proyek, perubahan keanggotaan, perubahan status kontrak, konfigurasi sumber data, pemicu analisis, keputusan review, ekspor, dan akses ditolak.
- **Edge case**: Kegagalan menulis audit untuk aksi mutasi membatalkan aksi tersebut (transaksi yang sama).

### Out of Scope (Fase 1)
- SSO (Google Workspace/SAML) dan MFA.
- Peran kustom dan izin tingkat atribut (misalnya menyembunyikan kolom nama pegawai).
- Penghapusan data otomatis sesuai retensi (Fase 1 hanya mencatat kebijakan).
- Multi-organisasi (konsultan selain Javan).
- Penagihan dan manajemen lisensi.

---

## Technical Constraints

### Performa
- Pemeriksaan `authorize()` < 20 ms p95 (keanggotaan dibaca dengan indeks `(user_id, project_id)`).
- Daftar proyek < 2 detik p95 untuk pengguna dengan hingga 50 proyek.

### Keamanan
- Autentikasi berbasis sesi dengan cookie `HttpOnly`, `Secure`, `SameSite=Lax`; kata sandi di-hash dengan algoritma modern (Argon2id atau bcrypt). Pustaka konkret (mis. Auth.js) diputuskan tim.
- Semua trafik melalui HTTPS di VPS.
- Rate limit percobaan login (mis. 10 per menit per IP).
- Rahasia koneksi sumber data tidak disimpan di M01; M01 hanya menyimpan izin, rahasianya dikelola M02 secara terenkripsi.
- Kepatuhan: dirancang menuju prinsip UU No. 27/2022 tentang Pelindungan Data Pribadi (pembatasan tujuan, akses minimum, jejak audit). Penilaian kepatuhan formal masuk tahap IP & Compliance pasca-hackathon.

### Integrasi
- **M02**: menerima status proyek/izin koneksi; menghentikan sinkronisasi saat proyek tidak `aktif`.
- **M07**: retrieval graph memakai filter `projectId` dan peran pengguna dari M01.
- **Semua modul**: memanggil `authorize()`; payload Temporal menyertakan `projectId` dan `requestedBy`.

### Teknologi
- Next.js App Router + TypeScript, Route Handlers, Server Actions untuk formulir.
- Zod untuk skema `Client`, `Project`, `ContractTerm`, `Membership`, dan request terkait.
- PostgreSQL (tabel `clients`, `projects`, `process_scopes`, `contract_terms`, `memberships`, `audit_events`).
- Temporal schedule untuk pemeriksaan status kontrak harian.

### Endpoint Fase 1 (indikatif)
| Metode | Path | Fungsi |
|---|---|---|
| POST | `/api/clients` | Membuat klien |
| GET | `/api/projects` | Daftar proyek milik pengguna |
| POST | `/api/projects` | Membuat proyek |
| GET/PATCH | `/api/projects/{projectId}` | Detail/ubah proyek |
| POST | `/api/projects/{projectId}/status` | Ubah status (aktifkan, tangguhkan, arsipkan) |
| GET/POST/DELETE | `/api/projects/{projectId}/members` | Kelola anggota |
| GET | `/api/projects/{projectId}/audit` | Audit log proyek |

---

## MVP Scope & Phasing

### Fase 1: MVP (Demo Day, Desember 2026)
- Klien, proyek, cakupan proses, periode kontrak.
- Tiga peran tetap dan manajemen anggota.
- `authorize()` ditegakkan di Next.js, worker TypeScript, dan prefiks penyimpanan; suite uji matriks akses di CI.
- Status proyek dengan penangguhan manual dan pemeriksaan berakhir harian.
- Audit log dasar dan halaman status proyek.

**Definisi MVP**: Dua klien demo (misalnya "PT Contoh Manufaktur" dengan data BPI 2019 dan klien kedua dengan dataset lain) dapat dibuat, masing-masing dengan anggota berbeda, dan juri dapat melihat bahwa pengguna klien A tidak dapat membuka apa pun milik klien B.

### Fase 2: Penyempurnaan (Januari–April 2027)
- SSO dan MFA.
- Penghapusan/anonimisasi data otomatis sesuai retensi kontrak, dengan laporan bukti penghapusan.
- PostgreSQL Row-Level Security sebagai lapisan pertahanan kedua.
- Izin tingkat atribut untuk data pribadi pegawai.
- Notifikasi email untuk undangan dan kontrak yang akan berakhir.

### Pertimbangan masa depan
- Multi-organisasi bila sistem ditawarkan ke konsultan lain.
- Portal klien mandiri.

---

## Risk Assessment

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| Endpoint atau query baru lupa memanggil `authorize()` | Sedang | Tinggi | Wrapper wajib untuk Route Handler/Server Action; uji matriks akses otomatis yang gagal bila endpoint baru tidak terdaftar |
| Cache Next.js menyajikan data proyek lain | Rendah | Tinggi | Data proyek dibaca dinamis atau di-cache dengan kunci proyek; uji dua pengguna lintas proyek |
| Worker Python membaca data di luar proyek | Rendah | Tinggi | Worker hanya menerima referensi berprefiks proyek; validasi prefiks di sisi worker |
| Waktu tim habis untuk fitur akses, bukan analisis inti | Sedang | Sedang | Batasi Fase 1 ke tiga peran tetap; tunda SSO, RLS, retensi otomatis |
| Peran yang dirancang tidak cocok dengan cara kerja Javan | Sedang | Sedang | Validasi matriks kewenangan di Problem Owner Clinic |

---

## Dependencies & Blockers

**Dependensi:**
- Keputusan pustaka autentikasi (tim teknis).
- Penyediaan VPS dan domain HTTPS (tim operasional).
- Validasi matriks kewenangan dan pembagian peran bersama Javan (Problem Owner Clinic).

**Blocker yang diketahui:**
- Tidak ada. M01 dapat dikerjakan paling awal karena menjadi fondasi modul lain.

---

## Appendix

### Glosarium
- **Klien**: Perusahaan yang prosesnya dianalisis Javan.
- **Proyek**: Satu pekerjaan konsultasi untuk satu klien, dengan cakupan proses dan periode tertentu.
- **Cakupan proses**: Proses bisnis yang dianalisis, misalnya Purchase-to-Pay.
- **Kontrak**: Ketentuan periode, retensi, dan izin koneksi yang membatasi pemakaian data.
- **Audit log**: Catatan append-only atas aksi penting di sistem.

### Referensi
- `feature-modules-v1.3.md` — bagian M01 dan "Batas implementasi".
- Program Guideline ANGEL Innovation Hackathon 2026 — Industrial Challenge #2.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Zod](https://zod.dev/basics)

### Catatan skor kualitas
| Dimensi | Skor | Catatan |
|---|---|---|
| Business Value & Goals | 26/30 | Target diusulkan, belum divalidasi Javan |
| Functional Requirements | 24/25 | |
| User Experience | 16/20 | Persona berbasis peran di dokumen arsitektur, belum diwawancarai |
| Technical Constraints | 14/15 | Pustaka autentikasi belum diputuskan |
| Scope & Priorities | 10/10 | |
| **Total** | **90/100** | |
