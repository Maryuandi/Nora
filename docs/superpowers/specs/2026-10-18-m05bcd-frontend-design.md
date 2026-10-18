# Spec: M05b/c/d frontend, Varian, filter, timeline kasus, pengelompokan objek, tampilan tersimpan (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M05](../../prd/m05-peta-proses-penelusuran-kasus-prd.md), Story 3, 4, 5 (bagian tampilan tersimpan), 6, 7, Fitur 3–6. Dibangun di atas M05a (`lib/mock/eventlog.ts`, peta proses, panel kasus) pada cabang `feat/m05bcd-frontend`, yang dipotong dari `integ/stack-m03bc` (ujung stack: M01 sampai M06 plus M03b/c). Tidak ada backend atau worker; semuanya dihitung di klien dari event log tiruan.

## Tujuan

Analis menjelajah proses lebih dalam: melihat varian, memfilter peta, membuka satu kasus sampai ke baris sumber, melihat kasus yang berbagi objek (mis. satu PO), dan menyimpan sebuah tampilan untuk dirujuk modul lain.

**Berhasil bila:**

1. Tab Analisis punya sub-navigasi: Peta proses, Varian, Kasus, Objek, Tampilan tersimpan.
2. Varian tampil terurut dengan persen kumulatif dan ringkasan "N varian mencakup 80% kasus"; memilih varian memfilter peta dan daftar kasus.
3. Filter (periode, atribut, aktivitas, varian, durasi, status, objek) mempengaruhi peta, varian, dan daftar kasus secara konsisten; hasil 0 kasus menampilkan keadaan kosong.
4. Satu kasus dapat dibuka sebagai timeline dengan asal-usul tiap event; nilai objek dapat diklik ke kasus lain pada objek yang sama.
5. Ringkasan per objek dan timeline gabungan per objek tersedia, berlabel "pengelompokan atribut".
6. Tampilan tersimpan dapat dibuat, dibuka kembali (filter dan elemen terpilih pulih), dan tercatat di audit.
7. Invarian konsistensi diuji otomatis: jumlah kasus per varian berjumlah total kasus terfilter; angka peta tetap sama dengan panel kasus pada log terfilter. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Hasil analisis dipakai ulang berbasis hash (hanya ada satu hitungan klien yang dimemoisasi), versi dataset M03c dan paket konteks M04 sebagai pemilih (tetap memakai pratinjau sumber pertama berpemetaan seperti M05a), paginasi server, hapus atau ubah tampilan tersimpan, peta object-centric, perbandingan peta, ekspor, backend, integrasi M07.

## Peran dan izin

- `analysis.view` (sudah ada): ketiga peran melihat varian, kasus, timeline, objek, dan tampilan tersimpan.
- `view.save` (baru): `administrator` dan `analis` menyimpan tampilan; `pemilik_proses` hanya melihat. Proyek tidak aktif (`acceptsData` false) tidak boleh menyimpan; melihat tetap boleh.
- Tampilan tersimpan menambah entri audit `tampilan.simpan`.

## Perluasan event log tiruan (`lib/mock/eventlog.ts`)

Jumlah kasus/node/edge dan pilihan jalur M05a tidak berubah: atribut baru memakai hash seed terpisah dan tidak menggeser pengundian yang ada. Pengecualian: seri waktu `ambigu` yang dipaksakan (~2% kasus) memperpendek kasus tersebut dan sedikit menggeser beberapa median/P90 edge serta pangsa M06 di hilir; tidak ada golden test yang mengunci angka ini.

```ts
interface LogEvent { activity; activityRaw; time; resource;
  rowRef: number;                 // nomor baris sumber (deterministik, 2..stats.rows+1)
  flag?: "kualitas" | "dikecualikan" | "ambigu" }   // jarang (~3% event), hash terpisah
interface LogCase { ...; attrs: { vendor: string }; objects: { po: string };
  complete: boolean }              // true bila aktivitas terakhir = tahap terakhir proses
```

- `attrs.vendor`: salah satu dari 5 vendor tetap (mis. "PT Sinar Jaya"), dipilih lewat hash kasus.
- `objects.po`: nomor dokumen `PO-45000nn`; sekitar 2–4 kasus berbagi satu PO (kelompok indeks berurutan dengan hash), supaya pengelompokan objek bermakna.
- `flag`: `ambigu` hanya pada event yang waktunya sama persis dengan event sebelumnya (dipaksa pada sebagian kecil agar muncul di timeline dan varian).
- `LogCase.id` tetap `C-0001`.
- Ketersediaan atribut: `attrsAvailable(mapping)` benar bila pemetaan memuat ≥ 1 kolom berperan `case_attr`. Bila tidak, filter atribut dan objek dinonaktifkan dengan penjelasan "Tidak ada kolom atribut kasus pada pemetaan" dan ringkasan objek tidak ditampilkan. Seed p-p2p harus memenuhi syarat ini (periksa dan, bila perlu, tambahkan kolom `case_attr` pada seed pemetaan tanpa memecah tes M02/M03).

## Mesin analisis (`lib/mock/analysis.ts`, baru, murni)

```ts
interface Variant { id: string /* "v-" + 8 hex dari FNV urutan */; sequence: string[]; caseCount: number; pct: number;
  cumPct: number; medianDurationMs: number; ambiguous: boolean }
interface FilterSpec {
  period?: { by: "mulai" | "akhir" | "event"; from?: string; to?: string };  // tanggal ISO (hari)
  vendors?: string[];
  hasActivities?: string[]; lacksActivities?: string[];
  variantIds?: string[];
  duration?: { minDays?: number; maxDays?: number };
  completion?: "semua" | "selesai" | "berjalan";
  po?: string;                     // persis sama
}
```

- `buildVariants(log): Variant[]`: kelompok kasus menurut urutan aktivitas; urut `caseCount` turun, seri diurutkan menurut `sequence.join("→")`; `pct` terhadap `log.cases.length` (0 bila kosong), `cumPct` kumulatif; `medianDurationMs` dari `percentile`. `ambiguous` bila ada kasus anggota dengan event bertanda `ambigu`. `variantsTo80(variants): number` = jumlah varian terkecil dengan `cumPct >= 80` (0 bila kosong).
- `variantIdOf(sequence): string`.
- `applyFilter(log, spec, variants?): EventLog`: mengembalikan log baru dengan `cases` terfilter (aktivitas, sumber, dan urutan kasus tidak berubah). Semua kondisi digabung dengan AND; array kosong atau undefined berarti tidak memfilter; `period.by = "event"` lolos bila ≥ 1 event jatuh di rentang; `from`/`to` inklusif pada hari UTC; `duration` dalam hari (bilangan ≥ 0; `minDays > maxDays` menghasilkan 0 kasus). `variantIds` dihitung dari log yang diberikan (bukan log terfilter).
- `describeFilter(spec): string[]`: kalimat Indonesia per kondisi aktif ("Periode: kasus mulai 1 Mei–31 Jul 2026"), kosong bila tanpa filter (header menampilkan "Tanpa filter").
- `isEmptyFilter(spec)`, `normalizeFilter(spec)` (membuang kunci kosong, mengurutkan array agar `JSON.stringify` stabil).
- `objectGroups(log): ObjectGroup[]` (`{ id: po, caseIds, caseCount, fromMs, toMs, variantIds }`), urut `caseCount` turun lalu id; `groupCases(log, po): LogCase[]`.
- `caseById(log, id)`.
- `provenance(snapshot, mapping, event)`: `{ fileName, rowRef, mappingVersion }`.
- `filteredLogFor(state, projectId, spec)`: membungkus `eventLogFor` + `applyFilter`; hasil dimemoisasi per `(snapshot.id, mapping.id, JSON.stringify(normalizeFilter(spec)))`; mengembalikan `{ full, filtered, dfg (dari filtered), variants (dari filtered), sourceLabel, mappingVersion, hasStartTime, attrsAvailable, snapshot, mapping } | null`. DFG, peta, dan varian untuk filter kosong identik dengan M05a.

**Invarian yang diuji:** jumlah `caseCount` seluruh varian = `filtered.cases.length`; persen kumulatif varian terakhir = 100; `casesForNode`/`casesForEdge` pada log terfilter sama dengan angka DFG terfilter (konsistensi M05a dipertahankan); filter kosong mengembalikan log yang sama; memfilter satu varian menghasilkan tepat `caseCount` varian itu; filter dua kali sama dengan menggabungkan kondisi (AND).

## Status filter bersama (`components/project/analysis-filter.tsx`, baru)

`AnalysisProvider` di `analysis/layout.tsx` (baru) menyimpan `filter: FilterSpec`, `mode`, dan `selection` (`{ kind: "node" | "edge" | "variant"; id }` atau null) agar filter bertahan antar sub-halaman (Peta, Varian, Kasus). Hook `useAnalysis()`. Memuat tampilan tersimpan menimpa ketiganya.

## Layar

Semua di bawah `projects/[projectId]/analysis/`; bukan anggota: `NotFoundPanel`. `AnalysisTabs` diperluas: Peta proses, Varian, Kasus, Objek, Tampilan tersimpan. Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Card/Table/Pill/Banner yang ada. Nilai dari data dirender sebagai teks.

### M05b

1. **Bilah filter** (komponen `FilterBar`, dipakai di Peta, Varian, Kasus): tombol "Filter" membuka panel lipat berisi kontrol: periode (pilih basis awal kasus/akhir kasus/event + dua input tanggal), vendor (multi-pilih kotak centang), aktivitas wajib ada, aktivitas tidak boleh ada, durasi (min/maks hari), status ("Semua", "Selesai", "Berjalan"), nomor PO. Tombol "Terapkan" dan "Atur ulang"; chip kondisi aktif dengan tombol hapus per chip. Kontrol atribut (vendor, PO) dinonaktifkan dengan penjelasan bila `attrsAvailable` false. Validasi: tanggal mulai ≤ akhir, durasi tidak negatif; pesan galat inline, "Terapkan" nonaktif saat tidak valid.
2. **Peta** (perluasan M05a): header menampilkan filter aktif ("Tanpa filter" atau kalimat dari `describeFilter`) dan cakupan "{n} kasus ({pct}% dari data)". Peta dihitung dari log terfilter; tata letak tetap dihitung dari DFG tanpa filter sehingga posisi simpul stabil (simpul tanpa kasus pada filter ditampilkan samar atau disembunyikan, ditulis sebagai bagian "disembunyikan"). Filter menghasilkan 0 kasus: kartu kosong "Tidak ada kasus yang cocok" dengan saran melonggarkan filter dan tombol "Atur ulang filter".
3. **Halaman Varian** (`analysis/variants/page.tsx`): ringkasan "{n} varian · {k} varian mencakup 80% kasus"; tabel terpaginasi (100 per halaman, kontrol halaman hanya bila > 100): kotak centang, ID, urutan aktivitas (terpotong dengan `title`, tooltip penuh), kasus, persen, kumulatif, median durasi, penanda "urutan ambigu". Tombol "Terapkan varian terpilih sebagai filter" (menambah `variantIds` ke filter; peta dan kasus ikut berubah) dan "Lihat kasus" per varian (mengisi `selection` varian lalu membuka halaman Kasus).
4. **Halaman Kasus** (`analysis/cases/page.tsx`): daftar kasus log terfilter, tabel yang dapat diurutkan (durasi, jumlah event, waktu mulai) dan dipaginasi 20 per halaman, kolom ID kasus (tautan ke timeline), mulai, durasi, jumlah event, vendor, PO (tautan ke objek), varian. Jika `selection` varian/node/edge ada, tampil chip "Dipersempit ke: ..." dengan tombol hapus; jumlahnya sama persis dengan angka elemen itu. Panel kasus M05a pada peta ikut memakai log terfilter dan tautan "Buka timeline" kini aktif (ke M05c).

### M05c

5. **Timeline kasus** (`analysis/cases/[caseId]/page.tsx`): kasus tidak ditemukan (ID salah atau terfilter habis, tetap dicari pada log tanpa filter) menampilkan `NotFoundPanel` dengan tautan kembali. Header: ID kasus, vendor, PO (tautan ke objek), mulai, durasi, status, varian (ID, tautan ke Varian). Daftar event berurutan: nomor urut, label kanonis, label asli (hanya bila berbeda), waktu pada zona waktu pemetaan (format yang ada), sumber daya, jeda dari event sebelumnya (`formatDuration`; "jeda antar-event selesai" bila `hasStartTime` false), penanda (Pill) untuk `flag`: "Masalah kualitas", "Dikecualikan", "Urutan ambigu". Setiap event dapat dibuka (disclosure dengan `aria-expanded`) untuk asal-usul: berkas snapshot, nomor baris sumber, versi pemetaan. Nilai PO dan vendor tampil sebagai tautan: PO ke objek (M05d), vendor ke Kasus dengan filter vendor itu.
6. **Navigasi sebelumnya/berikutnya** di timeline (urutan daftar kasus terfilter) dan tautan "Kembali ke daftar".

### M05d

7. **Objek** (`analysis/objects/page.tsx`): label dan Banner "Pengelompokan atribut: kasus yang berbagi nilai atribut yang sama, bukan analisis object-centric penuh". Tabel objek (Dokumen PO): objek, jumlah kasus, rentang waktu, varian yang muncul (jumlah, dan ID), tautan "Buka". Tidak tersedia (kartu penjelasan) bila `attrsAvailable` false. Daftar mengikuti log terfilter.
8. **Detail objek** (`analysis/objects/[objectId]/page.tsx`): ringkasan (kasus, rentang, varian) dan timeline gabungan: semua event seluruh kasus objek diurutkan menurut waktu, tiap kasus diberi warna dan label berbeda (warna dari palet tetap, selalu dengan teks ID kasus, bukan warna saja), tiap baris tautan ke timeline kasusnya. Objek tidak ditemukan: `NotFoundPanel`.

### Tampilan tersimpan

9. **Menyimpan**: tombol "Simpan tampilan" di Peta dan Kasus (tersembunyi bagi `pemilik_proses`; nonaktif dengan alasan pada proyek tidak aktif) membuka modal: nama (wajib, ≤ 80 karakter, dipangkas), catatan opsional (≤ 500). Menyimpan `SavedView`: `{ id, projectId, name, note?, filter, mode, selection, sourceId, snapshotId, mappingVersion, activityPct, transitionPct, createdBy, createdAt }`.
10. **Halaman Tampilan tersimpan** (`analysis/views/page.tsx`): tabel (nama, pembuat, tanggal, filter ringkas, catatan terpotong) dengan tombol "Buka" yang memulihkan filter, mode, slider, dan elemen terpilih lalu membuka Peta. Bila snapshot atau pemetaan tampilan berbeda dari data saat ini, tampil peringatan "Data berubah sejak tampilan ini disimpan; angka dapat berbeda" (tampilan tetap dapat dibuka). Kosong: "Belum ada tampilan tersimpan".

## Mock state

`MockState` bertambah `savedViews: SavedView[]` (seed kosong). Aksi reducer `saveView { projectId; name; note?; filter; mode; selection; activityPct; transitionPct }` dengan urutan guard: proyek ada, `acceptsData`, data siap (`eventLogFor` bukan null), nama tidak kosong setelah dipangkas, panjang batas, filter tervalidasi (`validateFilter` kosong), lalu simpan dan `withAudit` (`tampilan.simpan`, objek "Tampilan", label = nama). Hasil mengembalikan `savedViewId`. `ReduceResult` bertambah `savedViewId?`. Peran dicek di UI lewat `can("view.save", projectId)` dan di reducer lewat `viewerRole` (analis atau administrator); galat: "Peranmu tidak dapat menyimpan tampilan".

## Pengujian

- `eventlog.test.ts` (tambahan): atribut baru deterministik; angka M05a tidak berubah (semua tes lama tetap lulus); `po` dibagi 2–4 kasus; `rowRef` dalam rentang; `flag` jarang dan `ambigu` hanya pada waktu sama; `complete` benar.
- `analysis.test.ts` (baru): `buildVariants` (urutan, persen, kumulatif, ID stabil, `variantsTo80`, log kosong); `applyFilter` tiap kondisi dan batasnya (inklusif tanggal, `by` awal/akhir/event, durasi min > maks, array kosong, AND); `describeFilter`, `normalizeFilter`; `objectGroups`; invarian konsistensi pada log seed dengan filter acak tetap; `provenance`; `filteredLogFor` memoisasi dan filter kosong identik dengan M05a.
- `reducer.test.ts` (tambahan): `saveView` sukses (audit satu entri, `savedViewId`), urutan guard dan semua pesan galat, peran, status proyek, data belum siap, nama kosong/terlalu panjang, filter tidak valid, state tidak berubah saat gagal.
- `permissions.test.ts`: `view.save` per peran.
- Verifikasi manual di browser (1280px dan 1024px, tiga peran, proyek tanpa data): filter, varian → peta, kasus → timeline → objek, simpan dan buka tampilan.

## Struktur berkas (baru/ubah)

`lib/mock/{analysis}.ts` + `analysis.test.ts` (baru), `lib/mock/{eventlog,types,reducer,permissions,data}.ts` (ubah), `components/project/{analysis-tabs (ubah),analysis-filter,filter-bar,variant-table,case-table,case-timeline,object-table,saved-view-dialog}.tsx` (baru), `components/project/{process-map,case-panel}.tsx` dan `analysis/map/page.tsx` (ubah), rute `analysis/{layout,variants/page,cases/page,cases/[caseId]/page,objects/page,objects/[objectId]/page,views/page}.tsx` (baru), `lib/format.ts` bila perlu pembantu tanggal.

## Pemecahan tugas (untuk rencana)

1. Mesin: perluasan event log, `analysis.ts`, tes (murni, tanpa UI).
2. Filter bersama: `AnalysisProvider`, `FilterBar`, integrasi peta (header, cakupan, keadaan kosong), sub-navigasi.
3. Varian dan Kasus (M05b): tabel, pilihan, penyempitan.
4. Timeline kasus (M05c).
5. Objek (M05d).
6. Tampilan tersimpan: tipe, reducer, izin, modal, halaman.
7. Rapi-rapi dan verifikasi browser; tinjauan akhir seluruh cabang.
