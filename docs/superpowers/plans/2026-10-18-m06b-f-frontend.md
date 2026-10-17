# M06b–M06f Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelesaikan sisa M06 (PRD Story 1–3, 5–9, Fitur 1, 4, 5) di atas M06a: dashboard performa + backlog + perbandingan (M06b), bottleneck + rework (M06c), temuan + status perubahan (M06d), replay BPMN (M06e), registri definisi metrik + pengaturan ambang + tanda "berisiko melewati SLA" (M06f).

**Architecture:** Lanjutan Approach A dari M06a. `MonitoringRun` menyimpan input beku, kini termasuk salinan `config` (ambang, definisi rework, model BPMN). Semua hasil dihitung fungsi murni deterministik saat halaman dibuka:
- Populasi kasus ringkas (`mockCases` dari `compliance.ts`, start/end tanggal, ribuan kasus) dipakai dashboard, backlog, perbandingan, kepatuhan.
- Log event (`buildEventLog` dari `eventlog.ts` M05a, ≤400 kasus, event berstempel waktu) dipakai bottleneck, rework, replay BPMN. Setiap bagian menampilkan populasinya sendiri ("dihitung dari N kasus …").
- Sub-tab baru di bawah tab proyek "Monitoring". Semua halaman memakai `?run=` yang sama.

**Tech Stack:** Next.js 16 app router, React 19, Tailwind v4 + Untitled UI, Phosphor, vitest, recharts (sudah terpasang), `@xyflow/react` (M05a).

**Spec:** PRD `docs/prd/m06-monitoring-performa-kesesuaian-prd.md` + spec M06a `docs/superpowers/specs/2026-10-18-m06a-frontend-design.md` (pembagian slice b–e). M06f didefinisikan di plan ini: sisa PRD yang tidak tercakup a–e. Semua path relatif ke `apps/web`. Branch `feat/m06-frontend` (sudah berisi M06a + merge M05a).

## Global Constraints

- Frontend saja: tanpa backend, penyimpanan permanen.
- Gating aksi lewat `can()` (`lib/mock/permissions.ts`). Aksi baru: `monitoring.configure` = `["analis"]`. `monitoring.view` sudah ada (semua anggota).
- Bahasa temuan (PRD): judul dari templat kode. Bottleneck selalu memakai kata "Indikasi". Tidak ada kata "penyebab" di teks temuan. "Pelanggaran" hanya untuk versi aturan `disetujui`, selain itu "Tidak sesuai dengan acuan" (pakai `termFor` dari `compliance.ts`). Selisih durasi rework dan perbandingan kelompok diberi keterangan persis: "Perbandingan deskriptif, bukan dampak kausal".
- Teks persis lain: "Model BPMN tiruan (konversi BPMN M04 belum tersedia)"; "Definisi rework sementara di pengaturan monitoring (pindah ke paket konteks M04f)"; "Status penyelesaian tidak diketahui" (proyek tanpa `process.endActivity`); "Sampel kecil"; "Berisiko melewati SLA"; tooltip M11 "Workspace investigasi (M11) belum tersedia"; tanpa model BPMN: "Kesesuaian alur hanya dinilai melalui aturan terstruktur".
- Determinisme: angka tiruan dari `hash` (`lib/mock/mapping.ts`); tanpa `Math.random`/`Date.now` di modul `lib/mock/*` baru.
- Run lama tidak berubah bila pengaturan diubah: run memakai `run.config` beku, bukan konfigurasi proyek terkini.
- UI: Bahasa Indonesia, ikon Phosphor, komponen Nora (`Card`, `Pill`, `Banner`, `NoraModal`), `Table` Untitled UI, `Tooltip`, `Button` (size `xs`/`sm`), token warna Nora, kontrol 32px, judul 20px. Nilai panjang terpotong dengan atribut `title`.
- Commit tanpa baris Co-Authored-By Claude / "Generated with Claude Code". Stage berkas per path; jangan `git add -A`.
- Setiap task: `pnpm --filter web exec vitest run` hijau dan `pnpm --filter web exec tsc --noEmit` bersih sebelum commit.

## Review Focus

1. Run dengan 0 kasus (periode di luar data) atau log event `null`: semua halaman menampilkan keadaan kosong tanpa NaN/Infinity/pembagian nol.
2. `?run=` tidak dikenal: halaman memakai run terbaru proyek; tidak pernah data proyek lain.
3. Hasil run lama stabil setelah `updateMonitoringConfig` (uji eksplisit).

## Data model bersama (dibuat Task 1, dipakai semua task)

```ts
// lib/mock/types.ts (tambahan)
export interface BpmnModel { name: string; activities: string[] } // model sekuensial tiruan
export interface MonitoringConfig {
  projectId: string; version: number;
  bottleneckTopN: number;        // bawaan 3
  bottleneckP90Days: number;     // bawaan 5
  reworkActivities: string[] | null; // null = definisi rework belum ditetapkan
  reworkHighPct: number;         // bawaan 15
  complianceHighPct: number;     // bawaan 10
  fitnessMin: number;            // bawaan 0.9 (0–1)
  backlogAgeDays: number;        // bawaan 30
  ageBuckets: number[];          // bawaan [7, 30, 90], naik ketat
  changePct: number;             // bawaan 20
  minCasesChange: number;        // bawaan 30
  minGroupCases: number;         // bawaan 100
  smallSampleCases: number;      // bawaan 30
  bpmnModel: BpmnModel | null;
  updatedBy: string | null; updatedAt: string | null;
}
// MonitoringRun mendapat field baru: config: MonitoringConfig (salinan beku)
// MockState mendapat field baru: monitoringConfigs: MonitoringConfig[]
// CaseResult mendapat field opsional: atRisk?: boolean (Task 7)
```

Seed `p-p2p`: `reworkActivities: ["Record Goods Receipt", "Record Invoice Receipt", "Clear Invoice"]`, `bpmnModel: { name: "P2P standar", activities: ["Create Purchase Order Item", "Record Goods Receipt", "Record Invoice Receipt", "Clear Invoice"] }`, sisanya bawaan, `version: 1`, `updatedBy: "u-dimas"`, `updatedAt: "2026-07-20T08:00:00Z"`. Proyek lain tidak punya entri; `configFor` mengembalikan bawaan dengan `reworkActivities: null`, `bpmnModel: null`, `version: 0`. `run-1` dan `run-2` memakai salinan config p2p.

---

### Task 1: Config monitoring, registri metrik, fungsi metrik ringkasan

**Files:** `lib/mock/types.ts`, `lib/mock/data.ts`, `lib/mock/reducer.ts`, `lib/mock/permissions.ts`, `lib/mock/permissions.test.ts`, `lib/mock/eventlog.ts` (ekspor `percentile` saja), baru `lib/mock/metrics.ts`, `lib/mock/metrics.test.ts`, baru/ubah `lib/mock/monitoring-reducer.test.ts`. Perbaiki semua tempat lain yang membuat objek `MonitoringRun`/`MockState` agar `tsc` bersih.

**Produces:** tipe di atas; `defaultConfig(projectId)`, `configFor(state, projectId)` (di `metrics.ts`); aksi reducer `updateMonitoringConfig`; `METRIC_DEFINITIONS`, `metricDef(id)`; `runCases`, `runSnapshot`, `summaryCards`, `trend`, `backlog`, `comparePeriods`, `compareGroups`, `groupAttributes`, `durationHistogram`.

- [ ] **Step 1: Tipe + seed.** Tambah tipe ke `types.ts` (field baru di baris terpisah). Seed `monitoringConfigs` dan `config` di `run-1`/`run-2` sesuai "Data model bersama".
- [ ] **Step 2: `runMonitoring`** menyalin `configFor(state, projectId)` (deep copy: array `reworkActivities`, `ageBuckets`, `bpmnModel.activities`) ke `run.config`.
- [ ] **Step 3: Aksi `{ type: "updateMonitoringConfig"; projectId: string; patch: Partial<Omit<MonitoringConfig, "projectId" | "version" | "updatedBy" | "updatedAt">> }`.** Validasi → `fail(...)` dengan pesan persis:
  - proyek tidak ada: "Proyek tidak ditemukan"; viewer bukan analis proyek itu (pakai pola peran yang dipakai reducer lain, atau `roleIn`): "Hanya analis yang dapat mengubah ambang"
  - bilangan bulat ≥1 untuk `bottleneckTopN`, `backlogAgeDays`, `minCasesChange`, `minGroupCases`, `smallSampleCases`; angka >0 untuk `bottleneckP90Days`: "Nilai ambang harus bilangan positif"
  - persen 0–100 (`reworkHighPct`, `complianceHighPct`, `changePct`): "Persentase harus 0–100"
  - `fitnessMin` 0–1: "Fitness minimum harus 0–1"
  - `ageBuckets` 1–5 bilangan bulat positif naik ketat: "Kelompok umur harus naik dan positif"
  - `reworkActivities` bukan null dan kosong: "Pilih minimal satu aktivitas rework"
  Sukses: config baru = gabungan config terkini + patch, `version + 1`, `updatedBy` viewer, `updatedAt: now()`; ganti/menambah entri di `monitoringConfigs`; audit `{ action: "monitoring.ambang.ubah", objectType: "Monitoring", objectLabel: "Ambang monitoring v{version}" }`.
- [ ] **Step 4: Izin** `monitoring.configure: ["analis"]` + baris di `permissions.test.ts`.
- [ ] **Step 5: `metrics.ts`.**
  - `METRIC_DEFINITIONS: MetricDefinition[]` dengan `{ id, name, description, formula, population, unit, version }`, `version: 1` semua, id persis: `kasus_dimulai`, `kasus_selesai`, `kasus_terbuka`, `durasi_median`, `durasi_p90`, `persen_rework`, `persen_kepatuhan`, `umur_terbuka`, `jeda_transisi`, `kontribusi_tunggu`, `fitness`, `cakupan_data`. Deskripsi bahasa bisnis singkat; `formula` teknis satu baris (mis. "median(end − start) atas kasus selesai, dalam hari"). `metricDef(id)` melempar error bila id tidak dikenal.
  - `runSnapshot(state, run)` → snapshot run atau null. `runCases(state, run)` → `mockCases(snapshot, run.periodFrom, run.periodTo)` atau `[]`.
  - Durasi kasus selesai = selisih hari `end − start` (bilangan bulat). Persentil pakai `percentile` dari `eventlog.ts` (ekspor fungsi yang sudah ada, tanpa mengubah perilaku).
  - `summaryCards(state, run)` → `{ started, finished, open, medianDays, p90Days, coveragePct }` dengan `started` = jumlah kasus, `finished` = `end !== null`, `coveragePct` = finished/started×100 (0 bila started 0), median/P90 `null` bila finished 0.
  - `trend(cases, grain: "minggu" | "bulan", smallSample: number)` → `{ bucket, started, finished, medianDays: number | null, small: boolean }[]` urut naik. Bucket bulan `YYYY-MM` dari `start`; bucket minggu = tanggal Senin (ISO, UTC) minggu `start`. `finished` = kasus bucket itu yang selesai; `medianDays` dari kasus selesai bucket itu; `small = started < smallSample`.
  - `backlog(state, run)` → `{ unknown: true } | { unknown: false; reference: string; open: number; buckets: { label: string; count: number }[]; lastActivities: { activity: string; count: number }[]; aged: number; caseIds: string[] }`. `unknown` bila `project.process.endActivity` kosong. `reference` = `snapshot.stats.timeTo` (tanggal event terakhir dataset; tampilkan sebagai acuan). Umur kasus terbuka = hari dari `start` ke `reference`. Label bucket untuk `[7, 30, 90]`: "0–7 hari", "8–30 hari", "31–90 hari", "> 90 hari" (umum: batas bawah = batas sebelumnya + 1). Aktivitas terakhir: `processActivities(snapshot, mapping)` tanpa `endActivity`; pilih indeks `hash(c.id + ":last") % n`; bila n = 0 → "Tidak diketahui". `aged` = jumlah terbuka dengan umur > `run.config.backlogAgeDays`. `caseIds` = id kasus terbuka urut umur turun.
  - `comparePeriods(state, run, a: {from, to}, b: {from, to})` dan `compareGroups(state, run, attribute)` → `{ groups: { label: string; cases: number; finished: number; medianDays: number | null; p90Days: number | null; comparable: boolean; histogram: { bin: string; count: number }[] }[] }`. `comparable = cases ≥ run.config.minGroupCases`. Periode memakai `mockCases(snapshot, from, to)` (tidak dibatasi periode run).
  - `groupAttributes(state, run)` → nama kolom pemetaan run dengan peran `resource`, `case_attr`, atau `event_attr`. Nilai kelompok = nilai unik `snapshot.columns[kolom].samples` (fallback `["(kosong)"]`). Kasus → nilai via bobot `[k, k-1, …, 1]` (k = jumlah nilai): `r = hash(c.id + ":" + attribute) % sum(bobot)`, ambil indeks pertama yang kumulatif bobotnya > r.
  - `durationHistogram(days: number[])` → bin tetap "0–5", "6–10", "11–15", "16–20", "21–25", "26–30", "> 30" hari.
- [ ] **Step 6: Tes** (`metrics.test.ts`, `monitoring-reducer.test.ts`): config freeze (ubah config setelah run → `run.config` tetap); setiap pesan validasi; audit tercatat; `summaryCards` dengan 0 kasus; `trend` bucket minggu Senin dan flag `small`; label bucket backlog; `unknown` pada proyek tanpa endActivity; bobot kelompok membuat setidaknya satu kelompok < 100 pada run-1 (atau uji `comparable` dengan ambang yang diatur); `metricDef` id tak dikenal melempar.
- [ ] **Step 7:** vitest + tsc hijau. Commit `feat(web): M06 monitoring config, metric registry and summary metrics`.

### Task 2: Bottleneck, rework, replay BPMN (fungsi murni)

**Files:** baru `lib/mock/bottleneck.ts`, `lib/mock/bottleneck.test.ts`, `lib/mock/replay.ts`, `lib/mock/replay.test.ts`.

**Consumes:** `buildEventLog`, `EventLog`, `LogCase`, `percentile`, `START_ID`/`END_ID` dari `eventlog.ts`; `MonitoringRun.config`.

- [ ] **Step 1: `runLog(state, run): EventLog | null`** → `buildEventLog(snapshot, mapping)` untuk snapshot/pemetaan run, lalu hanya kasus dengan `startMs` di `[periodFrom 00:00Z, periodTo 23:59:59.999Z]`. Memo per `run.id` (Map modul, sama pola `eventLogFor`).
- [ ] **Step 2: `bottlenecks(log, config)`** → `{ transitions: TransitionStat[]; totalCaseMs: number; cases: number }` dengan `TransitionStat = { id: "A→B", from, to, count, caseCount, medianMs, p90Ms, totalMs, sharePct, indicated }`. Hanya pasangan event berurutan dalam kasus (tanpa START/END). `totalCaseMs` = jumlah `durationMs` semua kasus; `sharePct = totalMs / totalCaseMs × 100` (0 bila total 0). Urut `totalMs` turun, seri pakai `id` naik. `indicated = rank < config.bottleneckTopN && p90Ms > config.bottleneckP90Days × 86_400_000`.
- [ ] **Step 3: `transitionCases(log, from, to)`** → `{ caseId, gapMs }[]` jeda terpanjang per kasus untuk transisi itu, urut `gapMs` turun.
- [ ] **Step 4: `reworkStats(log, config)`** → `null` bila `config.reworkActivities === null`; selain itu `{ cases: number; anyPct: number; caseIds: string[]; activities: { activity, pct, avgRepeats, medianWithMs: number | null, medianWithoutMs: number | null, diffMs: number | null, caseIds: string[] }[] }`. Kasus rework untuk aktivitas X = X muncul > 1 kali. `avgRepeats` = rata-rata (kemunculan − 1) di kasus rework X (0 bila tidak ada). Median durasi kasus dengan vs tanpa rework X; `diffMs = with − without` bila keduanya ada. `anyPct` = % kasus dengan rework pada salah satu aktivitas definisi. Urut `pct` turun.
- [ ] **Step 5: `replay.ts`.** Model = jaring Petri sekuensial dari `model.activities` (tempat p0…pk, transisi t_i: p_i → p_{i+1}).
  - `replayTrace(trace: string[], model: BpmnModel)` → `{ produced, consumed, missing, remaining, fitness, unknown: string[], perActivity: Record<string, { missing: number; remaining: number }> }`. Awal: 1 token di p0, `produced = 1`. Untuk aktivitas di model indeks i: `consumed++`; bila p_i > 0 kurangi, selain itu `missing++` dan `perActivity[a_i].missing++`; p_{i+1}++, `produced++`. Aktivitas di luar model: masuk `unknown`, tidak menyentuh token. Akhir: `consumed++`, ambil token dari p_k atau `missing++`. `remaining` = sisa token semua tempat; token sisa di p_i (i < k) dicatat ke `perActivity[a_i].remaining`. `fitness = 0.5 × (1 − missing/consumed) + 0.5 × (1 − remaining/produced)`.
  - `conformance(log, model)` → `{ fitness: number; fitCases: number; cases: number; variants: { trace: string[]; cases: number; fitness: number; caseIds: string[] }[]; activities: { activity: string; missing: number; remaining: number; cases: number }[]; unknownActivities: { activity: string; cases: number }[] }`. Replay per varian unik (urutan aktivitas sama), dibobot jumlah kasus. Fitness log = 0.5×(1 − Σmissing/Σconsumed) + 0.5×(1 − Σremaining/Σproduced) terbobot. `fitCases` = kasus fitness 1 dan tanpa `unknown`. Varian urut jumlah kasus turun; aktivitas urut (missing+remaining) turun, hanya yang > 0. `cases` 0 → fitness 1, daftar kosong.
- [ ] **Step 6: Tes.** Jejak sesuai model → fitness 1; lompat aktivitas tengah → missing>0; pengulangan (A,B,C,B,C,D) → missing 1, remaining 1; aktivitas asing → `unknown`; bottleneck: `sharePct` dan `indicated` pada log kecil buatan tangan; `transitionCases` urut; `reworkStats(…null)` → null; log 0 kasus aman (tanpa NaN). Pada run-2 seed: transisi "Record Goods Receipt→Record Invoice Receipt" peringkat 1 (bottleneck sengaja M05a).
- [ ] **Step 7:** vitest + tsc. Commit `feat(web): M06 bottleneck, rework and token replay`.

### Task 3: Temuan dan status perubahan (fungsi murni)

**Files:** baru `lib/mock/findings.ts`, `lib/mock/findings.test.ts`; boleh menyesuaikan nilai seed run di `data.ts` (bukan logika) untuk syarat demo Step 5.

**Consumes:** Task 1 (`runCases`, `backlog`, `trend`), Task 2 (`runLog`, `bottlenecks`, `transitionCases`, `reworkStats`, `conformance`), `evaluateRun`, `summarize`, `termFor` dari `compliance.ts`.

- [ ] **Step 1: Tipe.** `FindingKind = "bottleneck" | "rework" | "kepatuhan" | "penyimpangan_model" | "backlog" | "tren_memburuk"`; `ChangeStatus = "baru" | "memburuk" | "stabil" | "membaik" | "tidak_lagi_terdeteksi"`; `Severity = "rendah" | "sedang" | "tinggi"`; `Finding = { id, runId, kind, key, title, measure: number, threshold: number, higherIsWorse: boolean, unit: "hari" | "%" | "kasus" | "fitness", affectedCases, populationCases, severity, ruleVersionId?: string, supportingCaseIds: string[] /* maks 50 */, caseSource: "log_event" | "kasus" }`. `id = \`${run.id}:${kind}:${key}\``. Label UI: `FINDING_KIND_LABEL` ("Indikasi bottleneck", "Rework tinggi", "Ketidakpatuhan aturan/SLA", "Penyimpangan model", "Backlog menua", "Tren memburuk") dan `CHANGE_LABEL` ("Baru", "Memburuk", "Stabil", "Membaik", "Tidak lagi terdeteksi").
- [ ] **Step 2: `findingsFor(state, run): Finding[]`** (memo per run.id). Angka di judul format Indonesia (koma desimal, 1 desimal untuk hari/persen, 2 desimal fitness).
  - bottleneck (key = id transisi) untuk tiap `indicated`: "Indikasi bottleneck pada transisi {A} → {B}: P90 {p90} hari, {share}% total waktu tunggu". measure P90 hari, threshold `bottleneckP90Days`, populasi = kasus log, terdampak = `caseCount`, kasus pendukung = `transitionCases` urut jeda.
  - rework (key = aktivitas) untuk `pct ≥ reworkHighPct`: "Rework tinggi pada aktivitas {X}: {pct}% kasus mengulang".
  - kepatuhan (key = ruleKey) per ruleKey di `run.ruleVersions`: `rate = tidakPatuh / (patuh + tidakPatuh) × 100` bila penyebut > 0; temuan bila `rate ≥ complianceHighPct`: "{termFor(versi terbaru ruleKey di run)} aturan {nama}: {rate}% kasus tidak patuh". `ruleVersionId` = versi terbaru itu. caseSource "kasus".
  - penyimpangan_model (key "model") bila `bpmnModel` ada dan `fitness < fitnessMin`: "Penyimpangan dari model BPMN {nama}: fitness {f}". `higherIsWorse: false`, unit "fitness", terdampak = cases − fitCases.
  - backlog (key "backlog") bila `aged > 0`: "Backlog menua: {aged} kasus terbuka lebih dari {d} hari". measure = aged, unit "kasus", threshold = 0 untuk keparahan pakai rumus khusus di Step 3.
  - tren_memburuk (key "durasi") dari `trend(runCases, "bulan", smallSampleCases)`: bulan non-`small` pertama vs terakhir (berbeda), keduanya punya median; bila naik > `changePct` relatif: "Tren memburuk: median durasi kasus naik {x}% dari {bulan1} ke {bulan2}".
- [ ] **Step 3: Keparahan** (fungsi `severityOf` diekspor): `share = affected / population` (0 bila populasi 0); `ratio = higherIsWorse ? measure / threshold : threshold / measure` (threshold atau measure 0 → ratio 1); `score = share × min(ratio, 3)`; `tinggi` ≥ 0.5, `sedang` ≥ 0.15, selain itu `rendah`.
- [ ] **Step 4: `baselineFor(state, run)`** → run proyek sama, `sourceId` sama, `periodTo < run.periodFrom`, ambil `periodTo` terbesar (seri: `createdAt` terbaru); bila tidak ada → null. **`compareFindings(current, baseline: Finding[] | null, config)`** → `{ finding: Finding; status: ChangeStatus; baselineMeasure: number | null; smallSample: boolean }[]`: tanpa baseline (null) → semua `baru`; cocok per `kind:key`; tidak ada di baseline → `baru`; hanya di baseline → `tidak_lagi_terdeteksi` (finding = versi baseline); keduanya ada: `smallSample` bila populasi salah satu < `minCasesChange` → `stabil`; selain itu perubahan relatif `(cur − base)/|base| × 100` (base 0 → anggap +∞ bila cur > 0) dibanding `changePct` dengan arah `higherIsWorse` → `memburuk`/`membaik`/`stabil`. Urut: memburuk, baru, stabil, membaik, tidak_lagi_terdeteksi, lalu keparahan (tinggi dulu).
- [ ] **Step 5: Syarat demo (PRD MVP):** run-2 dengan baseline run-1 harus punya ≥1 temuan bottleneck, ≥1 kepatuhan, dan ≥1 berstatus `memburuk`. Bila tidak tercapai, ubah **nilai seed** (periode run-1, `complianceHighPct`, dll.) bukan logika, dan catat di laporan.
- [ ] **Step 6: Tes.** Tiap jenis temuan muncul pada data buatan/seed; judul tidak mengandung "penyebab"; kepatuhan memakai "Pelanggaran" hanya untuk versi disetujui (uji kedua cabang); `severityOf` batas 0.15/0.5; `compareFindings` kelima status + smallSample; `baselineFor` run-2 → run-1, run-1 → null; syarat demo Step 5.
- [ ] **Step 7:** vitest + tsc. Commit `feat(web): M06 findings with change status`.

### Task 4: Kerangka UI monitoring + Ringkasan (dashboard, backlog) + Perbandingan

**Files:** baru `components/project/run-picker.tsx`; ubah `components/project/monitoring-tabs.tsx`, `app/(app)/projects/[projectId]/monitoring/compliance/page.tsx` (pakai `RunPicker`), `app/(app)/projects/[projectId]/layout.tsx` (href tab Monitoring → `${base}/monitoring`, aktif untuk semua `/monitoring`); baru `app/(app)/projects/[projectId]/monitoring/page.tsx`, `.../monitoring/compare/page.tsx`, `components/project/metric-info.tsx`, `components/project/performance-trend.tsx`.

- [ ] **Step 1: `RunPicker`** — ekstrak dari halaman kepatuhan: pemilih run (`runLabel`), tombol "Jalankan monitoring" (gate `monitoring.run` + `acceptsData`), pesan proyek nonaktif, `RunMonitoringModal`. Props: `onRun?` tidak perlu; ia sendiri `router.replace(\`?run=${id}\`)`. Ekspor juga hook `useSelectedRun()` → `{ runs, run }` (run dari `?run=` milik proyek ini, fallback run terbaru — urutan sama dengan halaman kepatuhan saat ini). Halaman kepatuhan memakai keduanya tanpa perubahan perilaku.
- [ ] **Step 2: `MonitoringTabs`** urutan dan path: Ringkasan `/monitoring`, Temuan `/monitoring/findings`, Bottleneck & rework `/monitoring/bottleneck`, Kepatuhan `/monitoring/compliance`, Model BPMN `/monitoring/conformance`, Perbandingan `/monitoring/compare`, Definisi metrik `/monitoring/metrics`, Ambang `/monitoring/settings`. Tab yang halamannya belum ada pada task ini tetap dicantumkan (dibuat Task 5–7). Link mempertahankan `?run=` bila ada (kecuali Definisi metrik dan Ambang). `nav` bisa digulir horizontal (`overflow-x-auto`). Badge tab Temuan dibuat Task 6 (jangan tambahkan prop badge di Task ini).
- [ ] **Step 3: `MetricInfo`** — ikon `Info` Phosphor 14px dengan `Tooltip`: nama, deskripsi, "Rumus: {formula}", "Populasi: {population}", "Versi v{version}" dari `metricDef(id)`. Label aksesibel "Definisi {nama}".
- [ ] **Step 4: Halaman Ringkasan `/monitoring`.** Keadaan kosong sama dengan halaman kepatuhan bila belum ada run. Kartu (grid): Kasus dimulai, Kasus selesai, Kasus terbuka, Durasi median, Durasi P90, % kasus dengan rework (`reworkStats(runLog)` → `anyPct`; bila definisi null tampilkan "Belum ditetapkan" + link ke Ambang), Kepatuhan per aturan (daftar ringkas nama + % patuh dari `summarize(evaluateRun)`, link ke detail kepatuhan). Tiap kartu: `MetricInfo` dan baris populasi/cakupan, mis. "Dihitung dari 2.811 kasus selesai, 91% dari total · periode 2026-05-01–2026-07-31"; kartu rework: "Dari {n} kasus di log event". `PerformanceTrend` (Recharts): toggle "Bulanan"/"Mingguan", batang kasus dimulai/selesai + garis median durasi (sumbu kanan); bucket `small` diberi warna pudar dan tooltip "Sampel kecil"; legenda menyebut "Sampel kecil: < {smallSampleCases} kasus". Bagian **Backlog** di halaman yang sama: jumlah terbuka, teks acuan "Umur dihitung terhadap event terakhir dataset: {reference}", tabel/batang kelompok umur, daftar aktivitas terakhir; `unknown` → "Status penyelesaian tidak diketahui" + link ke Pengaturan proyek.
- [ ] **Step 5: Halaman Perbandingan `/monitoring/compare`.** Mode radio "Kelompok" / "Periode". Kelompok: select atribut dari `groupAttributes` (kosong → pesan "Belum ada atribut kelompok yang dipetakan (M03)"). Periode: dua pasang input tanggal, bawaan = paruh pertama dan kedua periode run. Tabel berdampingan: kelompok, kasus, selesai, median, P90, selisih median terhadap kelompok pertama yang `comparable`; kelompok tidak `comparable` diberi `Pill` "Di bawah {minGroupCases} kasus, tidak dibandingkan" dan selisih "—". Histogram durasi (Recharts, batang berkelompok per bin, hanya kelompok comparable). Keterangan persis "Perbandingan deskriptif, bukan dampak kausal".
- [ ] **Step 6:** vitest + tsc + `pnpm --filter web build` sukses. Commit `feat(web): M06b monitoring dashboard, backlog and comparison`.

### Task 5: Halaman Bottleneck & rework + Model BPMN + sorotan peta M05

**Files:** baru `app/(app)/projects/[projectId]/monitoring/bottleneck/page.tsx`, `.../monitoring/conformance/page.tsx`; ubah `app/(app)/projects/[projectId]/analysis/map/page.tsx` dan `components/project/process-map.tsx` (sorotan).

- [ ] **Step 1: Bottleneck & rework.** `RunPicker` + `MonitoringTabs`. Baris populasi "Dihitung dari {n} kasus di log event · periode …". Tabel transisi: "A → B", frekuensi, kasus, median, P90 (`formatDuration`), total jeda, % kontribusi (+ bar), `Pill` "Indikasi bottleneck" untuk `indicated`. Catatan "Waktu kerja per aktivitas tidak tersedia: waktu mulai tidak dipetakan" bila pemetaan run tidak punya `timestamp_start`. Klik baris → panel kasus pendukung (≤50, urut jeda terpanjang: id kasus, jeda) + link "Lihat di peta proses" ke `/analysis/map`. Teks bantu: "Indikasi berdasarkan kontribusi waktu tunggu; tidak menunjukkan penyebab." Bagian Rework: `reworkStats` null → kotak ajakan "Definisi rework belum ditetapkan" + tombol/link ke `/monitoring/settings` (bukan definisi tersembunyi); selain itu tabel aktivitas: % kasus, rata-rata pengulangan, median dengan/tanpa, selisih; keterangan persis "Perbandingan deskriptif, bukan dampak kausal" dan "Definisi rework sementara di pengaturan monitoring (pindah ke paket konteks M04f)". Log null → keadaan kosong "Log event belum tersedia untuk run ini".
- [ ] **Step 2: Model BPMN `/monitoring/conformance`.** `run.config.bpmnModel` null → Card "Kesesuaian alur hanya dinilai melalui aturan terstruktur" + link ke tab Kepatuhan. Selain itu: label "Model BPMN tiruan (konversi BPMN M04 belum tersedia)", nama model + urutan aktivitas (chip berpanah), kartu fitness keseluruhan (2 desimal, `MetricInfo` id `fitness`), kasus sesuai/total, keterangan "Replay token dijalankan per varian unik, dibobot jumlah kasus". Tabel varian (urutan aktivitas terpotong + `title`, kasus, fitness). Tabel aktivitas menyimpang (token hilang, token tersisa, kasus) + aktivitas di luar model. Tombol/link "Sorot di peta proses" → `/projects/{id}/analysis/map?highlight={encodeURIComponent(aktivitas dipisah koma)}`.
- [ ] **Step 3: Sorotan peta M05.** Halaman peta membaca `?highlight=` (bungkus `Suspense` bila perlu `useSearchParams`), meneruskan `Set<string>` ke `ProcessMap`; node yang disorot mendapat cincin/garis tepi warna peringatan (token Nora `status-suspended` atau setara) dan teks bantu di atas peta "Disorot dari Monitoring › Model BPMN: {daftar}" dengan tombol "Hapus sorotan". Tanpa param: perilaku M05a tidak berubah.
- [ ] **Step 4:** vitest + tsc + build. Commit `feat(web): M06c bottleneck and rework, M06e BPMN replay page`.

### Task 6: Halaman Temuan + detail + badge tab

**Files:** baru `app/(app)/projects/[projectId]/monitoring/findings/page.tsx`, `.../monitoring/findings/[findingId]/page.tsx`, `components/project/finding-badges.tsx`; ubah `monitoring-tabs.tsx` pemanggil (badge), `layout.tsx` (opsional: angka tab Monitoring tetap jumlah run), `provenance-panel.tsx` (generalisasi).

- [ ] **Step 1: Daftar.** `RunPicker` + pemilih pembanding: select "Bandingkan dengan" berisi run lain proyek ini + "Tanpa pembanding", bawaan `baselineFor` (`?baseline=` id atau `none`). Filter `Pill`/tombol status perubahan dan jenis. Tabel: judul (link detail), jenis, keparahan (`Pill` warna: tinggi merah, sedang kuning, rendah abu), status perubahan, ukuran sekarang vs pembanding, kasus terdampak/populasi. Keadaan kosong "Tidak ada temuan yang memenuhi ambang". Teks bantu "Temuan adalah hasil terukur, bukan diagnosis penyebab."
- [ ] **Step 2: Badge tab Temuan** = jumlah `baru` + `memburuk` untuk run terpilih vs baseline bawaan; ditampilkan di semua halaman monitoring lewat `MonitoringTabs` (hitung di `MonitoringTabs` sendiri dari run terpilih agar tiap halaman tidak menghitung ulang).
- [ ] **Step 3: Detail `/monitoring/findings/[findingId]`** (`findingId` di-`encodeURIComponent`). Tidak ditemukan / milik proyek lain → `NotFoundPanel`. Isi: judul, `Pill` jenis/keparahan/status, ukuran + ambang + pembanding, kasus terdampak/populasi, keterangan keparahan ("{share}% kasus terdampak × besaran penyimpangan {ratio}×"). Kasus pendukung (≤50) dalam `Table` dengan link "Buka di peta proses" (log_event) atau tooltip "Penelusuran kasus (M05) belum tersedia" (kasus). Tombol nonaktif "Tambah ke workspace investigasi" dengan tooltip "Workspace investigasi (M11) belum tersedia". Panel asal-usul: generalisasi `ProvenancePanel` dengan prop opsional `ruleKey` (hanya menampilkan versi aturan bila ada) + baris "Definisi rumus" (`metricDef` yang relevan: bottleneck→`jeda_transisi`, rework→`persen_rework`, kepatuhan→`persen_kepatuhan`, penyimpangan_model→`fitness`, backlog→`umur_terbuka`, tren_memburuk→`durasi_median`, ditampilkan "{nama} v{version}") + baris "Ambang" (`run.config` versi `v{version}`). Pemanggil lama `ProvenancePanel` tetap bekerja.
- [ ] **Step 4:** vitest + tsc + build. Commit `feat(web): M06d findings list, detail and badge`.

### Task 7: M06f — Definisi metrik, Ambang, berisiko melewati SLA

**Files:** baru `app/(app)/projects/[projectId]/monitoring/metrics/page.tsx`, `.../monitoring/settings/page.tsx`; ubah `lib/mock/compliance.ts`, `lib/mock/compliance.test.ts`, `lib/mock/types.ts` (`atRisk`), halaman detail kepatuhan `monitoring/compliance/[ruleKey]/page.tsx`.

- [ ] **Step 1: Definisi metrik.** Tabel `METRIC_DEFINITIONS`: nama, deskripsi bisnis, rumus, populasi, satuan, versi. Catatan "Definisi berversi; perubahan rumus membuat versi baru."
- [ ] **Step 2: Ambang.** Form dari `configFor(state, projectId)`: angka untuk semua ambang, input kelompok umur dipisah koma, checkbox aktivitas rework dari `processActivities` dataset proyek (`previewDataset` + `processActivities`; tanpa dataset → teks "Belum ada data untuk memilih aktivitas"), toggle "Tetapkan definisi rework" (mati → `reworkActivities: null`, kirim `null`). Model BPMN tampil read-only dengan label "Model BPMN tiruan (konversi BPMN M04 belum tersedia)" atau "Belum ada model BPMN". Simpan → `run({ type: "updateMonitoringConfig", … })`; error reducer di `Banner`; sukses → pesan "Ambang disimpan sebagai v{version}". Non-analis: semua input `disabled` + teks "Hanya analis yang dapat mengubah ambang". Teks: "Berlaku untuk run berikutnya; run lama memakai ambang yang dibekukan saat run." Info versi dan pengubah terakhir.
- [ ] **Step 3: Berisiko melewati SLA.** `evaluateCase` mendapat parameter opsional `refDate?: string` (YYYY-MM-DD). Untuk aturan `sla` dengan hasil "Kasus belum mencapai {B}": `atRisk = true` bila umur kasus (`start` → `refDate`) melebihi `limit` — `unit: "kalender"`: hari kalender; `unit: "kerja"`: hari Senin–Jumat (kalender bawaan tiruan) — selain itu tidak ada field. `evaluateRun` meneruskan `run.periodTo`. Status dan alasan tidak berubah (hasil run lama sama kecuali flag). Halaman detail kepatuhan: jumlah "Berisiko melewati SLA" di kartu/area alasan dan `Pill` "Berisiko melewati SLA" di baris kasus terkait; opsi filter "Berisiko melewati SLA".
- [ ] **Step 4: Tes.** atRisk kalender vs kerja (contoh hitung manual akhir pekan), tidak ada atRisk untuk non-SLA, status tidak berubah dibanding tanpa `refDate`.
- [ ] **Step 5:** vitest + tsc + build. Commit `feat(web): M06f metric registry, thresholds and SLA risk flag`.
