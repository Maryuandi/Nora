# M05b/c/d Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah varian, filter, daftar kasus, timeline kasus, pengelompokan objek, dan tampilan tersimpan pada modul Analisis, dengan data tiruan.

**Architecture:** Mesin murni baru `lib/mock/analysis.ts` di atas `eventlog.ts` (M05a). Status filter bersama lewat `AnalysisProvider` di `analysis/layout.tsx`. Tampilan tersimpan satu-satunya state tulis (reducer, izin, audit). Semua dihitung di klien.

**Tech Stack:** Next.js 16 App Router (baca `node_modules/next/dist/docs/` bila ragu, lihat `apps/web/AGENTS.md`), TypeScript, Tailwind v4, Untitled UI, Phosphor, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-18-m05bcd-frontend-design.md` (baca seluruhnya; plan ini tidak mengulang detailnya).

## Global Constraints

- Teks UI Bahasa Indonesia; ikon Phosphor; kontrol 32px; judul halaman 20px; pakai pola Card/Table/Pill/Banner/Modal/Button yang ada (tiru `analysis/map/page.tsx`, `quality/page.tsx`, `dataset/page.tsx`).
- Mesin murni: tanpa React, `Date.now()`, `Math.random()`; deterministik lewat `hash` dari `mapping.ts`.
- Angka M05a tidak boleh berubah: semua tes `eventlog.test.ts` dan `layout.test.ts` lama lulus tanpa diedit.
- Nilai dari data (label, ID, vendor, PO) dirender sebagai teks, tidak pernah `dangerouslySetInnerHTML`.
- Hooks dipanggil sebelum `return` dini. Tabel dengan nilai panjang: `truncate` + `title`, `min-w-0`.
- Jangan membunuh proses (`pkill`), jangan memakai port 3000; dev server di port 3108 bila perlu. Tidak ada trailer Co-Authored-By Claude di commit. Tidak push.
- Gate per tugas: `pnpm --filter web test`, `pnpm exec tsc --noEmit` (di `apps/web`), dan `pnpm --filter web build` setelah tugas UI.

## Review Focus

- Log kosong atau 0 kasus setelah filter: varian, objek, peta, daftar kasus tidak NaN/crash, menampilkan keadaan kosong.
- Filter tak valid (tanggal mulai > akhir, durasi negatif/NaN, `minDays > maxDays`): `validateFilter` menolak; UI tidak menerapkan.
- ID kasus, PO, atau varian tidak ada di URL: `NotFoundPanel`, bukan crash.
- Nilai berbahaya pada vendor/PO (`<img onerror>`, string sangat panjang) tetap teks, terpotong.
- Atribut tidak tersedia (pemetaan tanpa `case_attr`): kontrol nonaktif dengan penjelasan, objek menampilkan kartu penjelasan.
- Pemilik proses tidak melihat tombol simpan; proyek nonaktif menonaktifkan simpan; reducer menolak keduanya.

---

### Task 1: Mesin analisis (murni) dan perluasan event log

**Files:**
- Modify: `apps/web/lib/mock/eventlog.ts`, `apps/web/lib/mock/eventlog.test.ts`
- Create: `apps/web/lib/mock/analysis.ts`, `apps/web/lib/mock/analysis.test.ts`
- Modify (bila perlu): `apps/web/lib/mock/data.ts` (seed pemetaan p-p2p memuat kolom `case_attr`; jangan memecah tes M02/M03)

**Interfaces:**
- Consumes: `buildEventLog`, `buildDfg`, `eventLogFor`, `percentile`, `casesForNode/Edge`, `hash` (mapping.ts), `previewDataset` (rules.ts).
- Produces (nama persis, semua diekspor):
  - eventlog.ts: `LogEvent` + `rowRef: number`, `flag?: "kualitas" | "dikecualikan" | "ambigu"`; `LogCase` + `attrs: { vendor: string }`, `objects: { po: string }`, `complete: boolean`; `EventLogResult` + `attrsAvailable: boolean`, `snapshot: Snapshot`, `mapping: MappingVersion`.
  - analysis.ts: `interface Variant`, `interface FilterSpec`, `interface ObjectGroup { id: string; caseIds: string[]; caseCount: number; fromMs: number; toMs: number; variantIds: string[] }`, `buildVariants(log): Variant[]`, `variantIdOf(sequence: string[]): string`, `variantsTo80(variants: Variant[]): number`, `applyFilter(log: EventLog, spec: FilterSpec): EventLog`, `validateFilter(spec): string[]` (pesan galat Indonesia, kosong bila valid), `describeFilter(spec): string[]`, `isEmptyFilter(spec): boolean`, `normalizeFilter(spec): FilterSpec`, `objectGroups(log): ObjectGroup[]`, `groupCases(log, po): LogCase[]`, `caseById(log, id): LogCase | undefined`, `provenance(snapshot, mapping, event): { fileName: string; rowRef: number; mappingVersion: number }`, `filteredLogFor(state, projectId, spec): FilteredResult | null` dengan `FilteredResult = { full: EventLog; filtered: EventLog; dfg: Dfg; variants: Variant[]; sourceLabel: string; mappingVersion: number; hasStartTime: boolean; attrsAvailable: boolean; snapshot: Snapshot; mapping: MappingVersion }`, `VENDORS: readonly string[]` (5 nama).

- [ ] **Step 1: Tulis tes yang gagal.** `eventlog.test.ts` tambahan: atribut deterministik (dua kali bangun sama); `po` dibagi 2–4 kasus pada log seed; `rowRef` di 2..`stats.rows`+1; `flag` ≤ ~8% event dan `ambigu` hanya pada event yang waktunya sama dengan event sebelumnya; `complete` benar; tes lama tak berubah. `analysis.test.ts`: `buildVariants` (urut, persen, `cumPct` akhir = 100, ID stabil, jumlah `caseCount` = jumlah kasus, log kosong → `[]`), `variantsTo80`, `applyFilter` tiap kondisi (tanggal inklusif, `by` mulai/akhir/event, durasi, `minDays > maxDays` → 0 kasus, array kosong tidak memfilter, kombinasi AND, filter kosong → kasus identik), `validateFilter` (tanggal terbalik, durasi negatif/NaN), `describeFilter`/`normalizeFilter` (urutan array stabil), `objectGroups`/`groupCases`, `filteredLogFor` (memoisasi: referensi hasil sama untuk filter setara; filter kosong: `dfg` sama dengan `buildDfg(full)`), invarian konsistensi pada log seed dengan filter vendor: jumlah `caseCount` varian = `filtered.cases.length` dan `casesForNode(filtered, n).length === node.caseCount` untuk semua simpul.
- [ ] **Step 2: Jalankan, pastikan gagal.** `pnpm --filter web test eventlog analysis`.
- [ ] **Step 3: Implementasi.** Atribut baru memakai seed hash terpisah (`${checksum}:${i}:vendor|po|flag`) agar tidak menggeser pengundian lama; `po` = `PO-45000${nn}` dari `Math.floor(i / k)` dengan `k` 2–4 dari hash kelompok. `eventLogFor` mengisi `attrsAvailable` (mapping punya kolom berperan `case_attr`), `snapshot`, `mapping`. Memoisasi `filteredLogFor` dengan `Map` kunci `snapshot.id:mapping.id:JSON.stringify(normalizeFilter(spec))`.
- [ ] **Step 4: Jalankan semua tes + tsc.** Expected: lulus (tes M05a tak berubah).
- [ ] **Step 5: Commit** `feat(web): M05b engine, variants, filters, objects`.

### Task 2: Filter bersama, bilah filter, integrasi peta

**Files:**
- Create: `apps/web/components/project/analysis-filter.tsx` (`AnalysisProvider`, `useAnalysis()` → `{ filter, setFilter, resetFilter, mode, setMode, selection, setSelection, activityPct?, transitionPct? }` sesuai kebutuhan M05a), `apps/web/components/project/filter-bar.tsx`, `apps/web/app/(app)/projects/[projectId]/analysis/layout.tsx`
- Modify: `components/project/analysis-tabs.tsx` (5 tab: Peta proses `/analysis/map`, Varian `/analysis/variants`, Kasus `/analysis/cases`, Objek `/analysis/objects`, Tampilan tersimpan `/analysis/views`; ingat pelajaran underline: tanpa `overflow-x-auto`), `analysis/map/page.tsx`, `components/project/process-map.tsx`, `components/project/case-panel.tsx`

**Interfaces:**
- Consumes: Task 1 `filteredLogFor`, `validateFilter`, `describeFilter`, `isEmptyFilter`, `VENDORS`, `FilterSpec`.
- Produces: `useAnalysis()` seperti di atas (state sheet: `mode: "frekuensi" | "performa"`, `selection: { kind: "node" | "edge" | "variant"; id: string } | null`, slider persen dipindah ke provider agar dapat disimpan di Task 6); `FilterBar` props `{ attrsAvailable: boolean; activities: string[] }`; keadaan kosong komponen `EmptyFilterResult`.

- [ ] **Step 1: Tes** komponen murni jika ada helper (mis. bentuk `FilterSpec` dari nilai form → `buildFilterFromForm(form)` di `filter-bar` atau file pembantu, diuji); selebihnya verifikasi lewat build dan browser.
- [ ] **Step 2: Implementasi** `AnalysisProvider` di `analysis/layout.tsx` (client; layout tetap menjaga guard non-anggota seperti halaman peta). `FilterBar` sesuai spec §M05b-1 (panel lipat, chip aktif, "Terapkan"/"Atur ulang", validasi inline lewat `validateFilter`, atribut nonaktif dengan penjelasan). Peta: pakai `filteredLogFor`; tata letak dari DFG tanpa filter (`layoutDfg(unfilteredDfg)`), simpul tanpa kasus pada filter disembunyikan dan dihitung "disembunyikan"; header filter aktif + cakupan "{n} kasus ({pct}% dari data)"; 0 kasus → kartu kosong dengan saran dan tombol "Atur ulang filter". Panel kasus M05a memakai log terfilter; tautan "Buka timeline" dibiarkan nonaktif sampai Task 4.
- [ ] **Step 3: Verifikasi** test, tsc, `pnpm --filter web build`; angka peta tanpa filter identik dengan sebelum (cek di browser pada `/projects/p-p2p/analysis/map`, port 3108).
- [ ] **Step 4: Commit** `feat(web): M05b filter bar and filtered process map`.

### Task 3: Halaman Varian dan Kasus (M05b)

**Files:**
- Create: `components/project/variant-table.tsx`, `components/project/case-table.tsx`, `analysis/variants/page.tsx`, `analysis/cases/page.tsx`

**Interfaces:**
- Consumes: `useAnalysis`, `filteredLogFor`, `buildVariants`, `variantsTo80`, `sortCases`, `pageOf`, `casesForNode/Edge`, `formatDuration`.
- Produces: `VariantTable` props `{ variants: Variant[]; selected: string[]; onToggle(id): void }`, `CaseTable` props `{ cases: LogCase[]; base: string; variantOf(c: LogCase): string; size?: number }` (tautan timeline ke `${base}/analysis/cases/${c.id}`, PO ke `${base}/analysis/objects/${encodeURIComponent(po)}`; nilai kasus dirender sebagai teks).

- [ ] **Step 1: Tes** untuk pembantu murni yang muncul (mis. `casesForSelection(filtered, selection)` di `analysis.ts` dengan tes: kasus untuk `selection` node/edge/variant jumlahnya sama dengan angka elemen). Tambahkan fungsi itu ke `analysis.ts` dan `analysis.test.ts`.
- [ ] **Step 2: Implementasi** halaman sesuai spec §M05b-3 dan §M05b-4 (ringkasan 80%, paginasi 100 hanya bila > 100, penanda ambigu, "Terapkan varian terpilih sebagai filter", "Lihat kasus", chip "Dipersempit ke" dengan jumlah sama dengan elemen, urutan dan paginasi 20/halaman).
- [ ] **Step 3: Verifikasi** test, tsc, build; manual: pilih varian → peta berubah, jumlah konsisten.
- [ ] **Step 4: Commit** `feat(web): M05b variants and cases pages`.

### Task 4: Timeline kasus (M05c)

**Files:**
- Create: `components/project/case-timeline.tsx`, `analysis/cases/[caseId]/page.tsx`
- Modify: `components/project/case-panel.tsx` (tautan "Buka timeline" aktif)

**Interfaces:**
- Consumes: `caseById`, `provenance`, `filteredLogFor` (`full` untuk pencarian kasus, `filtered` untuk prev/next), `formatDateTime` (zona waktu pemetaan; baca `lib/mock/format.ts` untuk pembantu yang ada, tambah di `lib/format.ts` hanya bila perlu), `formatDuration`.
- Produces: `CaseTimeline` props `{ kase: LogCase; snapshot; mapping; hasStartTime: boolean; base: string }`.

- [ ] **Step 1: Tes** `provenance` sudah di Task 1; tambah tes pembantu jeda per event (`eventGaps(kase): (number | null)[]`, di `analysis.ts`: elemen pertama null, lainnya selisih ms, nilai tidak negatif).
- [ ] **Step 2: Implementasi** sesuai spec §M05c-5/6: header (ID, vendor, PO tautan ke objek, mulai, durasi, status, varian), daftar event dengan label kanonis/asli, waktu, sumber daya, jeda ("jeda antar-event selesai" bila `!hasStartTime`), Pill penanda `flag`, disclosure per event (`aria-expanded`) untuk asal-usul, vendor tautan ke Kasus dengan filter vendor itu (set `filter.vendors` lalu navigasi), prev/next dan kembali. ID tak ditemukan → `NotFoundPanel`.
- [ ] **Step 3: Verifikasi** test, tsc, build; manual: peta → panel → timeline → objek.
- [ ] **Step 4: Commit** `feat(web): M05c case timeline with event provenance`.

### Task 5: Pengelompokan objek (M05d)

**Files:**
- Create: `components/project/object-table.tsx`, `analysis/objects/page.tsx`, `analysis/objects/[objectId]/page.tsx`

**Interfaces:**
- Consumes: `objectGroups`, `groupCases`, `filteredLogFor`, `CaseTable`.
- Produces: `mergedTimeline(cases: LogCase[]): { caseId: string; event: LogEvent; index: number }[]` di `analysis.ts` (urut waktu, seri diurutkan `caseId` lalu `index`), diuji (jumlah baris = jumlah event semua kasus; urutan waktu naik; deterministik).

- [ ] **Step 1: Tes** `mergedTimeline` di `analysis.test.ts`.
- [ ] **Step 2: Implementasi** sesuai spec §M05d-7/8: Banner "Pengelompokan atribut ...", tabel objek (kasus, rentang, jumlah dan ID varian, "Buka"), kartu penjelasan bila `!attrsAvailable`; detail objek dengan timeline gabungan, palet warna tetap per kasus dengan ID kasus tertulis, tiap baris tautan ke timeline kasus. `objectId` dari URL di-`decodeURIComponent` dengan try/catch; tidak ditemukan → `NotFoundPanel`.
- [ ] **Step 3: Verifikasi** test, tsc, build.
- [ ] **Step 4: Commit** `feat(web): M05d object grouping`.

### Task 6: Tampilan tersimpan

**Files:**
- Modify: `lib/mock/types.ts` (`SavedView`, `MockState.savedViews`), `lib/mock/data.ts` (seed `savedViews: []`), `lib/mock/permissions.ts` (`"view.save"`: administrator, analis) dan `permissions.test.ts`, `lib/mock/reducer.ts` (`saveView`, `ReduceResult.savedViewId`) dan `reducer.test.ts`
- Create: `components/project/saved-view-dialog.tsx`, `analysis/views/page.tsx`
- Modify: halaman Peta dan Kasus (tombol "Simpan tampilan")

**Interfaces:**
- Consumes: `useAnalysis`, `validateFilter`, `eventLogFor`, `acceptsData`, `viewerRole`, `withAudit`, `Modal` dari `components/nora/modal`.
- Produces: `SavedView = { id; projectId; name; note?; filter: FilterSpec; mode; selection; activityPct; transitionPct; sourceId; snapshotId; mappingVersion; createdBy; createdAt }`; aksi `{ type: "saveView"; projectId; name; note?; filter; mode; selection; activityPct; transitionPct }`; `useAnalysis().load(view: SavedView)` memulihkan semua status.

- [ ] **Step 1: Tes yang gagal.** Reducer `saveView`: sukses (satu entri audit `tampilan.simpan`, `savedViewId`, tampilan tersimpan memuat sourceId/snapshotId/mappingVersion saat ini); urutan guard dengan pesan: proyek tidak ditemukan; "Proyek ini tidak menerima perubahan"; "Belum ada data yang siap dinilai"; "Peranmu tidak dapat menyimpan tampilan"; "Nama wajib diisi" (nama dipangkas); "Nama terlalu panjang" (> 80); "Catatan terlalu panjang" (> 500); pesan pertama dari `validateFilter`; semua kegagalan mengembalikan state yang sama referensinya. Izin `view.save` per peran.
- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasi** reducer, tipe, izin, seed, `saveView` di `store.run` mengembalikan `savedViewId` (periksa `...rest`). Dialog: nama, catatan, tampilkan galat reducer inline, tutup saat sukses. Tombol: sembunyi bagi `pemilik_proses`, nonaktif dengan alasan pada proyek nonaktif (pola `quality/page.tsx`). Halaman `views`: tabel (nama, pembuat, tanggal, ringkasan filter dari `describeFilter`, catatan terpotong), "Buka" → `load` lalu navigasi ke Peta; peringatan bila `snapshotId`/`mappingVersion` berbeda dari data kini; kosong "Belum ada tampilan tersimpan".
- [ ] **Step 4: Verifikasi** test, tsc, build.
- [ ] **Step 5: Commit** `feat(web): M05 saved views`.

### Task 7: Verifikasi browser dan tinjauan akhir

- [ ] **Step 1:** `pnpm --filter web test`, `pnpm exec tsc --noEmit`, `pnpm --filter web build` hijau.
- [ ] **Step 2:** Dev server port 3108; periksa 1280px dan 1024px (tanpa gulir horizontal halaman) tiga peran dan proyek tanpa data: filter → peta/varian/kasus; kasus → timeline → objek; simpan dan buka tampilan; keadaan kosong.
- [ ] **Step 3:** Perbaiki temuan; commit `fix(web): M05b/c/d polish`.
