# Spec: M03a frontend, Pemetaan (data tiruan)

Tanggal: 17 Oktober 2026. Status: menunggu review.

Acuan: [PRD M03](../../prd/m03-penyiapan-kualitas-data-prd.md), Story 1 dan 2 (Fitur 1 dan 2). Dibangun di atas M02 frontend (`feat/m02-frontend`): snapshot `siap_dipetakan` beserta kolomnya, lapisan tiruan `apps/web/lib/mock/`, komponen Untitled UI, token Nora. M03 dipecah: **M03a** (spec ini: pemetaan kolom, waktu, label aktivitas, versi pemetaan), M03b (laporan kualitas dan antrean perbaikan), M03c (penerbitan dataset dan matriks kemampuan). Tidak ada backend, worker, atau penyimpanan permanen.

## Tujuan

Analis atau Administrator mengubah snapshot `siap_dipetakan` menjadi **versi pemetaan** tersimpan: peran tiap kolom, format dan zona waktu, dan label aktivitas yang dirapikan. Versi pemetaan dipakai M03b dan M03c.

**Berhasil bila:**

1. Dari halaman sumber, tab "Pemetaan" membuka pemetaan untuk snapshot `siap_dipetakan` terbaru, dan semua layar di bawah dapat dicapai lewat navigasi.
2. Pemetaan yang valid dapat disimpan sebagai `v1`, `v2`, …, tampil di riwayat versi, dan tercatat di audit log; yang tidak valid ditolak dengan pesan jelas per bidang.
3. Saran kolom dan saran kelompok label muncul tetapi tidak berlaku sebelum pengguna menerimanya.
4. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Laporan kualitas, antrean perbaikan, penerbitan dataset, matriks kemampuan (M03b/c); pemetaan otomatis XES yang lengkap (cukup saran dari nama kolom); pratinjau dari data sungguhan; pustaka template lintas sumber; backend; layar ponsel.

## Peran dan izin

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `mapping.view` | ya | ya | ya |
| `mapping.edit` (ubah, simpan) | ya | ya | tidak |

Menyimpan hanya saat proyek `aktif` (`acceptsData`). Di status lain, tombol disembunyikan dengan penjelasan seperti di M02. Pemilik proses melihat pemetaan terakhir tanpa kontrol ubah.

## Model data tiruan (`lib/mock/types.ts`)

```ts
type ColumnRole =
  | "case_id" | "activity" | "timestamp_end" | "timestamp_start" | "resource"
  | "event_id" | "lifecycle" | "case_attr" | "event_attr" | "ignore";

interface LabelRule { raw: string; canonical: string | null } // null = dikecualikan

interface MappingVersion {
  id: string; sourceId: string; snapshotId: string; projectId: string;
  version: number;                       // 1, 2, ... per sumber
  roles: Record<string, ColumnRole>;     // kunci = nama kolom
  timeFormat: string;                    // mis. "YYYY-MM-DD HH:mm:ss"
  timezone: string;                      // IANA, mis. "Asia/Jakarta"
  labels: LabelRule[];                   // hanya label yang diubah/dikecualikan
  note?: string;
  createdBy: string; createdAt: string;
}
```

`MockState` bertambah `mappings: MappingVersion[]`. Data awal: sumber `Ekspor SAP P2P` punya `v1` yang valid (menjadi template), sumber lain belum punya.

## Aturan murni (`lib/mock/mapping.ts`, baru, tanpa React)

- `suggestRoles(columns: {name; samples}[]): Record<string, ColumnRole>` heuristik nama kolom (tak peka huruf, abaikan spasi/garis bawah): `case`/`case id`/`caseid`/`case:concept:name` → `case_id`; `activity`/`aktivitas`/`concept:name` → `activity`; `timestamp`/`time`/`waktu`/`time:timestamp` → `timestamp_end`; `resource`/`org:resource`/`user` → `resource`; `lifecycle:transition` → `lifecycle`; sisanya `event_attr`. Satu peran wajib diberikan ke paling banyak satu kolom (kolom pertama yang cocok).
- `detectTimeFormat(samples: string[]): string` pola `YYYY-MM-DD HH:mm:ss` bila semua contoh cocok, `DD/MM/YYYY HH:mm` bila cocok, selain itu `"tidak dikenali"`.
- `activityLabels(snapshot: Snapshot): { raw: string; count: number }[]` deterministik dari `snapshot.checksum` dan `stats.rows`: 8 sampai 12 label unik termasuk varian ejaan (huruf besar/kecil, spasi ganda, titik akhir) dari 5 aktivitas dasar; jumlah dijumlahkan sama dengan `stats.rows`, urut menurun.
- `suggestGroups(labels): { canonical: string; raws: string[] }[]` mengelompokkan label yang sama setelah huruf kecil, trim, spasi dirapatkan, tanda baca di ujung dibuang; hanya kelompok berisi ≥ 2 label; `canonical` = varian paling sering.
- `previewEvents(snapshot, roles, timeFormat, timezone, labels): PreviewRow[]` maksimal 50 baris dari `snapshot.preview`: `{ caseId, activityRaw, activity, timeSource, timeUtc, resource }`. Konversi UTC memakai `Intl` terhadap zona (tanpa dependensi); label dikecualikan ditandai `excluded: true`; waktu yang tidak cocok format ditandai `timeUtc: null`.
- `validateMapping(input): { field: string; message: string }[]` galat kosong berarti valid. Aturan: tiap peran wajib `case_id`, `activity`, `timestamp_end` diberikan tepat satu kolom, dengan pesan "Pilih kolom untuk {peran}" / "Satu peran hanya untuk satu kolom"; `timezone` wajib dikonfirmasi (`timezoneConfirmed === true`, pesan "Konfirmasi zona waktu sumber"); kolom wajib harus dikonfirmasi (`confirmed` memuat ketiga kolom, pesan "Konfirmasi kolom {peran}"); `timeFormat` bukan `"tidak dikenali"`; label kanonis tidak boleh kosong dan label tidak boleh dipetakan ke dirinya yang lain secara melingkar.

## Aturan reducer (`lib/mock/reducer.ts`)

Aksi baru: `{ type: "saveMapping"; sourceId; snapshotId; roles; timeFormat; timezone; labels; note? }`. Mengembalikan galat string pertama dari `validateMapping` yang diulang di reducer (UI memakai fungsi yang sama untuk pesan per bidang). Menolak bila proyek tidak `aktif`, snapshot bukan `siap_dipetakan`, atau snapshot bukan milik sumber. Sukses: menambah `MappingVersion` dengan `version = max + 1` per sumber, tepat satu `AuditEvent` (`pemetaan.simpan`, objectType `Pemetaan`, label `{nama sumber} v{n}`), dan hasil `{ state, mappingId }`. Menyimpan konfigurasi yang identik dengan versi terbaru sumber itu ditolak ("Tidak ada perubahan dari v{n}").

Helper terekspor: `mappingsForSource(s, sourceId)` (terbaru dulu, urutan sama-tanda-waktu dibalik berdasarkan indeks), `latestMapping(s, sourceId)`.

## Layar

Semua di bawah `projects/[projectId]/sources/[sourceId]/`. Halaman detail sumber (M02) mendapat tab sekunder "Snapshot" dan "Pemetaan". Bukan anggota: `NotFoundPanel`.

1. **`/mapping`**, pemetaan untuk snapshot `siap_dipetakan` terbaru sumber (bila tidak ada: keadaan kosong "Belum ada snapshot yang siap dipetakan" dengan tautan ke detail sumber). Dasar form: template dari `latestMapping` bila ada (kolom baru/hilang ditandai badge "Baru" / "Hilang" dengan banner ajakan meninjau), kalau tidak, saran dari `suggestRoles`. Bagian:
   - **Kolom:** tabel nama kolom, 3 contoh nilai, saran sistem (label kecil + tombol "Pakai saran"), dropdown peran, kotak "Konfirmasi" untuk tiga kolom wajib. Galat per baris dari `validateMapping`.
   - **Waktu:** select format (terdeteksi sebagai pilihan awal), select zona waktu (Asia/Jakarta, Asia/Makassar, Asia/Jayapura, UTC), kotak "Saya mengonfirmasi zona waktu sumber".
   - **Pratinjau 50 event:** tabel waktu sumber | waktu UTC | kasus | aktivitas asli | aktivitas kanonis | sumber daya, diperbarui setiap perubahan (dihitung langsung di klien dari `previewEvents`); baris yang dikecualikan ditandai abu dengan teks "dikecualikan"; waktu tak cocok merah muda "format tidak cocok".
   - **Label aktivitas:** tabel label mentah, frekuensi, kanonis (input), aksi Kecualikan/Pulihkan; panel "Saran kelompok" yang menampilkan kelompok dari `suggestGroups` dengan tombol "Terima" per kelompok dan "Terima semua"; saran tidak berlaku sebelum diterima.
   - **Simpan:** bidang catatan opsional, tombol "Simpan versi pemetaan" (hanya bila `can("mapping.edit")` dan `acceptsData`), sukses menuju riwayat dengan banner "Versi v{n} disimpan".
2. **`/mapping/versions`** (tab "Riwayat"): tabel versi (v, tanggal, pembuat, snapshot, ringkasan "3 kolom wajib · 4 label diubah · zona {tz}", catatan). Klik baris membuka tampilan baca-saja pemetaan itu (komponen form yang sama, semua kontrol nonaktif, judul "v{n}"). Versi lama tidak dapat diubah.
3. Kartu "Sumber data" di Ringkasan dan tabel sumber M02 menampilkan "Pemetaan: v{n}" atau "Belum dipetakan" sebagai tambahan satu kolom/baris kecil.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Pill/Card/Table/NoraModal/Banner yang ada. Semua nilai contoh dirender sebagai teks.

## Pengujian

- `mapping.test.ts` (baru): `suggestRoles` (nama XES, nama umum, satu peran satu kolom), `detectTimeFormat` (dua pola + tidak dikenali), `activityLabels` (jumlah = rows, deterministik), `suggestGroups` (varian huruf/spasi/titik, kelompok tunggal tidak muncul, kanonis = paling sering), `previewEvents` (≤ 50 baris, konversi Asia/Jakarta → UTC kurang 7 jam, waktu tak cocok → `timeUtc` null, dikecualikan), `validateMapping` (setiap aturan).
- `reducer` (`mapping-reducer.test.ts`): sukses menambah versi + tepat 1 audit; versi bertambah per sumber, terpisah antar sumber; ditolak pada konfigurasi identik, proyek tidak aktif, snapshot bukan `siap_dipetakan`, snapshot milik sumber lain; id tak dikenal tidak melempar.
- `permissions`: matriks di atas.
- Verifikasi visual manual di browser (1280px dan 1024px).

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/mapping.ts` + `mapping.test.ts` + `mapping-reducer.test.ts` (baru), `components/project/{mapping-form,preview-table,label-table}.tsx` (baru), rute `sources/[sourceId]/mapping/page.tsx` dan `mapping/versions/page.tsx` (baru), `sources/[sourceId]/page.tsx` dan `sources/page.tsx` dan `[projectId]/page.tsx` (ubah kecil).
