# M03b + M03c Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tab "Kualitas" (laporan kualitas + antrean perbaikan, M03b) dan "Dataset" (penerbitan versi + matriks kemampuan, M03c) pada halaman sumber, berdata tiruan di atas M03a.

**Architecture:** Mesin murni baru `lib/mock/quality.ts` (laporan, dampak, kemampuan, hash), tiga aksi reducer (`addRepairRule`, `revokeRepairRule`, `publishDataset`), lalu dua halaman di bawah `sources/[sourceId]/` yang memakai komponen bersama. Semua angka deterministik dari statistik snapshot dan pemetaan.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Untitled UI, Phosphor, Vitest. Tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-10-18-m03bc-frontend-design.md`

## Global Constraints

- Semua teks UI Bahasa Indonesia. Ikon hanya `@phosphor-icons/react`. Judul halaman 20px (h2; layout proyek memegang h1), kontrol 32px (`Button size="xs"`, `Input size="sm"`).
- Fungsi `quality.ts` murni: tanpa React, tanpa `Date.now()`/`Math.random()`, deterministik dari `snapshot.checksum` (pakai `hash` yang diekspor `mapping.ts`); tidak mengimpor `reducer.ts` (reducer akan mengimpor `quality.ts`).
- Reducer murni, tidak melempar; sukses menambah **tepat satu** `AuditEvent`; galat mengembalikan state dengan referensi yang sama. Semua aksi tulis hanya pada proyek `aktif` (`acceptsData`).
- Izin: `quality.view` semua peran; `repair.edit` administrator dan analis; `dataset.publish` hanya analis.
- Ambang: pengecualian total > 20% event butuh `confirmLarge`; `belum_layak` bila ada temuan tinggi `ditemukan` dengan persen > 5 (setelah aturan perbaikan); matriks kemampuan: urutan ambigu > 10% kasus → terbatas, `casesIncluded < 100` → tidak tersedia.
- Semua string (contoh, alasan, catatan, nama file) dirender sebagai teks, tidak pernah HTML (`dangerouslySetInnerHTML` dilarang); nilai panjang terpotong dengan `title` atau `break-words`. Hooks sebelum early return. Kunci objek dari data memakai `Map` atau `Object.hasOwn` (hindari `__proto__`).
- Jangan sentuh backend, branch lain, atau berkas di luar `apps/web` dan `docs/`. **Semua pekerjaan dan git hanya di worktree `/Users/maryuandi/Documents/Lomba/Angel Hackathon/nora-m03bc`** (branch `feat/m03bc-frontend`); jangan sentuh checkout `nora` atau worktree lain; port dev server 3000 dipakai sesi lain (pakai `next dev -p 3107`).
- Commit tanpa baris Co-Authored-By Claude (preferensi pengguna).

## Review Focus

- Snapshot dengan `rows` kecil (mis. < 6, 0): tidak ada pembagian nol, tidak ada NaN, kasus 0 tidak merusak persen/kemampuan; contoh tetap 0..5 nomor baris dalam 1..rows.
- Aturan perbaikan ganda untuk pemeriksaan yang sama dan mencabut lalu menambah ulang: aturan lama (dicabut) tidak dihitung, aturan baru dihitung sekali.
- Total pengecualian tepat 20% (tidak butuh konfirmasi) versus 20,01% (butuh); penjumlahan beberapa aturan dipotong pada total event (tidak melebihi 100%).
- Menerbitkan: konfigurasi identik ditolak; mencabut aturan lalu terbit menghasilkan versi baru dengan hash berbeda; verdict `belum_layak` memblokir; dataset lama menampilkan "Ada versi lebih baru".
- Pemilik proses dan Administrator membuka `/dataset`: tidak ada tombol terbit; Pemilik proses tidak melihat "Tangani".
- Nama file sumber, alasan, atau catatan berisi `<script>` atau 5000 karakter tanpa spasi: tampil sebagai teks, terpotong atau terbungkus, tata letak utuh.
- Sumber tanpa pemetaan atau tanpa snapshot siap: kedua halaman menampilkan keadaan kosong dengan tautan, tidak crash.

---

### Task 1: Tipe, izin, state awal

**Files:**
- Modify: `apps/web/lib/mock/types.ts`, `apps/web/lib/mock/permissions.ts`, `apps/web/lib/mock/data.ts`
- Test: `apps/web/lib/mock/permissions.test.ts`

**Interfaces:**
- Produces (types.ts): `CheckId`, `Severity`, `RepairAction`, `RepairRule`, `CapabilityStatus`, `Capability`, `DatasetVersion` persis seperti spec; `MockState` bertambah `repairRules: RepairRule[]` dan `datasetVersions: DatasetVersion[]`.
- Produces (permissions.ts): `UiAction` bertambah `"quality.view" | "repair.edit" | "dataset.publish"` dengan matriks spec.

- [ ] **Step 1: Write failing tests** di `permissions.test.ts`: `can("analis","dataset.publish")` true; `can("administrator","dataset.publish")` false; `can("administrator","repair.edit")` true; `can("pemilik_proses","repair.edit")` false; `can("pemilik_proses","quality.view")` true.
- [ ] **Step 2: Run** `pnpm --filter web test` — FAIL.
- [ ] **Step 3: Implement** tipe, izin, dan `repairRules: []`, `datasetVersions: []` pada `initialState`. Pastikan semua tempat yang membangun `MockState` (tes, helper) tetap kompilasi.
- [ ] **Step 4: Run** `pnpm --filter web test` dan `pnpm --filter web exec tsc --noEmit` — PASS/bersih.
- [ ] **Step 5: Commit** `feat(web): M03b/c types, permissions, state`.

### Task 2: Mesin kualitas

**Files:**
- Create: `apps/web/lib/mock/quality.ts`
- Test: `apps/web/lib/mock/quality.test.ts`

**Interfaces:**
- Consumes: Task 1 tipe; `activityLabels`, `hash` dari `mapping.ts`; `Snapshot`, `MappingVersion`, `Project`, `MockState`, `RepairRule`.
- Produces: `CHECK_META: Record<CheckId, { title: string; severity: Severity }>`; `VERDICT_LABEL: Record<"siap"|"siap_catatan"|"belum_layak", string>` ("Siap analisis", "Siap dengan catatan", "Belum layak"); `ACTION_LABEL: Record<RepairAction, string>` ("Kecualikan event", "Kecualikan kasus", "Terima apa adanya"); `QualityDataset = { snapshot: Snapshot; mapping: MappingVersion; project: Project }`; `QualityFinding`, `QualityReport` persis spec; `qualityDataset(state: MockState, sourceId: string): QualityDataset | null`; `buildQualityReport(dataset: QualityDataset, repairRules: RepairRule[]): QualityReport`; `repairImpact(report: QualityReport, check: CheckId): { events: number; cases: number }`; `buildCapabilities(dataset: QualityDataset, report: QualityReport): Capability[]`; `datasetHash(snapshotId: string, mappingId: string, ruleIds: string[]): string`; `excludedAfter(report: QualityReport, repairRules: RepairRule[], extra?: { check: CheckId; events: number; cases: number }): { events: number; cases: number }` (total pengecualian aturan aktif, dipotong pada total, ditambah `extra` hipotetis; dipakai reducer dan dialog).

- [ ] **Step 1: Write failing tests** (spec "Pengujian" `quality.test.ts`): `qualityDataset` untuk `s-p2p-sap` (snapshot `sn-1`, pemetaan `m-1`) non-null dan `null` untuk sumber tanpa pemetaan; laporan deterministik (`toEqual` dua panggilan) dengan delapan temuan berurut menurut `CHECK_META`; `duplikasi.affectedEvents === sn-1.stats.duplicateEvents + conflictEvents`; `kasus_belum_selesai.status === "tidak_diketahui"`; `waktu_mulai_selesai` `tidak_berlaku` tanpa `timestamp_start` dan `ditemukan`/`bersih` dengan peran itu pada pemetaan sintetis; `label_belum_dipetakan` `ditemukan` pada seed (ada varian ejaan tak tercakup `m-1`) dan `bersih` pada pemetaan sintetis yang aturan labelnya mencakup semua varian; `di_luar_periode` ditemukan bila snapshot sintetis `timeFrom` sebelum `project.contractStart`, bersih bila di dalam; semua `examples` ≤ 5, nomor baris naik dan dalam `1..stats.rows`, teks bukan kosong; `percent` = `affectedEvents/totalEvents*100` satu desimal; aturan perbaikan aktif `kecualikan_event` untuk satu pemeriksaan mengurangi `eventsIncluded` sebesar dampaknya, aturan tidak aktif (`active:false`) diabaikan; verdict tiga cabang dengan fixture sintetis (siap, siap_catatan, belum_layak) dan pengecualian temuan tinggi membuat `belum_layak` turun; `buildCapabilities` lima baris berurut `waktu_mulai, sumber_daya, urutan, batas_proses, jumlah_kasus`: tanpa `resource` → `tidak_tersedia`, `casesIncluded` 99 → `tidak_tersedia` dan 100 → `tersedia`, urutan ambigu > 10% kasus → `terbatas` (fixture dengan hash yang menghasilkan itu atau fungsi uji internal), `batas_proses` selalu `terbatas`; `datasetHash` 12 heks, stabil, tak bergantung urutan `ruleIds`, berbeda bila id berbeda; `excludedAfter` memotong pada total. Review Focus: `rows` 0, 1, 5 tidak melempar dan tanpa NaN; contoh 0..5 baris.
- [ ] **Step 2: Run** `pnpm --filter web exec vitest run lib/mock/quality.test.ts` — FAIL.
- [ ] **Step 3: Implement** modul sesuai spec. Fraksi per pemeriksaan: `f = lo + (hi − lo) × ((hash(checksum + ":" + check) % 1000) / 1000)`. Kunci normalisasi label: huruf kecil, spasi dirapatkan, tanda baca `. , ;` di ujung dibuang (hapus tanda baca dulu lalu trim). Baris contoh: `1 + (hash(checksum+":"+check+":"+i) % rows)` untuk `i=0..4`, di-dedupe dan diurut naik; bila `rows < 1` kosong.
- [ ] **Step 4: Run** `pnpm --filter web test` — PASS; `tsc` bersih.
- [ ] **Step 5: Commit** `feat(web): M03b quality engine`.

### Task 3: Aksi reducer perbaikan dan penerbitan

**Files:**
- Modify: `apps/web/lib/mock/reducer.ts`
- Test: `apps/web/lib/mock/quality-reducer.test.ts` (baru)

**Interfaces:**
- Consumes: Task 1–2, `acceptsData`, `withAudit`, `ReduceResult`, helper gaya `mappingsForSource`/`latestMapping`.
- Produces: `MockAction` bertambah `{ type: "addRepairRule"; sourceId: string; check: CheckId; action: RepairAction; reason: string; confirmLarge?: boolean }`, `{ type: "revokeRepairRule"; ruleId: string }`, `{ type: "publishDataset"; sourceId: string; note?: string }`. `ReduceResult` bertambah `datasetId?: string; repairRuleId?: string`. Ekspor `repairRulesForSource(s: MockState, sourceId: string, onlyActive?: boolean): RepairRule[]` (terbaru dulu, seri sama menurut indeks terakhir), `datasetVersionsForSource(s: MockState, sourceId: string): DatasetVersion[]` (terbaru dulu), `latestDataset(s: MockState, sourceId: string): DatasetVersion | null`.

- [ ] **Step 1: Write failing tests** (satu `it` per baris, spesifikasi "Aturan reducer"): `addRepairRule` sukses menambah rekor + 1 audit `perbaikan.tambah` berlabel `"{judul} ({aksi})"`, dampak = `repairImpact`; setiap guard dengan pesan tepat dan `toBe(before)`: sumber tak dikenal, proyek tidak aktif (patch status), tanpa data siap ("Belum ada data yang siap dinilai"), alasan spasi saja ("Alasan wajib diisi"), temuan `bersih` ("Tidak ada masalah untuk ditangani"), aturan aktif ganda ("Sudah ada aturan perbaikan aktif untuk pemeriksaan ini"); konfirmasi 20%: gunakan fixture/patch snapshot sehingga pengecualian > 20% → galat tanpa `confirmLarge`, sukses dengan `confirmLarge: true`, tepat 20% tidak butuh; aksi `terima` berdampak 0 pada pengecualian; `revokeRepairRule` sukses (aktif false, `revokedBy/At`, 1 audit `perbaikan.cabut`), cabut ganda galat "Aturan sudah dicabut"; mencabut lalu menambah ulang untuk pemeriksaan yang sama berhasil dan hanya aturan baru yang dihitung di laporan; `publishDataset`: `v1` dengan `hash === datasetHash(...)`, `repairRuleIds` hanya aturan aktif, `capabilities` 5 baris, `eventsIncluded` sesuai laporan, 1 audit `dataset.terbit` berlabel `"{nama sumber} v1"`; penerbitan kedua tanpa perubahan → "Tidak ada perubahan dari v1" (`toBe`); setelah menambah/mencabut aturan → `v2` dengan hash berbeda; `belum_layak` ditolak dengan pesan "Data belum layak diterbitkan: …" (buat kondisi lewat patch snapshot/statistik atau aturan); proyek tidak aktif ditolak; id tak dikenal tidak melempar; `datasetVersionsForSource` terbaru dulu dengan tie-break indeks.
- [ ] **Step 2: Run** `pnpm --filter web exec vitest run lib/mock/quality-reducer.test.ts` — FAIL.
- [ ] **Step 3: Implement** aksi di `reduce` mengikuti urutan guard spec; `store.run` meneruskan `datasetId`/`repairRuleId` (periksa penyebaran `...rest`, ubah minimal bila perlu). Dampak pengecualian untuk batas 20%: `excludedAfter(report, activeRules, { check, events, cases })` dibandingkan `0.2 × totalEvents` (`>` memerlukan konfirmasi). `publishDataset` membandingkan hash dengan `latestDataset(...)?.hash`.
- [ ] **Step 4: Run** `pnpm --filter web test` — PASS; `tsc` bersih.
- [ ] **Step 5: Commit** `feat(web): M03b/c repair and publish reducer actions`.

### Task 4: Tab Kualitas

**Files:**
- Create: `apps/web/app/(app)/projects/[projectId]/sources/[sourceId]/quality/page.tsx`, `apps/web/components/project/quality-pills.tsx`, `apps/web/components/project/repair-dialog.tsx`
- Modify: `apps/web/components/project/source-tabs.tsx` (tab "Kualitas" dan "Dataset")

**Interfaces:**
- Consumes: Task 1–3, `useProject()`, `Card`, `Table`, `Pill`, `NoraModal`, `Banner`, `NotFoundPanel`, `SourceTabs`.
- Produces: `SeverityPill({ severity }: { severity: Severity })`; `FindingStatusPill({ status }: { status: QualityFinding["status"] })`; `VerdictPill({ verdict }: { verdict: QualityReport["verdict"] })` (Pill ikon+teks: siap `CheckCircle` hijau, siap_catatan `WarningCircle` kuning, belum_layak `XCircle` merah); `RepairDialog({ open, onClose, sourceId, finding, report }: {...})`.

- [ ] **Step 1:** Perluas `SourceTabs` dengan `/quality` dan `/dataset` (ikon `ShieldCheck`, `Stack`); jaga tab lama dan tipe `active` tetap valid.
- [ ] **Step 2:** Halaman `/quality` sesuai spec "Layar" 1: keadaan kosong (tanpa `qualityDataset`), header, kartu ringkasan (VerdictPill + `reasons` + "{eventsIncluded} dari {totalEvents} event disertakan"), tabel delapan temuan (judul, severity, status, event/kasus, persen; "Lihat contoh" membuka baris di bawah tabel/ekspansi dengan teks "Snapshot {nama file} · baris {n}: {teks}"; "Tangani" bila `ditemukan` & tanpa aturan aktif & `can("repair.edit", projectId) && acceptsData`), kartu "Antrean perbaikan" (aturan aktif dengan "Cabut", bagian "Dikecualikan", aturan dicabut redup). Penjelasan bila peran boleh tetapi proyek tidak aktif. Hooks (`useProject`, `useState`, `useMemo`) sebelum early return. `buildQualityReport` dengan `useMemo` atas `[state.snapshots, state.mappings, state.repairRules, sourceId]` (atau memanggil dari state langsung bila lebih sederhana).
- [ ] **Step 3:** `RepairDialog`: pilihan aksi (radio/Select: kecualikan event, kecualikan kasus, terima; opsi keempat "Ubah pemetaan" hanya tautan ke Pemetaan sumber dan menutup dialog), alasan (`TextArea`, wajib; galat di bidang setelah percobaan simpan), pratinjau dampak (`repairImpact` → "{n} event dan {m} kasus akan dikecualikan"; untuk `terima` "Tidak ada yang dikecualikan"), kotak konfirmasi "Saya mengerti aturan ini mengecualikan lebih dari 20% event" yang muncul bila `excludedAfter(...)` > 20% (pratinjau memakai fungsi yang sama dengan reducer), tombol "Simpan aturan" (hindari klik ganda), galat reducer di `Banner`. Sukses menutup dialog.
- [ ] **Step 4: Verify** `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web test`, `pnpm --filter web build` hijau (rute baru terdaftar). Di browser (dev server `cd apps/web && pnpm exec next dev -p 3107`; viewer Dimas): `/projects/p-p2p/sources/s-p2p-sap/quality` menampilkan delapan temuan; "Lihat contoh"; tangani temuan tinggi dengan "kecualikan event" + alasan → hasil dan "event disertakan" berubah, aturan muncul di antrean; "Cabut" mengembalikan; alasan kosong → galat bidang; konfirmasi 20% muncul pada kondisi yang dibuat; tiga peran (ubah `viewerId` sementara di `data.ts` ke `u-sari`/`u-rina`, pulihkan ke `u-dimas`, `git diff -- apps/web/lib/mock/data.ts` kosong); proyek `ditangguhkan` memperlihatkan penjelasan; lebar 1280px dan 1024px tanpa overflow halaman. Catat yang tidak terverifikasi; hentikan dev server.
- [ ] **Step 5: Commit** `feat(web): M03b quality tab`.

### Task 5: Tab Dataset

**Files:**
- Create: `apps/web/app/(app)/projects/[projectId]/sources/[sourceId]/dataset/page.tsx`, `apps/web/components/project/capability-list.tsx`

**Interfaces:**
- Consumes: Task 1–4, `publishDataset`, `datasetVersionsForSource`, `latestDataset`, `buildCapabilities`, `datasetHash`, `VerdictPill`, `NoraModal`.
- Produces: `CapabilityList({ items }: { items: Capability[] })` (daftar: label, Pill status tersedia/terbatas/tidak tersedia dengan ikon+teks, penjelasan sebagai teks).

- [ ] **Step 1:** Halaman `/dataset` sesuai spec "Layar" 2: keadaan kosong tanpa data siap; kartu "Terbitkan versi dataset" (VerdictPill, `eventsIncluded/casesIncluded`, `CapabilityList` pratinjau dari `buildCapabilities`), tombol "Terbitkan" hanya `can("dataset.publish", projectId) && acceptsData`; nonaktif dengan alasan terlihat ("Data belum layak diterbitkan" bila `belum_layak`, "Tidak ada perubahan dari v{n}" bila hash sama dengan versi terbaru); dialog konfirmasi (ringkasan, catatan opsional `TextArea`, tombol "Terbitkan", hindari klik ganda, galat reducer di `Banner`); penjelasan bila peran boleh tetapi proyek tidak aktif.
- [ ] **Step 2:** Tabel versi: v (tombol memilih versi, `aria-pressed`), tanggal `formatDateTime`, pembuat, snapshot (nama file terpotong + `title`), pemetaan v{n}, jumlah aturan perbaikan, hash 8 karakter (mono), `VerdictPill`, status "Terbaru" atau "Ada versi lama" (`Pill`). Versi terpilih (default terbaru) ditampilkan di bawah baca-saja: rujukan (snapshot, pemetaan, aturan perbaikan dengan alasan terpotong), `CapabilityList` dari `capabilities` tersimpan; catatan sebagai teks `whitespace-pre-wrap break-words`. Versi lama menampilkan catatan "Versi lama (hanya baca)".
- [ ] **Step 3: Verify** `tsc`, tes, `build` hijau. Di browser (port 3107, viewer Dimas): terbitkan `v1` (hash tampil, tabel memuat v1 "Terbaru"); terbitkan lagi tanpa perubahan → tombol nonaktif dengan alasan; kembali ke Kualitas, tambah aturan perbaikan, kembali ke Dataset, terbitkan → `v2`, `v1` berstatus "Ada versi lama" dan v2 hash berbeda; Audit log proyek menampilkan `dataset.terbit` dan `perbaikan.tambah`; pemilik proses (`u-sari`) dan administrator (`u-rina`) tidak punya tombol terbit; catatan berisi `<script>` tampil sebagai teks; 1280px dan 1024px tanpa overflow; pulihkan `viewerId` ke `u-dimas` (`git diff` data.ts kosong). Catat yang tidak terverifikasi; hentikan dev server.
- [ ] **Step 4: Commit** `feat(web): M03c dataset tab`.
