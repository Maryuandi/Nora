# Spec: M04c frontend, Aturan terstruktur (data tiruan)

Tanggal: 17 Oktober 2026. Status: menunggu review.

Acuan: [PRD M04](../../prd/m04-konteks-bisnis-aturan-katalog-prd.md), Story 3 dan 7 (sebagian), Fitur 3. Dibangun di atas M03a frontend (`feat/m03a-frontend`): label kanonis dari pemetaan terbaru sumber, lapisan tiruan `apps/web/lib/mock/`, komponen Untitled UI, token Nora. M04 dipecah: M04a dokumen + kalender, M04b definisi proses, **M04c aturan terstruktur (spec ini)**, M04d BPMN, M04e katalog, M04f paket konteks. Tidak ada backend atau penyimpanan permanen.

## Tujuan

Analis menulis aturan yang dapat diperiksa mesin (bukan teks bebas), melihat pratinjau dampaknya pada data, lalu meninjau dan menyetujuinya. Aturan tanpa rujukan sumber tidak dapat disetujui. Eksekusi nyata ada di M06; di sini hanya definisi, pratinjau, dan alur status.

**Berhasil bila:**

1. Proyek punya tab "Konteks" dengan sub-navigasi "Aturan"; daftar, formulir, dan detail aturan dapat dicapai lewat navigasi.
2. Analis dapat membuat aturan kelima jenis, melihat pratinjau langsung, mengajukan tinjauan, menyetujui, dan menandai usang; setiap aksi tercatat di audit log.
3. Mengubah aturan yang sudah ditinjau atau disetujui membuat versi baru; versi lama menjadi `usang` saat versi baru disetujui.
4. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Eksekusi aturan dan temuan kepatuhan (M06), dokumen acuan sungguhan dan kalender (M04a; rujukan sumber sementara berupa teks), batas proses/rework/populasi (M04b), BPMN (M04d), katalog (M04e), paket konteks dan pembekuan (M04f), aturan berbasis ekspresi bebas, aturan per kasus/kelompok pengecualian, backend, layar ponsel.

## Peran dan izin (mengikuti PRD M04)

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `rule.view` | ya | ya | ya |
| `rule.edit` (buat, ubah, ajukan, setujui, kembalikan, usangkan) | tidak | ya | tidak |
| `rule.confirm` (tandai dikonfirmasi klien) | tidak | tidak | ya |

Semua aksi tulis hanya pada proyek `aktif` (`acceptsData`). Perhatikan: berbeda dari M02/M03 (di sana Administrator ikut), PRD M04 menyatakan hanya Analis yang membuat, menyetujui, dan membekukan konfigurasi. Di status proyek lain, tombol disembunyikan dengan penjelasan seperti M02.

## Model data tiruan (`lib/mock/types.ts`)

```ts
type RuleType = "sla" | "urutan" | "wajib" | "terlarang" | "pemisahan_tugas";
type RuleStatus = "draf" | "ditinjau" | "disetujui" | "usang";

type RuleParams =
  | { type: "sla"; from: string; to: string; limit: number; unit: "kalender" | "kerja" }
  | { type: "urutan"; before: string; after: string }
  | { type: "wajib"; activity: string }
  | { type: "terlarang"; activity: string }
  | { type: "pemisahan_tugas"; activityA: string; activityB: string };

interface RuleScope { attribute: string; op: "=" | "!=" | ">" | "<"; value: string }
interface RuleSourceRef { docTitle: string; section: string; quote: string }

interface RuleVersion {
  id: string; ruleKey: string; projectId: string; version: number; // 1, 2, ... per ruleKey
  name: string; description: string;
  params: RuleParams;
  scope: RuleScope | null;
  effectiveFrom: string; effectiveTo: string | null;   // YYYY-MM-DD
  source: RuleSourceRef;
  status: RuleStatus;
  clientConfirmed: boolean;
  createdBy: string; createdAt: string;
  approvedBy?: string; approvedAt?: string;
}
```

`MockState` bertambah `rules: RuleVersion[]`. Data awal untuk `p-p2p` (aktivitas memakai label kanonis dari seed M03a): SLA "Create PO ke Goods Receipt ≤ 14 hari kerja" (`v1` `usang`, `v2` `disetujui`, dikonfirmasi klien), Urutan "Goods Receipt sebelum Clear Invoice" (`ditinjau` v1), Pemisahan tugas "Pembuat PO bukan penyetuju" (`draf` v1), Aktivitas terlarang (`draf` v1). Proyek lain tanpa aturan.

## Aturan murni (`lib/mock/rules.ts`, baru, tanpa React)

- `RULE_TYPE_LABEL: Record<RuleType, string>`: "SLA durasi", "Urutan", "Aktivitas wajib", "Aktivitas terlarang", "Pemisahan tugas".
- `canonicalLabels(state: MockState, sourceId: string): string[]`: label kanonis dari pemetaan terbaru sumber (`activityLabels(snapshot)` dengan aturan label dipakai: label dikecualikan dibuang, di-rename memakai kanonis, label tanpa aturan memakai nama asli di-trim; unik, terurut abjad); `[]` bila sumber belum punya pemetaan.
- `validateRule(input: RuleInput, labels: string[]): { field: string; message: string }[]`. `RuleInput` = semua bidang `RuleVersion` yang diisi pengguna (name, description, params, scope, effectiveFrom, effectiveTo, source). Aturan: `name` wajib (trim), `params` lengkap (aktivitas harus ada di `labels`, pesan "Aktivitas tidak ada di label kanonis"), SLA `limit` bilangan > 0 dan `from ≠ to`, urutan `before ≠ after`, pemisahan tugas `activityA ≠ activityB`, `effectiveFrom` tanggal valid, `effectiveTo` kosong atau ≥ `effectiveFrom`, scope bila ada harus berisi atribut dan nilai tidak kosong. **Rujukan sumber tidak diperiksa di sini** (hanya saat persetujuan, lihat reducer) karena draf boleh tanpa rujukan.
- `previewRule(input: { params; scope }, dataset: { snapshot: Snapshot; mapping: MappingVersion } | null): RulePreview` dengan `RulePreview = { status: "ok"; evaluable: number; compliant: number; nonCompliant: number } | { status: "tidak_dapat_dievaluasi"; reason: string }`. Tanpa dataset: `tidak_dapat_dievaluasi` "Belum ada pemetaan data (M03)". Pemisahan tugas tanpa kolom berperan `resource` pada pemetaan: "Kolom sumber daya belum dipetakan (M03)". Scope dengan atribut yang bukan kolom berperan `case_attr`/`event_attr` pada pemetaan: "Atribut {nama} belum dipetakan (M03)". Selain itu angka deterministik dari hash nama jenis + parameter + `snapshot.checksum`: kasus ≈ `round(stats.rows / 6)`, `evaluable` 60% sampai 100% dari kasus, `compliant` 55% sampai 97% dari `evaluable`, `nonCompliant` = sisanya; ketiganya bilangan bulat.
- `nextStatuses(status: RuleStatus): RuleStatus[]`: `draf → [ditinjau]`, `ditinjau → [draf, disetujui]`, `disetujui → [usang]`, `usang → []`.
- `latestByKey(rules: RuleVersion[]): RuleVersion[]`: versi tertinggi per `ruleKey`, terurut tanggal ubah terbaru dulu (seri sama dibalik menurut indeks).

## Aturan reducer (`lib/mock/reducer.ts`)

Aksi baru (semua: proyek harus `aktif`; tidak melempar; id tak dikenal mengembalikan galat string; tepat satu `AuditEvent` per sukses):

- `saveRule { projectId; ruleKey?: string; input: RuleInput }`: menjalankan `validateRule` (label kanonis dari sumber mana pun di proyek yang punya pemetaan; gabungan). Tanpa `ruleKey`: membuat `ruleKey` baru, `v1`, `draf`. Dengan `ruleKey`: bila versi terbaru berstatus `draf`, memperbarui di tempat; bila `ditinjau`/`disetujui`, membuat versi baru `draf` (`version + 1`, `clientConfirmed: false`); bila `usang` galat "Aturan usang tidak dapat diubah". Konfigurasi identik dengan versi terbaru: galat "Tidak ada perubahan". Audit `aturan.simpan`, objectType `Aturan`, label `{nama} v{n}`. Hasil `{ state, ruleId }`.
- `changeRuleStatus { ruleId; to: RuleStatus }`: hanya transisi dari `nextStatuses`. Ke `ditinjau`: input masih lolos `validateRule`. Ke `disetujui`: **rujukan sumber lengkap** (`docTitle`, `section`, `quote` tidak kosong, pesan "Aturan tanpa rujukan sumber tidak dapat disetujui") dan `previewRule` untuk dataset proyek **bukan** `tidak_dapat_dievaluasi` (pesan "Aturan tidak dapat dievaluasi: {alasan}"). Setelah disetujui: `approvedBy/At` terisi, dan semua versi lain dengan `ruleKey` sama berstatus `disetujui` menjadi `usang` (tanpa audit tambahan; satu audit `aturan.setujui`). Audit lain: `aturan.ajukan` (ke ditinjau), `aturan.kembalikan` (ditinjau → draf), `aturan.usangkan` (disetujui → usang).
- `confirmRuleClient { ruleId }`: hanya untuk versi `ditinjau` atau `disetujui` yang belum dikonfirmasi; set `clientConfirmed = true`; audit `aturan.konfirmasi_klien`. Mengubah aturan (versi baru) mereset konfirmasi.

Helper terekspor: `rulesForProject(s, projectId)`, `ruleVersions(s, ruleKey)` (terbaru dulu). Dataset pratinjau proyek: sumber pertama (urutan `state.sources`) dari proyek itu yang punya pemetaan dan snapshot `siap_dipetakan`; helper `previewDataset(s, projectId)` mengembalikan `{ sourceId, snapshot, mapping } | null`.

## Layar

Semua di bawah `projects/[projectId]/context/`. Tab proyek baru "Konteks" (ikon `Scales`, hitungan = jumlah aturan terbaru per kunci) di antara "Sumber data" dan "Anggota", aktif untuk path yang diawali `/context`. Komponen `ContextTabs` (sub-navigasi, saat ini hanya "Aturan"). Bukan anggota: `NotFoundPanel`.

1. **`/context/rules`**, daftar aturan (versi terbaru per `ruleKey`): nama (tautan), jenis, status (pil ikon + teks), versi, masa berlaku, rujukan sumber (judul + bagian, terpotong), lencana "Dikonfirmasi klien", ringkasan pratinjau ("{patuh}/{dievaluasi} patuh" atau "tidak dapat dievaluasi"). Filter status (Semua, Draf, Ditinjau, Disetujui, Usang) dengan jumlah. Tombol "Aturan baru" bila `can("rule.edit")` dan `acceptsData`. Keadaan kosong.
2. **`/context/rules/new`** dan **`/context/rules/[ruleKey]/edit`**, formulir: jenis (select, terkunci saat edit), nama, deskripsi bisnis, bidang parameter sesuai jenis (select aktivitas dari `canonicalLabels` gabungan; tanpa pemetaan: galat bidang + tautan ke Pemetaan), satuan dan batas untuk SLA, cakupan opsional (atribut dari kolom `case_attr`/`event_attr` pada pemetaan, operator, nilai), berlaku mulai/akhir, rujukan sumber (judul dokumen, bagian/halaman, kutipan). **Kartu pratinjau** di samping memakai `previewRule`, diperbarui langsung: tiga angka + batang proporsi, atau pesan "tidak dapat dievaluasi" dengan alasan; keterangan "Contoh tiruan dari {sumber}". Galat per bidang tampil setelah percobaan simpan pertama. Edit aturan non-draf diberi banner "Menyimpan akan membuat versi baru (v{n+1})".
3. **`/context/rules/[ruleKey]`**, detail: judul + status + versi; ringkasan aturan dalam kalimat bisnis (mis. "Dari Create Purchase Order Item sampai Record Goods Receipt tidak lebih dari 14 hari kerja"); parameter, cakupan, masa berlaku, rujukan sumber (kutipan dirender sebagai teks); kartu pratinjau; riwayat versi (tabel v, status, tanggal, pembuat, disetujui oleh); bila memilih versi lama, tampilan baca-saja. Tombol aksi menurut `nextStatuses` dan izin: "Ajukan tinjauan", "Kembalikan ke draf", "Setujui", "Tandai usang" (dialog konfirmasi), "Ubah" (menuju edit), dan untuk Pemilik proses "Konfirmasi klien". Galat reducer tampil di Banner. Penjelasan bila peran boleh tetapi proyek tidak aktif.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Pill/Card/Table/NoraModal/Banner yang ada; semua string data dirender sebagai teks, nilai panjang terpotong dengan `title`.

## Pengujian

- `rules.test.ts`: `canonicalLabels` (aturan label diterapkan, dikecualikan dibuang, tanpa pemetaan kosong); `validateRule` setiap aturan (termasuk aktivitas tak ada di label, SLA limit 0 dan A=B, tanggal berakhir sebelum mulai, scope tanpa nilai); `previewRule` (deterministik, jumlah patuh + tidak patuh = dievaluasi, tanpa dataset/tanpa kolom resource/atribut tak dipetakan → tidak dapat dievaluasi, aktivitas tak terpengaruh urutan masukan); `nextStatuses`; `latestByKey`.
- `rules-reducer.test.ts`: buat aturan baru `v1 draf` + 1 audit; edit draf di tempat; edit `ditinjau` membuat versi baru `draf` dan konfirmasi klien tereset; edit usang ditolak; konfigurasi identik ditolak; ajukan, kembalikan, setujui, usangkan masing-masing 1 audit; setujui tanpa rujukan ditolak; setujui aturan tidak dapat dievaluasi ditolak; setujui v2 membuat v1 `usang`; `confirmRuleClient` hanya pada ditinjau/disetujui; proyek tidak aktif ditolak; id tak dikenal tidak melempar.
- `permissions.test.ts`: matriks di atas.
- Verifikasi manual di browser (1280px dan 1024px), termasuk tampilan Pemilik proses dan Administrator.

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/rules.ts` + `rules.test.ts` + `rules-reducer.test.ts` (baru), `components/project/{rule-form,rule-preview,rule-status,context-tabs}.tsx` (baru), rute `context/rules/page.tsx`, `context/rules/new/page.tsx`, `context/rules/[ruleKey]/page.tsx`, `context/rules/[ruleKey]/edit/page.tsx` (baru), `[projectId]/layout.tsx` (tab "Konteks").
