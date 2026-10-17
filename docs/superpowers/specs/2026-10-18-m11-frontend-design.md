# Spec: M11 frontend, Investigasi, kolaborasi, dan review (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M11](../../prd/m11-investigasi-kolaborasi-review-prd.md), Story 1–7, Fitur 1–6. Dibangun di atas M10a frontend (`feat/m10a-frontend`): lapisan tiruan `apps/web/lib/mock/`, komponen Untitled UI, token Nora. Satu spec, satu plan (keputusan pengguna: "semua sekaligus"). Tidak ada backend, penyimpanan permanen, unggah file nyata, real-time, atau email. Branch `feat/m11-frontend` dari `feat/m10a-frontend`, worktree `nora-m11`.

## Tujuan

Analis membuka workspace dari satu temuan, mencatat bukti lapangan, berdiskusi dengan pemilik proses, meninjau keluaran model, lalu pemilik proses menetapkan keputusan berjejak. Ketika analisis baru mengubah dasar keputusan, keputusan ditandai `perlu_ditinjau_ulang`.

**Berhasil bila:**

1. Proyek punya tab "Investigasi"; daftar workspace dan detail dapat dicapai lewat navigasi.
2. Demo juri (definisi MVP PRD): Dimas membuka workspace dari `finding_42`, mengoreksi satu hasil Jev, menyetujui draf interpretasi M10, mengusulkan uji coba; Sari menetapkan `dipilih` dengan alasan; tombol "Simulasikan analisis baru" membuat keputusan itu ditandai `perlu_ditinjau_ulang` beserta ringkasan perubahan.
3. `siap_diputuskan` tidak dapat dipilih selama ada keluaran model tertaut yang belum ditinjau.
4. Matriks kewenangan keputusan ditegakkan di reducer dan di UI (tombol disembunyikan, reducer menolak).
5. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Unggah file nyata (bukti tambahan = nama berkas tiruan atau tautan, tanpa pemeriksaan isi), kolaborasi real-time, polling, email/chat, alur persetujuan bertingkat, proyeksi ke M07 (hanya diakui di teks bantuan), objek M05/M06/M08/M09 yang sebenarnya (ditiru lewat data awal), layar ponsel. Hasil Jev (M08) belum ada di branch ini; tautan `hasil_jev` menunjuk item bukti `kind: "hasil_jev"` pada temuan (mis. `jev_42`).

## Peran dan izin (`permissions.ts`)

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `investigation.view` | ya | ya | ya |
| `investigation.create` / `investigation.link` / `investigation.status` | tidak | ya | tidak |
| `note.add` (wawancara, bukti, hipotesis, pertanyaan) | tidak | ya | wawancara dan bukti saja |
| `comment.add` | tidak | ya | ya |
| `review.jev` / `review.draft` | tidak | ya | tidak |
| `decision.analytic` (`perlu_investigasi`, `ditolak`, `digantikan`, `usulan_uji_coba`) | tidak | ya | tidak |
| `decision.select` (`dipilih`) | tidak | tidak | ya |
| `proposal.create` (usulan ke M04) | tidak | ya | ya |

Semua aksi tulis hanya pada proyek `aktif` (`acceptsData`); komentar juga. Bukan anggota proyek: `NotFoundPanel`. Administrator hanya membaca. `note.add` dan `comment.add` memakai satu `can()` dengan parameter jenis untuk catatan: `can(role, "note.add")` untuk analis, `can(role, "note.add.field")` untuk pemilik proses (wawancara/bukti).

## Model data tiruan (`lib/mock/types.ts`)

```ts
type InvestigationStatus = "terbuka" | "menunggu_informasi" | "siap_diputuskan" | "selesai";
type LinkKind = "temuan" | "kasus" | "aturan" | "kandidat" | "hasil_jev" | "interpretasi" | "skenario" | "uji_coba";
type NoteKind = "wawancara" | "bukti" | "hipotesis" | "pertanyaan";
type HypothesisState = "belum_diuji" | "didukung" | "dibantah";
type DecisionStatus = "perlu_investigasi" | "usulan_uji_coba" | "dipilih" | "ditolak" | "digantikan";
type RejectReason = "klaim_tidak_didukung" | "bahasa_tidak_sesuai" | "informasi_kurang";

interface Investigation {
  id: string; projectId: string; title: string; question: string;
  originFindingId: string | null;
  status: InvestigationStatus;
  ownerId: string; memberIds: string[];
  createdAt: string;
}
interface InvestigationLink {
  id: string; investigationId: string; kind: LinkKind; targetId: string;
  linkedVersion: string;            // versi objek saat ditautkan, mis. "v2" atau "analisis-3"
  createdBy: string; createdAt: string;
}
interface InvestigationNote {
  id: string; investigationId: string; kind: NoteKind; title: string; body: string;
  // wawancara
  interviewee?: string; intervieweeRole?: string; interviewDate?: string; initialsOnly?: boolean;
  // bukti: nama berkas tiruan atau tautan
  attachment?: { type: "file" | "link"; label: string; sizeBytes?: number };
  // hipotesis
  hypothesisState?: HypothesisState; findingId?: string; supportingLinkIds?: string[];
  // pertanyaan
  assigneeId?: string; questionState?: "terbuka" | "terjawab";
  createdBy: string; createdAt: string;
}
interface Comment {
  id: string; investigationId: string; targetLinkId: string | null; // null = pada workspace
  parentId: string | null; body: string; mentions: string[]; // userId
  resolved: boolean; createdBy: string; createdAt: string;
}
interface Notification { id: string; userId: string; projectId: string; text: string; href: string; read: boolean; at: string }

interface ModelReview {
  id: string; investigationId: string; linkId: string;   // tautan hasil_jev atau interpretasi
  outcome: "dikonfirmasi" | "dikoreksi" | "disetujui" | "ditolak";
  correctedVerdict?: string; reason: string;              // wajib untuk dikoreksi dan ditolak
  rejectCode?: RejectReason; forEvalSet: boolean;
  by: string; at: string;
}

interface EvidenceSnapshot { datasetVersion: string; contextPackage: string; analysis: string; evidencePackage: string; narrativeVersion: string | null; metricValues: Record<string, number>; ruleVersions: Record<string, string> }
interface Decision {
  id: string; investigationId: string; projectId: string;
  targetLinkId: string;               // tautan kandidat
  version: number;                    // 1, 2, ... per (investigationId, targetLinkId)
  status: DecisionStatus;
  replacedByLinkId?: string;          // wajib bila digantikan
  reason: string; byId: string; byRole: Role; at: string;
  snapshot: EvidenceSnapshot;
}
interface RevalidationFlag { id: string; decisionId: string; summary: string[]; at: string; clearedBy?: string; clearedAt?: string }

interface ContextProposal { id: string; investigationId: string; ruleId: string; note: string; by: string; at: string }

interface AnalysisState { projectId: string; datasetVersion: string; contextPackage: string; analysis: string; evidencePackage: string; metricValues: Record<string, number>; ruleVersions: Record<string, string> }
```

`MockState` bertambah: `investigations`, `links`, `notes`, `comments`, `notifications`, `reviews`, `decisions`, `flags`, `proposals`, `analysisStates: AnalysisState[]`.

Kandidat adalah item `kind: "kandidat"` pada `finding.evidence` (M10a). Tautan `kandidat` menunjuk `evidence.id`.

## Data awal (`data.ts`)

Hanya `p-p2p`. `analysisStates`: `datasetVersion: "ds-2"`, `contextPackage: "ctx-4"`, `analysis: "analisis-3"`, `evidencePackage: "bukti-7"`, `metricValues: { "finding_42.p90_days": 18.4 }`, `ruleVersions: { "r-sla": "v2" }`.

| Objek | Isi |
|---|---|
| `Investigation` `inv-1` | "Antrean persetujuan PO" dari `finding_42`, status `terbuka`, pemilik Dimas, anggota Dimas dan Sari |
| Tautan `inv-1` | temuan `finding_42`, aturan `r-sla`, dua kandidat (satu `validated`), hasil Jev `jev_42`, interpretasi seed `finding_42` (lolos) |
| Catatan | satu wawancara (Sari, tanda "informasi kualitatif"), satu hipotesis `belum_diuji`, satu pertanyaan terbuka untuk Dimas |
| Komentar | satu utas dari Sari dengan sebutan `@Dimas` |
| `Investigation` `inv-2` | "Rework verifikasi faktur" dari `finding_57`, `selesai`, dengan keputusan `ditolak` v1 sebagai contoh riwayat; tanpa penanda |

## Aturan murni (`lib/mock/investigation.ts`, baru, tanpa React)

- `unreviewedModelOutputs(state, investigationId): InvestigationLink[]`: tautan `hasil_jev` dan `interpretasi` tanpa `ModelReview` terakhir yang final (`dikonfirmasi|dikoreksi|disetujui|ditolak`).
- `canSetStatus(state, investigationId, to): string | null`: galat bila `to = siap_diputuskan` dan ada keluaran belum ditinjau; bila `selesai` tanpa keputusan apa pun.
- `canDecide(role: Role, status: DecisionStatus): boolean`: sesuai tabel izin (`dipilih` hanya `pemilik_proses`; sisanya hanya `analis`).
- `validateDecision(state, input): string | null`: alasan tidak kosong setelah trim; `digantikan` wajib `replacedByLinkId` berbeda dari target dan bertipe kandidat; target adalah tautan kandidat pada workspace itu; `dipilih` dan `usulan_uji_coba` hanya untuk kandidat `validated`; workspace berstatus `siap_diputuskan` (keputusan lain `perlu_investigasi` boleh kapan saja).
- `snapshotFor(state, projectId, narrativeVersion): EvidenceSnapshot`: menyalin `AnalysisState` proyek.
- `latestDecisions(state, investigationId): Decision[]`: versi tertinggi per target; `decisionHistory(state, investigationId, targetLinkId)`: semua versi, terbaru dulu.
- `detectRevalidation(decision, analysisState, ruleLabels): string[]`: bandingkan `snapshot` dengan `AnalysisState` kini; kembalikan ringkasan: `"Dataset ds-2 → ds-3"`, `"Paket konteks ctx-4 → ctx-5"`, `"Aturan r-sla v2 → v3"`, `"P90 berubah dari 18,4 ke 22,1 hari kerja"` (nilai metrik berubah melewati ambang 5% relatif). Daftar kosong berarti tidak ada penanda.
- `linkFreshness(state, link): { latest: string; stale: boolean }`: bandingkan `linkedVersion` dengan versi objek kini; dipakai lencana "versi lebih baru tersedia".
- `extractMentions(body, members): string[]`: ambil `@Nama` yang cocok nama depan anggota proyek (tidak peka huruf besar-kecil); sebutan tidak dikenal diabaikan.

## Aturan reducer (`lib/mock/reducer.ts`)

Semua aksi mengembalikan `{ state, error? }` dan tidak pernah melempar; semua aksi tulis cek peran viewer lewat keanggotaan proyek dan `acceptsData`. Semua mencatat `AuditEvent` bertipe objek "Investigasi", "Keputusan", dst.

| Aksi | Aturan | Audit |
|---|---|---|
| `createInvestigation { projectId; title; question; findingId? }` | analis; judul dan pertanyaan wajib; dari temuan: otomatis menautkan temuan, aturan dan kandidat dari paket buktinya, dan hasil Jev serta interpretasi temuan itu bila ada; pemilik = viewer; anggota = viewer + pemilik proses proyek | `investigasi.buat` |
| `linkObject { investigationId; kind; targetId }` / `unlinkObject { linkId }` | analis; target ada di proyek; tidak boleh ganda; tidak boleh lepas tautan yang sudah punya keputusan | `investigasi.tautkan` / `investigasi.lepas` |
| `refreshLink { linkId }` | analis; `linkedVersion` ← versi kini | `investigasi.perbarui_tautan` |
| `setInvestigationStatus { investigationId; to }` | analis; `canSetStatus` | `investigasi.status` |
| `addNote { investigationId; note }` | analis semua jenis; pemilik proses hanya wawancara dan bukti; wawancara wajib narasumber dan tanggal; bukti: berkas ≤ 20 MB (`sizeBytes`) atau tautan `http(s)`; hipotesis: status awal `belum_diuji` | `investigasi.catat` |
| `setHypothesisState { noteId; state; supportingLinkIds }` | analis; `didukung|dibantah` wajib ≥ 1 tautan pendukung | `investigasi.hipotesis` |
| `setQuestionState { noteId; state }` | analis atau penanggung jawab | `investigasi.pertanyaan` |
| `addComment { investigationId; targetLinkId?; parentId?; body }` | analis atau pemilik proses; isi tidak kosong; induk satu workspace; sebutan memicu `Notification` per anggota yang disebut (bukan penulis) | `komentar.tambah` |
| `resolveComment { commentId; resolved }` | penulis atau analis; hanya komentar akar | `komentar.selesai` |
| `markNotificationsRead { }` | viewer | tanpa audit |
| `reviewJev { investigationId; linkId; outcome; correctedVerdict?; reason?; forEvalSet }` | analis; tautan `hasil_jev`; `dikoreksi` wajib `correctedVerdict` dan `reason` | `jev.konfirmasi` / `jev.koreksi` |
| `reviewDraft { investigationId; linkId; outcome; rejectCode?; reason?; forEvalSet }` | analis; tautan `interpretasi` berstatus `lolos_pemeriksaan` (draf `gagal_pemeriksaan` tidak bisa disetujui); `ditolak` wajib `rejectCode` dan `reason` | `draf.setujui` / `draf.tolak` |
| `makeDecision { investigationId; targetLinkId; status; reason; replacedByLinkId?; expectedVersion }` | `canDecide(peran viewer di proyek, status)`; `validateDecision`; **cek versi optimistis**: `expectedVersion` harus sama dengan versi terbaru target (0 bila belum ada) agar yang kedua mendapat galat "Keputusan sudah berubah, muat ulang"; membuat versi baru; `snapshot` = `snapshotFor` kini + versi narasi terakhir yang disetujui; keputusan baru menghapus penanda lama target itu (`clearedBy` = viewer) | `keputusan.tetapkan` (peran dan status di label) |
| `confirmDecision { decisionId }` | analis atau pemilik proses; hanya bila ada penanda aktif; menegaskan tanpa mengubah status: `clearedBy/At` terisi, snapshot diperbarui ke kondisi kini (versi keputusan naik, status sama, alasan "Ditegaskan setelah analisis baru") | `keputusan.tegaskan` |
| `simulateNewAnalysis { projectId }` | analis; hanya untuk demo (tombol berlabel jelas); naikkan `datasetVersion` ds-2→ds-3, `contextPackage` ctx-4→ctx-5, `analysis`, `evidencePackage`; `ruleVersions.r-sla` v2→v3; ubah metrik `finding_42.p90_days` 18,4→22,1; jalankan `detectRevalidation` untuk semua keputusan terbaru proyek, buat `RevalidationFlag` bila ringkasan tidak kosong dan belum ada penanda aktif; buat `Notification` untuk anggota workspace | `analisis.simulasi` |
| `createProposal { investigationId; ruleKey; note }` | analis atau pemilik proses; aturan dari proyek yang sama; `note` wajib; memanggil `saveRule` dengan masukan aturan terbaru dan `description = note`, lalu `changeRuleStatus` ke `ditinjau`, dan menyimpan `ContextProposal`; bila aturan terakhir sudah `draf`/`ditinjau`: galat "Sudah ada usulan berjalan" | `usulan.buat` |

Helper terekspor: `investigationsForProject(s, projectId)` (terbaru dulu), `flagsForProject(s, projectId)` (aktif saja), `notificationsFor(s, userId, projectId)`.

## Layar

Semua di bawah `projects/[projectId]/investigations/`. Tab proyek baru "Investigasi" (ikon `MagnifyingGlassPlus`, hitungan = workspace tidak `selesai`) setelah "Interpretasi"; aktif untuk path yang diawali `/investigations`. Lonceng notifikasi di `shell` (hitungan belum dibaca untuk viewer di proyek berjalan; popover berisi daftar, klik menandai dibaca dan menuju `href`).

1. **`/investigations`**:
   - Atas: banner "Perlu ditinjau ulang" bila ada penanda aktif, memuat daftar keputusan (target, status, ringkasan perubahan, tautan ke workspace) untuk Story 6.
   - Tabel workspace: judul, asal temuan, status pil, jumlah keluaran belum ditinjau, pemilik, aktivitas terakhir. Filter status. Tombol "Buat workspace" (`investigation.create` dan `acceptsData`): `NoraModal` dengan pilihan "dari temuan" (pilih temuan; judul dan pertanyaan terisi dari temuan) atau "kosong" (judul dan pertanyaan). Keadaan kosong: ajakan membuat workspace.
2. **`/investigations/[investigationId]`**: kepala (judul, pertanyaan, pil status, pemilik, anggota, peringatan "n keluaran model belum ditinjau", tombol "Ubah status" dengan galat `canSetStatus` tampil di Banner, tombol "Simulasikan analisis baru" bertanda "Demo") dan lima tab:
   - **Objek tertaut**: tabel tautan (jenis, judul, versi ditautkan, status terkini, lencana "versi lebih baru tersedia" + tombol "Perbarui tautan"), tombol "Tautkan objek" (modal: jenis + objek dari proyek). Tombol lepas dinonaktifkan dengan tooltip bila sudah ada keputusan. Tombol "Buka" untuk interpretasi menuju `/interpretations/[id]`.
   - **Catatan**: daftar per jenis. Wawancara: narasumber (opsi tampil inisial), peran, tanggal, lencana "Informasi kualitatif, bukan hasil terukur". Bukti: nama berkas tiruan (≤ 20 MB, galat bila lebih) atau tautan; teks dan tautan dirender sebagai teks, tautan `rel="noreferrer"`. Hipotesis: pil `belum diuji|didukung|dibantah` dan pemilih bukti pendukung. Pertanyaan: penanggung jawab dan tombol terjawab. Formulir tambah per jenis lewat `NoraModal`.
   - **Diskusi**: utas komentar pada workspace; pemilih tujuan ("Workspace" atau satu objek tertaut); `@nama` ditandai; "Selesai dibahas" melipat utas.
   - **Tinjauan model**: dua bagian. Hasil Jev: kartu (judul, putusan model, keyakinan, versi dataset), tombol "Konfirmasi" dan "Koreksi" (modal: putusan baru + alasan + kotak "tandai untuk set acuan evaluasi"). Draf interpretasi: ringkasan status draf + tombol "Setujui" dan "Tolak" (modal: kode alasan + alasan + kotak evaluasi). Setelah ditinjau: pil hasil, peninjau, waktu, alasan. Penghitung "n belum ditinjau" di atas.
   - **Keputusan**: satu kartu per kandidat tertaut: status terakhir (pil), peninjau, peran, alasan, versi, potret bukti (dataset, paket konteks, analisis, paket bukti, versi narasi), lencana `perlu_ditinjau_ulang` dengan ringkasan perubahan dan tombol "Tegaskan" atau "Ubah keputusan". Tombol "Tetapkan keputusan" menampilkan hanya status yang diizinkan peran viewer (`canDecide`); modal: status, alasan, kandidat pengganti bila `digantikan`. "Riwayat versi" membuka daftar versi lama (hanya baca). Pemilik proses tanpa izin melihat penjelasan satu baris. Bagian "Usulan ke M04" di bawah: formulir pilih aturan + catatan, daftar usulan dengan tautan ke `/context/rules/[ruleKey]`.
   - Workspace tidak ada atau milik proyek lain: `NotFoundPanel`.
3. **M10a**: tombol "Buka di M11" di `interpretation-view.tsx` aktif bila interpretasi tertaut ke suatu workspace (menuju workspace); jika belum, menjadi "Buat workspace dari temuan ini" bila `investigation.create`, selain itu tetap nonaktif dengan tooltip.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Pill/Card/Table/NoraModal/Banner yang ada; semua string pengguna (judul, isi catatan, komentar, alasan, nama berkas, tautan) dirender sebagai teks, tidak pernah HTML. Riwayat keputusan, komentar, dan catatan tidak dapat dihapus.

## Pengujian

- `investigation.test.ts`: `unreviewedModelOutputs` (belum/sudah ditinjau); `canSetStatus` terkunci dan terbuka; `canDecide` untuk semua kombinasi peran × status; `validateDecision` (alasan kosong, `digantikan` tanpa/dengan pengganti sama, kandidat tidak tervalidasi untuk `dipilih`); `snapshotFor`; `latestDecisions` dan riwayat; `detectRevalidation` (tanpa perubahan, tiap jenis perubahan, ambang metrik 5%); `linkFreshness`; `extractMentions` (kapitalisasi, nama tak dikenal).
- `investigation-reducer.test.ts`: pembuatan dari temuan menautkan objek yang benar; penolakan peran (administrator, pemilik proses pada aksi analis, analis memilih `dipilih`); proyek tidak aktif; cek versi optimistis pada dua keputusan beruntun dengan `expectedVersion` sama; keputusan baru menaikkan versi dan menghapus penanda; `simulateNewAnalysis` membuat penanda hanya untuk keputusan terdampak dan notifikasi; `confirmDecision` tanpa penanda ditolak; sebutan membuat notifikasi, bukan untuk penulis; `reviewJev`/`reviewDraft` aturan dan audit; `createProposal` menghasilkan versi aturan `ditinjau` dan menolak ganda; id tak dikenal tidak melempar; setiap aksi sukses menulis tepat satu audit.
- `permissions.test.ts`: matriks `investigation.*`, `note.*`, `comment.add`, `review.*`, `decision.*`, `proposal.create`.
- `seed.test.ts`: invarian (tautan menunjuk objek yang ada, hanya `p-p2p`, `inv-1` punya ≥ 1 keluaran belum ditinjau, keputusan seed punya potret lengkap).
- Verifikasi manual di browser (1280px dan 1024px) sebagai Dimas, Sari, dan Rina: jalur demo juri penuh.

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/investigation.ts` + `investigation.test.ts` + `investigation-reducer.test.ts` (baru), `components/project/{investigations-table,create-investigation-modal,investigation-header,links-tab,link-object-modal,notes-tab,note-form-modal,discussion-tab,model-review-tab,review-modal,decisions-tab,decision-modal,decision-history,proposals-section,revalidation-banner,notification-bell}.tsx` (baru), rute `investigations/page.tsx` dan `investigations/[investigationId]/page.tsx` (baru), `[projectId]/layout.tsx` (tab "Investigasi"), `components/project/interpretation-view.tsx` (tombol M11), `components/shell/*` (lonceng). Tidak ada dependensi baru.

## Asumsi dan risiko

- Matriks kewenangan memakai asumsi PRD (belum divalidasi Javan); disimpan di satu tabel `ALLOWED` agar mudah diubah.
- Satu komit reducer besar berisiko; plan memecahnya per kelompok aksi (workspace/tautan, catatan/komentar, tinjauan, keputusan/penanda, usulan) dengan tes di tiap kelompok.
- `createProposal` bergantung pada `saveRule`/`changeRuleStatus` M04c; bila perilaku itu berubah, tes `createProposal` yang paling dulu gagal.
