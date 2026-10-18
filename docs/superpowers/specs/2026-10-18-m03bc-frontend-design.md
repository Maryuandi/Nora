# Spec: M03b + M03c frontend, Kualitas data dan Penerbitan dataset (data tiruan)

Tanggal: 18 Oktober 2026. Status: disetujui desainer ("gas lah", 18 Okt 2026).

Acuan: [PRD M03](../../prd/m03-penyiapan-kualitas-data-prd.md), Story 3, 4, dan 5 (Fitur 3, 4, 5). Dibangun di atas M03a (`feat/m03a-frontend`): snapshot `siap_dipetakan`, pemetaan versi, aktivitas dan label. Tidak ada backend atau worker; semua angka tiruan deterministik dari statistik snapshot dan pemetaan.

## Tujuan

M03b: Analis atau Administrator melihat laporan kualitas data untuk satu sumber, memahami masalahnya sampai baris sumber, dan menangani masalah lewat antrean perbaikan berbasis aturan. M03c: Analis menerbitkan **versi dataset** immutable beserta **matriks kemampuan** yang menyatakan analisis apa yang tersedia atau terbatas.

**Berhasil bila:**

1. Halaman sumber punya tab "Kualitas" dan "Dataset"; keduanya dapat dicapai lewat navigasi.
2. Laporan menampilkan delapan pemeriksaan dengan jumlah, persen, keparahan, dan contoh bernomor baris; ringkasan "siap analisis / siap dengan catatan / belum layak" beserta alasan.
3. Menambah dan mencabut aturan perbaikan (dengan alasan wajib) mengubah jumlah event yang disertakan; aturan yang mengecualikan > 20% event butuh konfirmasi tambahan.
4. Menerbitkan versi dataset menghasilkan `v1`, `v2`, …; konfigurasi yang sama tidak dapat diterbitkan dua kali; setiap aksi tercatat di audit log.
5. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Pemrosesan di worker, batas proses dan definisi rework (M04b; kasus belum selesai dilaporkan "tidak diketahui"), penggabungan beberapa sumber, pseudonimisasi, ambang keparahan per proyek, penyuntingan sel manual, aturan perbaikan berbasis filter bebas (aturan menargetkan satu pemeriksaan), laporan turunan setelah paket konteks, backend, layar ponsel.

## Peran dan izin

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `quality.view` | ya | ya | ya |
| `repair.edit` (tambah/cabut aturan perbaikan) | ya | ya | tidak |
| `dataset.publish` | tidak | ya | tidak |

Semua aksi tulis hanya pada proyek `aktif` (`acceptsData`).

## Model data tiruan (`lib/mock/types.ts`)

```ts
type CheckId =
  | "nilai_hilang" | "waktu_tidak_wajar" | "duplikasi" | "urutan_ambigu"
  | "kasus_belum_selesai" | "waktu_mulai_selesai" | "label_belum_dipetakan" | "di_luar_periode";
type Severity = "tinggi" | "sedang" | "info";
type RepairAction = "kecualikan_event" | "kecualikan_kasus" | "terima";

interface RepairRule {
  id: string; sourceId: string; projectId: string;
  check: CheckId; action: RepairAction; reason: string;
  impactEvents: number; impactCases: number;     // dihitung saat dibuat
  active: boolean;                                // false = dicabut
  createdBy: string; createdAt: string; revokedBy?: string; revokedAt?: string;
}

type CapabilityStatus = "tersedia" | "terbatas" | "tidak_tersedia";
interface Capability { id: string; label: string; status: CapabilityStatus; explanation: string }

interface DatasetVersion {
  id: string; sourceId: string; projectId: string; version: number;   // per sumber
  snapshotId: string; mappingId: string; repairRuleIds: string[];      // aturan perbaikan aktif saat terbit
  hash: string;                                                        // 12 heks, deterministik
  verdict: "siap" | "siap_catatan" | "belum_layak";
  eventsIncluded: number; casesIncluded: number;
  capabilities: Capability[]; note?: string;
  createdBy: string; createdAt: string;
}
```

`MockState` bertambah `repairRules: RepairRule[]` dan `datasetVersions: DatasetVersion[]`. Tanpa data awal (demo dimulai bersih; alur dicoba pengguna).

## Mesin kualitas (`lib/mock/quality.ts`, baru, murni, tanpa React)

- `qualityDataset(state, sourceId): { snapshot: Snapshot; mapping: MappingVersion; project: Project } | null`: pemetaan terbaru sumber (urut waktu, seri sama menurut indeks terakhir) dan snapshot yang dirujuknya bila berstatus `siap_dipetakan`, selain itu snapshot `siap_dipetakan` terbaru sumber itu; `null` bila tanpa pemetaan atau tanpa snapshot siap.
- `buildQualityReport(dataset, repairRules: RepairRule[]): QualityReport`, dengan
  ```ts
  interface QualityFinding {
    id: CheckId; title: string; severity: Severity;
    status: "ditemukan" | "bersih" | "tidak_berlaku" | "tidak_diketahui";
    affectedEvents: number; affectedCases: number; percent: number; // persen atas total event, 1 desimal
    examples: { row: number; text: string }[];                       // maks 5, nomor baris 1..stats.rows, urut naik
    explanation: string;
  }
  interface QualityReport {
    snapshotId: string; mappingId: string; totalEvents: number; totalCases: number;
    findings: QualityFinding[]; excludedEvents: number; excludedCases: number;
    eventsIncluded: number; casesIncluded: number;
    verdict: "siap" | "siap_catatan" | "belum_layak"; reasons: string[];
  }
  ```
  Delapan pemeriksaan dengan keparahan bawaan: nilai hilang pada kolom wajib (tinggi), waktu tidak wajar (tinggi), duplikasi/ambigu/konflik dari M02 (sedang), urutan ambigu (sedang), kasus belum selesai (info), waktu mulai > waktu selesai (tinggi), label belum dipetakan (sedang), kasus di luar periode (info). Aturan hitung: `totalEvents = stats.rows`, `totalCases = round(rows / 6)`;
  - `nilai_hilang`: `round(rows × f)` dengan `f` dari hash (checksum + id) di rentang 0,2% sampai 7%.
  - `waktu_tidak_wajar`: rentang 0,1% sampai 6%.
  - `duplikasi`: `stats.duplicateEvents + stats.conflictEvents` (data M02 apa adanya).
  - `urutan_ambigu`: kasus terdampak = `round(totalCases × f)` dengan `f` 2% sampai 18%; event terdampak = kasus × 3.
  - `kasus_belum_selesai`: selalu `tidak_diketahui` ("Batas proses belum ditetapkan (M04)"), tanpa angka.
  - `waktu_mulai_selesai`: `tidak_berlaku` ("Waktu mulai tidak dipetakan") bila pemetaan tidak memuat peran `timestamp_start`; selain itu rentang 0,1% sampai 1%.
  - `label_belum_dipetakan`: jumlah event pada label mentah (dari `activityLabels(snapshot)`) yang kunci normalisasinya (huruf kecil, spasi dirapatkan, tanda baca ujung dibuang) sama dengan label lain tetapi ejaannya tidak tercakup aturan label pemetaan; 0 → `bersih`.
  - `di_luar_periode`: bila `stats.timeFrom` sebelum `project.contractStart` atau `stats.timeTo` setelah `project.contractEnd` (bila ada), event terdampak sebanding dengan hari di luar kontrak dibanding rentang data; selain itu `bersih`.
  Kasus terdampak untuk pemeriksaan berbasis event = `min(totalCases, ceil(events / 4))`. Status `ditemukan` bila terdampak > 0, `bersih` bila 0. Contoh: lima nomor baris deterministik dari hash dengan teks per jenis ("baris 482: ID kasus kosong", "baris 1203: waktu 2031-02-30 di luar jangkauan", …); teks dari konstanta, tidak memuat data pengguna.
  - Aturan perbaikan aktif untuk pemeriksaan `c` dengan aksi `kecualikan_event`/`kecualikan_kasus` menambah `excludedEvents`/`excludedCases` sebesar `impactEvents`/`impactCases` aturan itu (total dipotong pada `totalEvents`/`totalCases`); `eventsIncluded = totalEvents − excludedEvents`.
  - `verdict`: `belum_layak` bila ada temuan `tinggi` berstatus `ditemukan` dengan persen > 5 (persen dihitung setelah aturan perbaikan dikurangkan dari `affectedEvents` pemeriksaan itu bila aturan pengecualian atau `terima` aktif); `siap_catatan` bila ada temuan `tinggi` atau `sedang` yang `ditemukan` (setelah pengurangan itu) atau ada `tidak_diketahui`; selain itu `siap`. `reasons`: satu kalimat per temuan yang mendorong hasil ("Waktu tidak wajar memengaruhi 4,2% event", "Status penyelesaian kasus belum diketahui").
- `repairImpact(report, check): { events: number; cases: number }`: dampak yang akan dikecualikan bila pemeriksaan itu ditangani sekarang (= `affectedEvents`/`affectedCases` pemeriksaan itu, sebelum aturan).
- `buildCapabilities(dataset, report): Capability[]`: lima baris tetap (id `waktu_mulai`, `sumber_daya`, `urutan`, `batas_proses`, `jumlah_kasus`) dengan status dan penjelasan bahasa bisnis: tanpa waktu mulai → `terbatas`, "Durasi kerja aktivitas tidak tersedia; hanya jeda antar-event dan durasi kasus"; tanpa peran `resource` → `tidak_tersedia`, "Analisis beban kerja dan sumber daya tidak tersedia"; urutan ambigu > 10% kasus → `terbatas`, "Penemuan alur dan pemeriksaan kesesuaian: hasil perlu kehati-hatian"; batas proses selalu `terbatas` ("Analisis kasus belum selesai dan SLA ujung ke ujung terbatas sampai batas proses ditetapkan (M04)"); `casesIncluded < 100` → `tidak_tersedia`, "Perbandingan kelompok dan periode dinonaktifkan"; selain itu `tersedia` dengan penjelasan positif singkat.
- `datasetHash(snapshotId, mappingId, ruleIds: string[]): string`: FNV (`hash` dari `mapping.ts`) atas `${snapshotId}|${mappingId}|${ruleIds sorted.join(",")}` dalam 12 heks.
- Label: `CHECK_META: Record<CheckId, { title: string; severity: Severity }>`, `VERDICT_LABEL`, `ACTION_LABEL`.

## Aturan reducer (`lib/mock/reducer.ts`)

Semua aksi: proyek sumber harus `aktif`; tidak melempar; id tak dikenal → galat string; sukses menambah tepat satu `AuditEvent`; galat mengembalikan state yang sama (referensi sama).

- `addRepairRule { sourceId; check: CheckId; action: RepairAction; reason: string; confirmLarge?: boolean }`: guard: sumber ada → proyek aktif → `qualityDataset` ada ("Belum ada data yang siap dinilai") → alasan (trim) tidak kosong ("Alasan wajib diisi") → temuan untuk `check` berstatus `ditemukan` ("Tidak ada masalah untuk ditangani") → belum ada aturan aktif untuk `check` yang sama ("Sudah ada aturan perbaikan aktif untuk pemeriksaan ini") → bila total event dikecualikan setelah aturan ini > 20% × `totalEvents` dan `confirmLarge` bukan true: galat "Aturan ini mengecualikan lebih dari 20% event; konfirmasi tambahan diperlukan". Dampak dari `repairImpact`; aksi `terima` berdampak 0 pada pengecualian tetapi tercatat. Audit `perbaikan.tambah`, objectType `Perbaikan`, label `{judul pemeriksaan} ({aksi})`.
- `revokeRepairRule { ruleId }`: hanya aturan aktif (galat "Aturan sudah dicabut"); set `active=false`, `revokedBy/At`; audit `perbaikan.cabut`.
- `publishDataset { sourceId; note? }`: guard: sumber ada → proyek aktif → `qualityDataset` ada → verdict bukan `belum_layak` ("Data belum layak diterbitkan: {alasan pertama}") → hash konfigurasi (snapshot + pemetaan + id aturan aktif) berbeda dari versi terbaru sumber ("Tidak ada perubahan dari v{n}"). Membuat `DatasetVersion` dengan `version = max + 1` per sumber, `capabilities` dan `verdict` dari mesin, `eventsIncluded/casesIncluded`, `repairRuleIds` aturan aktif sumber itu (urut id). Audit `dataset.terbit`, objectType `Dataset`, label `{nama sumber} v{n}`. Hasil `{ state, datasetId }`.
- Helper: `repairRulesForSource(s, sourceId, onlyActive?)`, `datasetVersionsForSource(s, sourceId)` (terbaru dulu, seri sama menurut indeks terakhir), `latestDataset(s, sourceId)`.

Izin peran diperiksa di UI (pola M01–M04c); reducer tidak memeriksa peran.

## Layar

Di bawah `projects/[projectId]/sources/[sourceId]/`; `SourceTabs` mendapat dua tab baru "Kualitas" (ikon `ShieldCheck`) dan "Dataset" (ikon `Stack`) setelah "Pemetaan"/"Riwayat" yang ada. Bukan anggota: `NotFoundPanel`.

1. **`/quality`.**
   - Tanpa data (`qualityDataset` null): keadaan kosong dengan tautan ke Pemetaan.
   - Header: data yang dinilai (`{nama file} · pemetaan v{n}`), total event dan kasus.
   - Kartu ringkasan: lencana hasil (Siap analisis / Siap dengan catatan / Belum layak, ikon+teks dalam Pill), daftar `reasons`, "{eventsIncluded} dari {totalEvents} event disertakan".
   - Tabel delapan temuan: judul, `SeverityPill`, status, jumlah event/kasus, persen, tombol "Lihat contoh" (membuka baris contoh bernomor baris "Snapshot {file} · baris N: teks" sebagai teks) dan "Tangani" (bila temuan `ditemukan`, tanpa aturan aktif, dan `can("repair.edit") && acceptsData`).
   - Dialog "Tangani": pilihan aksi (kecualikan event, kecualikan kasus, terima apa adanya dengan catatan, ubah pemetaan → tautan ke Pemetaan sumber), alasan (wajib), pratinjau dampak ("{n} event dan {m} kasus akan dikecualikan"), kotak konfirmasi tambahan bila total dikecualikan akan > 20%.
   - Kartu "Antrean perbaikan": aturan aktif (pemeriksaan, aksi, alasan terpotong dengan `title`, dampak, pembuat, "Cabut") dan bagian "Dikecualikan" (aturan pengecualian dengan alasan dan jumlah), serta aturan dicabut dalam daftar ringkas redup.
2. **`/dataset`.**
   - Kartu "Terbitkan versi dataset": ringkasan hasil kualitas, `eventsIncluded/casesIncluded`, pratinjau matriks kemampuan, tombol "Terbitkan" (hanya `can("dataset.publish") && acceptsData`; nonaktif dengan alasan bila `belum_layak` atau tanpa perubahan), dialog konfirmasi dengan catatan opsional dan ringkasan.
   - Tabel versi: v, tanggal, pembuat, snapshot, pemetaan v, jumlah aturan perbaikan, hash 8 karakter (mono), hasil, status ("Terbaru" atau "Ada versi lebih baru"). Klik nama versi menampilkan detail baca-saja: rujukan, matriks kemampuan (Pill status + penjelasan), aturan perbaikan yang dipakai.
   - Penjelasan bila peran boleh tetapi proyek tidak aktif; Pemilik proses melihat tanpa tombol.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Card/Table/Pill/Banner/NoraModal yang ada. Semua string (contoh, alasan, catatan) dirender sebagai teks; nilai panjang terpotong dengan `title` atau `break-words`.

## Pengujian

- `quality.test.ts`: `qualityDataset` (seed `s-p2p-sap` ada; sumber tanpa pemetaan → null); laporan deterministik, delapan temuan berurut `CHECK_META`; `duplikasi` memakai angka M02 apa adanya; `kasus_belum_selesai` selalu `tidak_diketahui`; `waktu_mulai_selesai` `tidak_berlaku` tanpa `timestamp_start` dan berangka dengannya; `label_belum_dipetakan` pada seed menemukan varian spasi ganda yang belum digabung dan `bersih` bila semua varian tercakup aturan; `di_luar_periode` memakai kontrak proyek; contoh ≤ 5, naik, dalam 1..rows; persen konsisten dengan jumlah; aturan perbaikan mengurangi `eventsIncluded` dan memengaruhi verdict (mis. pengecualian pada temuan tinggi > 5% menurunkannya); verdict tiga cabang diuji dengan snapshot/pemetaan sintetis; `buildCapabilities` lima baris dan cabangnya (tanpa resource, `casesIncluded < 100`, urutan ambigu > 10%); `datasetHash` stabil dan tak bergantung urutan id.
- `quality-reducer.test.ts`: tiap guard `addRepairRule` dengan pesan tepat dan referensi state sama; aturan sah menambah rekor + 1 audit; konfirmasi 20% (galat tanpa `confirmLarge`, sukses dengan); duplikat aktif ditolak; `revokeRepairRule` (sukses + 1 audit, ganda ditolak); `publishDataset` (`v1`, `v2` setelah perubahan aturan, identik ditolak, `belum_layak` ditolak, proyek tak aktif ditolak, 1 audit, `repairRuleIds` aktif saja); id tak dikenal tidak melempar; helper terurut.
- `permissions.test.ts`: matriks di atas.
- Verifikasi manual di browser (1280px dan 1024px), tiga peran.

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/quality.ts` + `quality.test.ts` + `quality-reducer.test.ts` (baru), `components/project/{source-tabs}.tsx` (ubah), `components/project/{quality-pills,repair-dialog,capability-list}.tsx` (baru), rute `sources/[sourceId]/quality/page.tsx` dan `sources/[sourceId]/dataset/page.tsx` (baru).
