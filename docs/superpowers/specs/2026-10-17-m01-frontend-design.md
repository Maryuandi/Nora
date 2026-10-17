# Spec: M01 frontend (data tiruan)

Tanggal: 17 Oktober 2026. Status: menunggu review.

Acuan: [PRD M01](../../prd/m01-manajemen-proyek-akses-prd.md). Backend M01a (database, login, kewenangan) diparkir di branch `feat/m01a-foundation` dan **tidak** dipakai di sini.

## Tujuan

Sembilan layar M01 bisa dibuka, diklik, dan dinilai oleh desainer, memakai design system Nora yang pertama. Semua data tiruan; tidak ada database, login sungguhan, atau API baru.

**Berhasil bila:**

1. `pnpm dev` lalu membuka `http://localhost:3000` menampilkan aplikasi dengan sidebar dan layar daftar proyek bergaya arah visual di bawah.
2. Kesembilan layar dapat dicapai lewat navigasi, dan pemilih peran mengubah tombol yang tampil.
3. Membuat klien, proyek, atau anggota di form langsung terlihat di daftar selama sesi (hilang saat muat ulang).
4. `pnpm test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Database, login sungguhan, `authorize()`, audit sungguhan, penyimpanan permanen, mode gelap, responsif ponsel (cukup layar ≥ 1280px tanpa rusak di 1024px), dan modul selain M01.

## Arah visual

Referensi: Oneleet (gambar dari desainer, 17 Okt 2026).

| Token | Nilai |
|---|---|
| Font | Inter (lewat `next/font`), `letter-spacing: -0.01em` di seluruh aplikasi |
| Aksen | `#2F399F`; latar pudar aksen `#ECEDF8`; hover aksen sedikit lebih gelap |
| Kanvas | off-white hangat `#FBFAF9` |
| Sidebar | abu hangat `#F6F5F3`, garis `#E6E4E1` |
| Kartu | putih, garis 1px `#E6E4E1`, bayangan sangat halus, radius 8px |
| Teks | utama `#1C1B1A`, sekunder `#5E5B57`, redup `#7A7773` |
| Status | hijau `#2A9D78` (aktif / sukses), kuning `#E5A100` (ditangguhkan), abu `#C8C5C0` (draft / diarsipkan), merah `#D8402B` (berakhir / ditolak) |
| Kontrol | tinggi 32px, radius 7px; tombol utama solid aksen, lainnya putih bergaris |

Pola dari referensi:
- **Sidebar lebar:** pengalih organisasi di atas, item utama, grup berlabel huruf kapital kecil + panah yang bisa dilipat, sub-item bergaris tipis di kiri, item aktif = kotak putih bergaris dengan strip aksen 2px di kiri. Bawah: pemilih peran (lihat di bawah) dan identitas pengguna.
- **Header halaman:** judul 24px medium, baris statistik (label kapital kecil + angka), tab berikon dengan garis bawah aksen dan lencana jumlah.
- **Badge status:** pil bergaris dengan kotak warna 8px + teks.
- **Tabel padat:** header kapital kecil abu, baris dikelompokkan dengan judul grup + jumlah, avatar inisial bulat.
- **Banner info:** latar pudar aksen, ikon, teks, tautan.
- **Ikon:** Phosphor (`@phosphor-icons/react`), bobot regular untuk default, fill untuk item aktif.

## Teknologi

- Tailwind CSS v4 dengan token di atas sebagai variabel tema (`@theme`) di `app/globals.css`.
- Komponen dasar dari **Untitled UI React** versi gratis (React Aria + Tailwind v4), dipasang dengan CLI `npx untitledui@latest add <komponen>` ke `components/` sesuai struktur bawaan Untitled UI (mis. `@/components/base/buttons/button`). Dipakai untuk button, badge, input, textarea, select, dropdown, modal/dialog, tabel, tabs, dan avatar. Warna brand Untitled UI diset ke aksen `#2F399F`; gaya kanvas, sidebar, dan kartu tetap mengikuti arah Oneleet. Komponen yang tidak tersedia gratis ditulis sendiri di atas React Aria dengan token yang sama. Ikon Phosphor dipasang ke prop `iconLeading`/`iconTrailing`.
- Validasi form: skema Zod (paket `zod` yang sudah ada), pesan per kolom.
- Copy UI berbahasa Indonesia, sentence case.

## Data tiruan

- `lib/mock/data.ts`: 3 klien, 5 proyek (satu tiap status), 8 pengguna, keanggotaan dengan ketiga peran, ±40 audit event. Nama dan konteks dari PRD (mis. PT Contoh Manufaktur, data BPI 2019; persona Rina, Dimas, Bu Sari).
- `lib/mock/store.tsx`: `MockStoreProvider` (React context + reducer) memegang data di memori sisi klien. Aksi: `createClient`, `createProject`, `changeProjectStatus` (dengan alasan), `addMember`, `changeMemberRole`, `removeMember`. Setiap aksi juga menambah audit event tiruan. Aturan dari PRD ditegakkan di reducer: nama proyek unik per klien, tanggal selesai tidak sebelum tanggal mulai, Administrator terakhir tidak bisa dicabut atau diturunkan.
- **Pemilih peran** di bawah sidebar: "Lihat sebagai" Administrator / Analis / Pemilik proses, dan pengguna aktif (Rina / Dimas / Bu Sari). Mengubah peran mengubah tombol yang tampil sesuai matriks kewenangan PRD. Pemilih ini diberi label jelas "Mode pratinjau" agar tidak disangka fitur produk.

## Layar

| # | Rute | Isi |
|---|---|---|
| 1 | `/login` | Logo, email, kata sandi, tombol masuk; satu pesan error umum. Tanpa sidebar. Login tiruan langsung ke `/`. |
| 2 | `/` | Daftar proyek: statistik (aktif, kontrak segera berakhir, anggota), tab status berjumlah, banner kontrak berakhir ≤ 14 hari, grid kartu proyek (nama, klien, badge status, badge peran, periode, avatar anggota, aktivitas terakhir). Keadaan kosong: "Belum ada proyek" + petunjuk menghubungi Administrator. |
| 3 | `/clients/new` | Form klien: nama, sektor, kontak. |
| 4 | `/projects/new` | Form proyek: klien (pilih), nama, deskripsi, cakupan proses (nama proses, aktivitas awal/akhir indikatif), tanggal mulai/selesai kontrak, kebijakan retensi. Disimpan sebagai `draft`. |
| 5 | `/projects/[projectId]` | Ringkasan: header proyek (nama, klien, badge status, periode), tab (Ringkasan, Anggota, Audit log, Pengaturan), kartu anggota, sumber data (keadaan kosong "Tersedia di M02"), analisis terakhir (kosong), 20 aktivitas audit terbaru. |
| 6 | `/projects/[projectId]/members` | Tabel anggota dikelompokkan per peran; tambah anggota (dialog: email + peran) yang menampilkan tautan aktivasi untuk disalin; ubah peran; cabut (dengan konfirmasi). |
| 7 | `/projects/[projectId]/settings` | Status proyek: alur `draft → aktif → ditangguhkan/berakhir → diarsipkan`, tombol aksi sesuai status, kolom alasan wajib, riwayat perubahan status. |
| 8 | `/projects/[projectId]/audit` | Tabel audit: waktu, pelaku, aksi, objek, hasil (badge sukses/ditolak/gagal); filter hasil dan pencarian. |
| 9 | `/activate` | Setel kata sandi dari tautan undangan (kata sandi + konfirmasi, minimal 12 karakter). Tanpa sidebar. |

Proyek yang tidak ada atau pengguna pratinjau bukan anggotanya menampilkan halaman "Tidak ditemukan" (bukan "akses ditolak"), sesuai PRD.

Halaman skeleton lama (`/m01`…`/m13`, `/health`) tetap ada; daftar modul pindah dari beranda ke tautan "Modul" di sidebar.

## Matriks tombol per peran (dari PRD)

| Aksi UI | Administrator | Analis | Pemilik proses |
|---|---|---|---|
| Buat klien, buat proyek | ✓ | — | — |
| Ubah status proyek | ✓ | — | — |
| Tambah, ubah peran, cabut anggota | ✓ | — | — |
| Lihat anggota dan audit log | ✓ | ✓ (baca) | ✓ (baca) |

## Tes

- **Vitest (reducer):** nama proyek duplikat dalam satu klien ditolak; tanggal selesai sebelum mulai ditolak; Administrator terakhir tidak bisa dicabut/diturunkan; setiap aksi menambah satu audit event; perubahan status tanpa alasan ditolak; transisi status yang tidak valid (mis. `diarsipkan → aktif`) ditolak.
- **Vitest (matriks tombol):** fungsi `can(role, uiAction)` sama persis dengan tabel di atas.
- **Pemeriksaan visual:** setiap layar dibuka di preview browser dan di-screenshot untuk dinilai desainer.

## Asumsi

- Desainer menilai di layar desktop.
- Data tiruan cukup realistis untuk demo; tidak ada data pribadi sungguhan.
- Saat backend M01a digabung nanti, `MockStoreProvider` diganti panggilan server; komponen layar tidak bergantung langsung pada bentuk store selain lewat hook `useMock…`.
