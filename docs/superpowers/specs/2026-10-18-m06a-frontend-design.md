# Spec: M06a frontend, Kepatuhan aturan dan SLA (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M06](../../prd/m06-monitoring-performa-kesesuaian-prd.md), Story 4, Story 9 (sebagian), Fitur 3. Dibangun di atas M04c frontend (`feat/m04c-frontend`): aturan berversi, label kanonis, lapisan tiruan `apps/web/lib/mock/`, komponen Untitled UI, token Nora. M06 dipecah: **M06a kepatuhan aturan/SLA (spec ini)**, M06b dashboard performa + backlog + perbandingan, M06c bottleneck + rework, M06d temuan + status perubahan, M06e replay BPMN. Tidak ada backend atau penyimpanan permanen. Branch `feat/m06a-frontend` dari `feat/m04c-frontend`.

## Tujuan

Analis menjalankan monitoring pada satu sumber data dan periode, lalu melihat seberapa luas ketidakpatuhan terhadap setiap aturan M04: jumlah dan persentase tiap status, tren per bulan, kasus per status beserta alasannya, dan asal-usul hasil sampai rujukan SOP.

**Berhasil bila:**

1. Proyek punya tab "Monitoring" dengan sub-navigasi "Kepatuhan"; daftar dan detail kepatuhan per aturan dapat dicapai lewat navigasi.
2. Analis dapat menjalankan monitoring; setiap run tercatat di audit log dan dapat dipilih kembali.
3. Hasil run tidak berubah ketika aturan diubah setelah run (versi aturan dibekukan pada run).
4. Istilah "Pelanggaran" hanya untuk aturan `disetujui`; selain itu "Tidak sesuai dengan acuan".
5. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Dashboard performa, backlog, perbandingan kelompok (M06b), bottleneck dan rework (M06c), objek temuan dan status baru/memburuk antar-run (M06d), replay BPMN (M06e), tanda "berisiko melewati SLA", kalender nyata (M04a), paket konteks (M04f), penelusuran kasus (M05), workspace investigasi (M11), backend, layar ponsel.

## Peran dan izin

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `monitoring.view` | ya | ya | ya |
| `monitoring.run` | tidak | ya | tidak |

`monitoring.run` hanya pada proyek `aktif` (`acceptsData`). Di status proyek lain tombol disembunyikan dengan penjelasan seperti M04c.

## Model data tiruan (`lib/mock/types.ts`)

```ts
type CaseStatus = "patuh" | "tidak_patuh" | "tidak_dapat_dievaluasi";

interface MonitoringRun {
  id: string; projectId: string;
  sourceId: string; snapshotId: string; mappingId: string;
  periodFrom: string; periodTo: string;   // YYYY-MM-DD, inklusif
  ruleVersionIds: string[];               // dibekukan saat run
  calendar: "bawaan_tiruan";              // Senin–Jumat, tanpa libur
  createdBy: string; createdAt: string;
}

interface MockCase { id: string; start: string; end: string | null } // end null = masih terbuka
interface CaseResult { caseId: string; start: string; status: CaseStatus; reason?: string; ruleVersionId: string | null }
```

`MockState` bertambah `runs: MonitoringRun[]`. Data awal: dua run untuk `p-p2p` pada sumber yang sudah dipetakan (periode berurutan, mis. Jan–Mar dan Apr–Jun 2018), proyek lain tanpa run. Seed memastikan aturan `disetujui` dan `ditinjau` M04c ikut dalam `ruleVersionIds`.

## Aturan murni (`lib/mock/compliance.ts`, baru, tanpa React)

- `mockCases(snapshot: Snapshot, periodFrom: string, periodTo: string): MockCase[]`: jumlah ≈ `round(stats.rows / 6)` untuk rentang data penuh, diskalakan ke periode; id `CASE-0001…`; `start` tersebar deterministik (hash `snapshot.checksum` + indeks) di dalam periode; ±10% kasus `end = null`. Snapshot tanpa `stats`: `[]`.
- `participatingVersions(state, projectId): RuleVersion[]`: untuk tiap `ruleKey`, versi terbaru berstatus `disetujui` atau `ditinjau`, ditambah versi lama yang pernah disetujui (`approvedAt` terisi, kini `usang`). Draf dan usang yang tak pernah disetujui dilewati.
- `applicableVersion(versions: RuleVersion[], caseStart: string): RuleVersion | null`: versi dengan `effectiveFrom ≤ caseStart` dan (`effectiveTo` kosong atau `≥ caseStart`); bila beberapa cocok, versi tertinggi. Tidak ada: `null` (kasus `tidak_dapat_dievaluasi`, alasan "Tidak ada versi aturan yang berlaku pada awal kasus").
- `evaluateCase(version: RuleVersion, c: MockCase, mapping: MappingVersion): CaseResult`, urutan pemeriksaan:
  1. Pemisahan tugas tanpa kolom berperan `resource`: "Kolom sumber daya belum dipetakan (M03)".
  2. Cakupan dengan atribut yang bukan kolom `case_attr`/`event_attr`: "Atribut {nama} belum dipetakan (M03)".
  3. SLA atau urutan pada kasus terbuka (`end = null`), deterministik untuk ±50% kasus terbuka: "Kasus belum mencapai {aktivitas B}".
  4. Selain itu `patuh`/`tidak_patuh` dari hash (`version.id` + `c.id`), proporsi tidak patuh 3%–45% per versi (hash `version.id`). SLA `kerja` memakai kalender bawaan tiruan.
- `evaluateRun(state, run: MonitoringRun, ruleKey: string): CaseResult[]`: kasus run × versi berlaku dari `run.ruleVersionIds` untuk `ruleKey` tersebut. Murni dan deterministik.
- `summarize(results: CaseResult[]): { total; patuh; tidakPatuh; tidakDapat; byMonth: { month: string; patuh; tidakPatuh; tidakDapat }[]; reasons: { reason: string; count: number }[] }`. Persentase dihitung di UI dari `total`.
- `termFor(version: RuleVersion): "Pelanggaran" | "Tidak sesuai dengan acuan"`.

## Aturan reducer (`lib/mock/reducer.ts`)

`runMonitoring { projectId; sourceId; periodFrom; periodTo }` (tidak melempar; galat berupa string):

- Proyek harus `aktif`; sumber milik proyek dan punya pemetaan serta snapshot `siap_dipetakan` (pemetaan terbaru dan snapshot terbaru dipakai); `periodFrom` dan `periodTo` tanggal valid dan `periodFrom ≤ periodTo`; `participatingVersions` tidak kosong ("Belum ada aturan disetujui atau ditinjau").
- Sukses: tambah `MonitoringRun` dengan `ruleVersionIds` dibekukan, satu `AuditEvent` `monitoring.jalankan` (objectType `Monitoring`, label "{sumber} {periodFrom}–{periodTo}"). Hasil `{ state, runId }`.

Helper terekspor: `runsForProject(s, projectId)` (terbaru dulu), `runnableSources(s, projectId)`.

## Layar

Semua di bawah `projects/[projectId]/monitoring/`. Tab proyek baru "Monitoring" (ikon `Pulse`, hitungan = jumlah run) di antara "Konteks" dan "Anggota", aktif untuk path yang diawali `/monitoring`. Komponen `MonitoringTabs` (sub-navigasi, saat ini hanya "Kepatuhan"). Bukan anggota: `NotFoundPanel`. Run terpilih lewat query `?run=`, bawaan run terbaru.

1. **`/monitoring/compliance`**: pemilih run ("{tanggal} · {sumber} · {periode}"); tombol "Jalankan monitoring" bila `can("monitoring.run")` dan `acceptsData`, membuka `NoraModal` (sumber dari `runnableSources`, periode dari/sampai, bawaan rentang data). Galat reducer di Banner. Tabel per aturan: nama (tautan ke detail dengan `?run=` sama), jenis, versi, status aturan (pil M04c), rujukan sumber (terpotong, `title`), patuh / ketidakpatuhan / tidak dapat dievaluasi (jumlah + %) dengan batang proporsi, sparkline % ketidakpatuhan per bulan. Label ketidakpatuhan per baris memakai `termFor`. Keadaan kosong: belum ada run (ajakan menjalankan) dan tidak ada aturan ikut (tautan ke Konteks › Aturan).
2. **`/monitoring/compliance/[ruleKey]`**: judul + kalimat bisnis aturan (helper M04c) + pil status; tiga kartu angka; grafik bar bertumpuk per bulan (Recharts); rincian alasan tidak dapat dievaluasi; tabel kasus (ID, tanggal mulai, status pil, alasan, versi aturan dipakai) dengan filter status dan 50 baris per halaman, ID dengan ikon tautan nonaktif + tooltip "Penelusuran kasus (M05) belum tersedia"; panel asal-usul dari run beku: sumber, snapshot (nama + checksum), versi pemetaan, paket konteks "Belum ada (M04f)", filter periode, "Kalender bawaan tiruan (M04a belum tersedia)", versi aturan dipakai beserta rujukan sumber (judul, bagian, kutipan sebagai teks) dan tautan ke detail aturan M04c, waktu run dan pembuat. `ruleKey` tidak ada di run: `NotFoundPanel`.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Pill/Card/Table/NoraModal/Banner yang ada; semua string data dirender sebagai teks.

## Chart

Tambah dependensi `recharts` (disebut PRD, dipakai lagi di M06b/M06c) untuk grafik detail. Sparkline di tabel: komponen SVG kecil sendiri, tanpa Recharts.

## Pengujian

- `compliance.test.ts`: `mockCases` deterministik dan semua `start` di dalam periode; `participatingVersions` (draf dilewati, usang yang pernah disetujui ikut); `applicableVersion` memilih versi sesuai tanggal mulai kasus dan `null` di luar masa berlaku; `evaluateCase` tiap alasan tidak dapat dievaluasi; jumlah tiga status = jumlah kasus; jumlah `byMonth` = total; `termFor`.
- `monitoring-reducer.test.ts`: run sukses + 1 audit; ditolak bila proyek tidak aktif, sumber tanpa pemetaan, periode terbalik/tidak valid, tidak ada aturan; id tak dikenal tidak melempar; mengubah aturan setelah run tidak mengubah `evaluateRun` run lama.
- `permissions.test.ts`: matriks `monitoring.*`.
- Verifikasi manual di browser (1280px dan 1024px), termasuk Pemilik proses dan Administrator.

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/compliance.ts` + `compliance.test.ts` + `monitoring-reducer.test.ts` (baru), `components/project/{monitoring-tabs,run-monitoring-modal,compliance-table,compliance-trend,provenance-panel,sparkline}.tsx` (baru), rute `monitoring/compliance/page.tsx` dan `monitoring/compliance/[ruleKey]/page.tsx` (baru), `[projectId]/layout.tsx` (tab "Monitoring"), `apps/web/package.json` (`recharts`).
