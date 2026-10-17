# Spec: M02 frontend (data tiruan)

Tanggal: 17 Oktober 2026. Status: menunggu review.

Acuan: [PRD M02](../../prd/m02-integrasi-sumber-sinkronisasi-prd.md). Dibangun di atas M01 frontend (`feat/m01-frontend`): lapisan data tiruan `apps/web/lib/mock/`, komponen Untitled UI, token Nora. Tidak ada backend, object storage, atau Temporal.

## Tujuan

Analis dapat memasukkan file log ke proyek, memeriksa hasilnya, dan tahu data mana yang dipakai serta seberapa segar. Semua data tiruan, hilang saat muat ulang.

**Berhasil bila:**

1. Proyek memiliki tab "Sumber data" dan kelima layar di bawah bisa dicapai lewat navigasi.
2. Menambah sumber dan mengunggah file langsung muncul di daftar dan riwayat selama sesi.
3. Tiga hasil unggah (siap dipetakan, perlu tinjauan, gagal) dan deteksi file kembar dapat didemokan lewat nama file.
4. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Penyimpangan dari PRD (disengaja)

PRD membatasi unggah/konfirmasi/batal ke Administrator. Atas keputusan desainer (fokus business analyst, 17 Okt 2026), **Analis dan Administrator** boleh melakukannya; Pemilik proses hanya melihat. Catatan ini harus dibawa ke PRD M02 sebelum backend dibangun.

## Di luar cakupan

Konektor DB/API, jadwal sinkronisasi, webhook, unggahan resumable, unduh file asli, pemetaan kolom (M03), backend apa pun, mode gelap, layar ponsel.

## Model data tiruan (`lib/mock/types.ts`)

```ts
type SnapshotStatus = "menunggu_unggah" | "memvalidasi" | "siap_dipetakan" | "perlu_tinjauan" | "gagal" | "dibatalkan";

interface Source { id; projectId; name; kind: "file"; createdAt; createdBy }

interface Snapshot {
  id; sourceId; projectId;
  fileName; sizeBytes; format: "csv" | "xes" | "xes.gz" | "zip";
  checksum: string;            // 12 hex tiruan dari nama+ukuran
  uploadedBy; uploadedAt;
  status: SnapshotStatus;
  failureReason?: string;
  stats?: { rows; rejected; encoding; delimiter; timeFrom; timeTo; latestEventAt;
            newEvents; duplicateEvents; conflictEvents };
  columns?: { name; samples: string[] }[];
  preview?: string[][];        // maks 100 baris
  errors?: { kind: string; count: number; examples: { row: number; text: string }[] }[];
}
```

`MockState` bertambah `sources: Source[]` dan `snapshots: Snapshot[]`. Data awal: proyek `p-p2p` punya dua sumber (satu segar, satu usang > 30 hari dari `MOCK_TODAY`) dengan beberapa snapshot di berbagai status; proyek lain boleh kosong.

## Izin (`lib/mock/permissions.ts`)

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `source.view` | ya | ya | ya |
| `source.create` | ya | ya | tidak |
| `snapshot.upload` | ya | ya | tidak |
| `snapshot.confirm` | ya | ya | tidak |
| `snapshot.cancel` | ya | ya | tidak |

Unggah, tambah sumber, konfirmasi hanya saat proyek `aktif`. Di status lain tombol disembunyikan dan halaman menjelaskan alasannya ("Proyek berstatus Ditangguhkan; unggah dinonaktifkan").

## Aturan reducer (`lib/mock/reducer.ts`, murni, tanpa throw)

Aksi baru: `createSource`, `uploadSnapshot`, `confirmSnapshot`, `cancelSnapshot`. Masing-masing mengembalikan pesan galat string atau `null`, dan menambah tepat satu `AuditEvent` (aksi `sumber.tambah`, `snapshot.unggah`, `snapshot.konfirmasi`, `snapshot.batal`).

`uploadSnapshot({ sourceId, fileName, sizeBytes })` menentukan hasil secara deterministik:

1. Format dari ekstensi (`.csv`, `.xes`, `.xes.gz`, `.zip`); lainnya: galat "Format tidak didukung".
2. `sizeBytes > 500 MB`: galat "Ukuran melebihi 500 MB".
3. Checksum = hash 12 heks dari `fileName + sizeBytes`. Bila sudah ada snapshot non-batal pada sumber yang sama dengan checksum sama: tidak membuat snapshot, mengembalikan sinyal `duplicateOf: snapshotId` agar UI menawarkan memakai snapshot lama.
4. Nama mengandung `gagal`: status `gagal` dengan `failureReason` ("Isi file bukan CSV yang valid").
5. Nama mengandung `rusak`: `rejected` = 8% dari baris, status `perlu_tinjauan`.
6. Selain itu: status `siap_dipetakan`, `rejected` ≤ 1%.
7. Jumlah baris = `round(sizeBytes / 220)`. Bila sumber sudah punya snapshot sebelumnya, `duplicateEvents` = 40% baris dan `conflictEvents` = 0,2%, sisanya `newEvents`; bila sumber baru, semua event baru.

`confirmSnapshot` hanya sah dari `perlu_tinjauan` (menjadi `siap_dipetakan`). `cancelSnapshot` sah dari `memvalidasi`, `perlu_tinjauan`, `siap_dipetakan` (menjadi `dibatalkan`; catatan tetap ada). Transisi lain: galat.

Kesegaran: `daysSince(latestEventAt)` terhadap `MOCK_TODAY`; > 30 hari = "Usang".

## Layar

Semua di bawah `(app)/projects/[projectId]/`, memakai header proyek yang sudah ada dengan tab baru "Sumber data" (ikon `Database`, lencana jumlah sumber). Bukan anggota proyek: `NotFoundPanel` seperti M01.

1. **`/sources`**: tabel sumber (nama, jenis, jumlah snapshot, impor terakhir, event terbaru, kesegaran). Tombol "Tambah sumber" (dialog satu bidang nama, wajib). Baris menuju detail. Keadaan kosong dengan ajakan menambah sumber.
2. **`/sources/[sourceId]`**: ringkasan sumber + tombol "Unggah file" + tabel riwayat snapshot (pengunggah, waktu, ukuran, checksum 8 karakter, status, baru/duplikat/ditolak). Baris menuju detail snapshot.
3. **Dialog unggah**: area pilih file (`<input type="file">`, hanya nama dan ukuran dibaca), daftar format dan batas ukuran, galat per bidang. Bila duplikat: panel "File ini identik dengan snapshot {tanggal}" dengan tombol "Pakai snapshot lama" (menuju detail snapshot lama) dan "Tutup". Sukses: tampil status `memvalidasi` selama 1,2 detik (timer di UI), lalu menuju detail snapshot.
4. **`/snapshots/[snapshotId]`**: lencana status; kartu statistik (baris, ditolak + persen, encoding, delimiter, rentang waktu, event terbaru); ringkasan impor ulang (baru / duplikat dilewati / konflik); tabel kolom + contoh nilai; pratinjau (tabel bergulir, 100 baris pertama, teks dirender sebagai teks, bukan HTML); galat per jenis dengan contoh dan nomor baris (maks 50). Banner `perlu_tinjauan` dengan tombol "Konfirmasi dan teruskan". Tombol "Batalkan snapshot" (dialog konfirmasi). `gagal`: tampil alasan, tanpa pratinjau.
5. **Kartu "Sumber data" di Ringkasan** (`[projectId]/page.tsx`): menampilkan jumlah sumber, snapshot siap, dan sumber terbaru + lencana kesegaran, menuju `/sources`. Kosong tetap menampilkan keadaan kosong yang ada.

Teks, istilah, dan gaya mengikuti M01 (Bahasa Indonesia, token Nora, kontrol 32px, ikon Phosphor, judul 20px). Lencana status snapshot: ikon + teks dalam pil, warna sesuai tabel status Nora.

## Pengujian

- `reducer`: tiap aturan unggah (format, ukuran, duplikat, `gagal`, `rusak`, normal, hitungan impor ulang), transisi sah/tidak sah konfirmasi dan batal, tepat satu audit per aksi, tidak ada throw.
- `permissions`: matriks di atas.
- Kesegaran: batas tepat 30 hari.
- Komponen: validasi dialog unggah lewat DOM (format salah, ukuran, duplikat). Verifikasi visual manual di browser.

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/sources.test.ts` (baru), `lib/format.ts` (bytes, hari), `components/project/{source-table,snapshot-status,upload-dialog}.tsx` (baru), rute `sources/page.tsx`, `sources/[sourceId]/page.tsx`, `snapshots/[snapshotId]/page.tsx` (baru), `[projectId]/layout.tsx` dan `page.tsx` (ubah).
