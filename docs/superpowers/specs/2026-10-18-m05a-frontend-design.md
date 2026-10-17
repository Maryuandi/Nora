# Spec: M05a frontend, Peta proses (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M05](../../prd/m05-peta-proses-penelusuran-kasus-prd.md), Story 1, 2, dan 5 (sebagian), Fitur 1–2. Dibangun di atas M04c frontend (`feat/m04c-frontend`; M05a tidak memakai aturan M04, tetapi memakai snapshot dan pemetaan M02/M03a di cabang yang sama). M05 dipecah: **M05a peta proses (spec ini)**, M05b varian dan filter, M05c timeline kasus dan asal-usul event, M05d pengelompokan objek dan tampilan tersimpan. Tidak ada backend atau worker; peta dihitung di klien dari event log tiruan.

## Tujuan

Analis atau pemilik proses melihat alur proses aktual sebagai peta (directly-follows graph) dengan mode frekuensi dan performa, menyederhanakannya dengan dua slider, lalu mengklik simpul atau transisi untuk membuka daftar kasus pendukungnya dengan **jumlah yang persis sama** dengan angka di peta.

**Berhasil bila:**

1. Proyek punya tab "Analisis" dengan halaman "Peta proses" yang menampilkan peta, legenda, header cakupan, mode, dan slider.
2. Slider mengubah peta tanpa mengubah posisi simpul; jumlah elemen yang disembunyikan selalu tampil.
3. Klik simpul atau transisi membuka panel kasus dengan jumlah sama persis dengan angka elemen itu (diuji otomatis).
4. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Varian dan filter (M05b), timeline kasus dan asal-usul event (M05c), pengelompokan objek dan tampilan tersimpan (M05d), batas proses dari paket konteks M04 (memakai awal/akhir teramati), versi dataset M03c, perbandingan dua peta, ekspor gambar, animasi token, peta object-centric, backend.

## Dependensi baru (disetujui desainer, 18 Okt 2026)

`@xyflow/react` (React Flow) untuk menggambar peta dan `@dagrejs/dagre` untuk tata letak kiri ke kanan. Keduanya ditambahkan di Task 1 rencana dan dikunci versinya di `apps/web/package.json`.

## Peran dan izin

`analysis.view` untuk ketiga peran. Tidak ada aksi tulis di M05a (menjalankan analisis sungguhan dan tampilan tersimpan di bagian lain), jadi tidak ada entri audit baru. Peta dapat dilihat pada proyek berstatus apa pun.

## Mesin event log tiruan (`lib/mock/eventlog.ts`, baru, murni)

Menghasilkan satu event log deterministik dari snapshot dan pemetaan, dipakai bersama oleh peta, panel kasus, dan (nanti) varian serta timeline.

```ts
interface LogEvent { activity: string; activityRaw: string; time: string /* ISO UTC */; resource: string }
interface LogCase { id: string; events: LogEvent[]; startMs: number; endMs: number; durationMs: number }
interface EventLog { cases: LogCase[]; activities: string[]; source: { sourceId: string; snapshotId: string; mappingVersion: number } }
```

- `processActivities(snapshot, mapping): string[]`: label kanonis aktivitas proses, urutan kemunculan tahap (urutan nilai aktivitas pada `snapshot.preview`), dengan aturan label pemetaan diterapkan (dikecualikan dibuang, di-rename memakai kanonis). Label yang hanya berbeda huruf besar-kecil, spasi ganda, atau tanda baca ujung digabung menjadi satu (kunci normalisasi; tampilan memakai varian paling sering). Maksimum 8 aktivitas.
- `buildEventLog(snapshot, mapping): EventLog | null`: `null` bila aktivitas kurang dari 2. Jumlah kasus = `min(Math.round(stats.rows / 6), 400)`. Setiap kasus memilih satu pola jalur dari himpunan templat berbobot (indeks atas `activities`): jalur utama berurutan (≈55%), satu aktivitas diulang (rework, ≈15%), dua aktivitas bertukar urutan (≈10%), satu tahap tengah dilewati (≈10%), siklus kembali ke tahap awal (≈10%). Pilihan pola dan jeda waktu ditentukan oleh hash FNV dari `snapshot.checksum` + indeks kasus (deterministik, tanpa `Math.random`). Waktu mulai kasus tersebar dalam `stats.timeFrom`–`stats.timeTo`; jeda antar-event antara 1 jam dan 6 hari, dengan satu transisi sengaja lebih lambat (bottleneck) agar mode performa bermakna. `id` kasus berbentuk `C-0001`.
- `buildDfg(log: EventLog): Dfg` dengan
  ```ts
  interface DfgNode { id: string /* aktivitas, atau "__start" / "__end" */; label: string; caseCount: number; eventCount: number }
  interface DfgEdge { id: string; from: string; to: string; count: number; caseCount: number; medianMs: number; p90Ms: number }
  interface Dfg { nodes: DfgNode[]; edges: DfgEdge[]; totalCases: number }
  ```
  Simpul `__start` dihubungkan ke aktivitas pertama tiap kasus dan aktivitas terakhir ke `__end` (awal/akhir teramati). `count` = jumlah pasangan event berurutan; `caseCount` = jumlah kasus unik yang memuat transisi itu; `medianMs`/`p90Ms` dari jeda antar-event (persentil dengan interpolasi linear). Transisi A→A (loop) dan dua arah dipertahankan sebagai tepi terpisah.
- `simplify(dfg: Dfg, opts: { activityPct: number; transitionPct: number }): { nodes: DfgNode[]; edges: DfgEdge[]; hiddenActivities: number; hiddenTransitions: number }`: `activityPct` dan `transitionPct` 1 sampai 100. Mempertahankan `ceil(activityPct% × jumlah aktivitas)` aktivitas dengan `eventCount` tertinggi (simpul awal/akhir selalu dipertahankan); transisi dipertahankan bila kedua ujungnya terlihat dan termasuk `ceil(transitionPct% × jumlah tepi)` tepi dengan `count` tertinggi. Pilihan awal: bila aktivitas > 30, `activityPct` = nilai yang menyisakan sekitar 30; selain itu 100. `transitionPct` awal 100.
- `casesForNode(log, activity)` dan `casesForEdge(log, from, to)`: kasus unik yang memuat aktivitas/transisi itu (`__start`/`__end` = semua kasus). **Invarian yang diuji:** `casesForNode(a).length === node.caseCount`; `casesForEdge(a, b).length === edge.caseCount`; jumlah `edge.count` seluruhnya = jumlah pasangan event berurutan di log + jumlah kasus × 2 (tepi awal dan akhir); jumlah kasus per elemen ≤ `totalCases`.
- `sortCases(cases, by: "durasi" | "event" | "mulai", dir)` dan halaman (`pageOf(cases, page, size)`).
- `eventLogFor(state, projectId)`: memakai `previewDataset(state, projectId)` (sumber pertama berpemetaan) dan mengembalikan `{ log, dfg, sourceLabel, mappingVersion, hasStartTime } | null`; `hasStartTime` = pemetaan memuat peran `timestamp_start`. Hasil dimemoisasi per `(snapshot.id, mapping.id)` di modul (cache `Map`).

## Tata letak (`lib/mock/layout.ts`, murni di atas dagre)

`layoutDfg(dfg): Record<string, { x: number; y: number }>` dihitung **sekali dari DFG lengkap** (arah kiri ke kanan, `ranksep` 90, `nodesep` 40, simpul 180×56 px; `__start`/`__end` 56×56) dan tidak dihitung ulang saat slider berubah, sehingga posisi stabil. Diuji: posisi deterministik, semua simpul punya posisi, tidak ada dua simpul tumpang tindih.

## Layar

`projects/[projectId]/analysis/map/page.tsx`, dalam tab proyek baru "Analisis" (ikon `FlowArrow`; hitungan tidak ditampilkan) dan sub-navigasi `AnalysisTabs` (saat ini hanya "Peta proses"; Varian, Kasus menyusul). Bukan anggota: `NotFoundPanel`.

1. **Keadaan tanpa data.** Bila `eventLogFor` mengembalikan `null`: kartu "Belum ada data untuk dipetakan" dengan tautan ke Sumber data/Pemetaan sesuai keadaan.
2. **Header peta.** Dataset ("{sumber} · pemetaan v{n}"), konteks ("Batas proses: awal/akhir teramati; paket konteks belum dipakai"), filter ("Tanpa filter"), cakupan ("{n} kasus (100% dari data)").
3. **Kontrol.** Toggle mode "Frekuensi" / "Performa". Dua slider (`<input type="range">` dengan label dan nilai, 1–100): "Aktivitas ditampilkan" dan "Transisi ditampilkan"; teks selalu terlihat "{a} aktivitas dan {t} transisi disembunyikan". Tombol "Atur ulang".
4. **Peta (React Flow).** Simpul aktivitas (nama terpotong dengan `title`; di mode frekuensi tampil jumlah kasus, di mode performa tampil jumlah event), simpul awal/akhir bulat. Tepi berpanah dengan label (frekuensi: `count`; performa: median, format "3,2 hari"/"4 jam"), ketebalan 1–8 px dan warna sebanding nilainya (frekuensi: skala abu ke aksen; performa: median ke skala hijau ke merah). Loop A→A sebagai lengkung pada simpul; dua arah sebagai dua garis. Pan dan zoom bawaan, `fitView` saat muat, tanpa drag simpul. Legenda tetap terlihat (skala warna dan ketebalan, arti angka). Bila `hasStartTime` false, label performa berbunyi "Jeda antar-event selesai" (bukan "durasi aktivitas") dan legenda menjelaskannya.
5. **Panel kasus.** Klik simpul atau tepi membuka panel di bawah atau di samping peta: judul ("Kasus yang melewati {A}" / "Transisi {A} → {B}"), jumlah ("{n} kasus", sama persis dengan angka elemen), tabel kasus (ID kasus, mulai, durasi, jumlah event) dapat diurutkan (durasi, jumlah event, waktu mulai) dan dipaginasi 20 per halaman; tombol "Tutup". Baris punya tautan nonaktif "Buka timeline (M05c)". Klik kanvas kosong menutup panel.
6. Kartu ringkas di bawah peta: "Transisi paling lambat" (median tertinggi) dan "Jalur paling sering", sebagai pintu masuk demo; keduanya klik untuk membuka panel kasus elemen itu.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Card/Table/Pill/Banner yang ada. Semua nilai dari data (label aktivitas, ID kasus) dirender sebagai teks. Peta pada lebar 1280px dan 1024px tidak membuat halaman bergulir horizontal (kanvas tetap dalam kartu, tinggi 520px).

## Pengujian

- `eventlog.test.ts`: `processActivities` (label varian digabung, dikecualikan dibuang, maksimum 8, kurang dari 2 → `null` dari `buildEventLog`); `buildEventLog` (deterministik, jumlah kasus sesuai rumus dan batas 400, urut waktu di tiap kasus, durasi non-negatif); `buildDfg` (jumlah per elemen, median/P90 benar pada fixture kecil dengan nilai diketahui, loop dan dua arah terpisah, simpul awal/akhir); **invarian konsistensi** peta ↔ kasus untuk seluruh elemen pada log seed; `simplify` (persen 100 tidak menyembunyikan apa-apa, jumlah tersembunyi benar, awal/akhir selalu ada, tepi tanpa ujung terlihat dibuang, default ≈ 30 simpul); `sortCases`/`pageOf` (urutan, ukuran halaman, halaman terakhir); `eventLogFor` untuk proyek dengan dan tanpa pemetaan.
- `layout.test.ts`: deterministik, semua simpul berposisi, tidak ada tumpang tindih.
- Verifikasi manual di browser pada 1280px dan 1024px, termasuk tiga peran dan proyek tanpa data.

## Struktur berkas (baru/ubah)

`lib/mock/{eventlog,layout}.ts` + `eventlog.test.ts` + `layout.test.ts` (baru), `lib/mock/permissions.ts` (`analysis.view`), `lib/format.ts` (`formatDuration(ms)`), `components/project/{analysis-tabs,process-map,map-legend,case-panel}.tsx` (baru), rute `analysis/map/page.tsx` (baru), `[projectId]/layout.tsx` (tab "Analisis"), `apps/web/package.json` (dua dependensi).
