# Spec: M10a frontend, Interpretasi temuan (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M10](../../prd/m10-interpretasi-hasil-prd.md), Story 1–6 (sebagian), Fitur 1, 3, 5. Dibangun di atas M04c frontend (`feat/m04c-frontend`): lapisan tiruan `apps/web/lib/mock/`, komponen Untitled UI, token Nora. M10 dipecah: **M10a interpretasi satu target, temuan M06 (spec ini)**, M10b empat target lain (penilaian kandidat, perbandingan, skenario, uji coba). Tidak ada backend, penyimpanan permanen, atau panggilan LLM. Branch `feat/m10a-frontend` dari `feat/m04c-frontend`, worktree `nora-m10`.

## Tujuan

Analis meminta draf penjelasan untuk satu temuan tiruan, lalu membaca draf yang memisahkan fakta, dugaan, dan hal belum diketahui; setiap angka dapat ditelusuri, setiap klaim merujuk bukti, dan draf yang melanggar batas ditolak atau diperbaiki otomatis sebelum tampil.

**Berhasil bila:**

1. Proyek punya tab "Interpretasi"; daftar dan detail draf dapat dicapai lewat navigasi.
2. Analis dapat meminta interpretasi (temuan + audiens); permintaan tercatat di audit log.
3. Detail draf menampilkan delapan bagian tetap, klaim dengan lencana tipe, angka dari placeholder dengan tooltip asal, rujukan yang bisa diklik, dan "bukti tidak dirujuk".
4. Demo juri: satu temuan menghasilkan draf bersih; satu temuan menghasilkan draf yang gagal pemeriksaan di percobaan 1 (menyebut tindakan di luar kandidat) lalu lolos di percobaan 2; satu temuan tetap `gagal_pemeriksaan` setelah 2 perbaikan.
5. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Empat target lain (M10b), suntingan, versi suntingan, persetujuan/penolakan (M11), UI templat prompt, biaya dan token, penggunaan ulang berbasis hash di UI, pengiriman asinkron nyata, LLM nyata, objek temuan M06d yang sebenarnya, layar ponsel. Tombol "Buka di M11" nonaktif dengan tooltip "Workspace tinjauan (M11) belum tersedia".

## Peran dan izin

| Aksi UI | administrator | analis | pemilik_proses |
|---|---|---|---|
| `interpretation.view` | ya | ya | ya |
| `interpretation.request` | tidak | ya | tidak |
| `interpretation.override` | tidak | ya | tidak |

`interpretation.request` hanya pada proyek `aktif` (`acceptsData`); di status lain tombol disembunyikan dengan penjelasan seperti M04c. Bukan anggota proyek: `NotFoundPanel`.

## Model data tiruan (`lib/mock/types.ts`)

```ts
type Audience = "analis" | "pemilik_proses";
type ClaimType = "fakta_terukur" | "interpretasi" | "hipotesis" | "rekomendasi_tervalidasi";
type SectionKey = "ringkasan" | "terukur" | "dasar_bukti" | "interpretasi"
  | "hipotesis_terbuka" | "asumsi" | "ketidakpastian" | "pertanyaan";
type InterpretationStatus = "lolos_pemeriksaan" | "gagal_pemeriksaan";
type CheckKey = "skema" | "placeholder" | "angka_literal" | "rujukan"
  | "tipe_klaim" | "tindakan_tidak_dikenal" | "bahasa_keputusan" | "ketidakpastian";

type EvidenceKind = "temuan" | "metrik" | "aturan" | "kasus" | "hasil_jev" | "kandidat";
interface EvidenceItem {
  id: string;                 // mis. "finding_42", "rule_sla_1"
  kind: EvidenceKind;
  title: string;
  detail: string;             // teks; kutipan sumber untuk aturan
  measured: boolean;          // hasil terukur (M05/M06) atau aturan/dokumen (M04)
  validated?: boolean;        // hanya kind "kandidat": status tervalidasi M09
  metrics?: Record<string, { value: number; unit: string; version: string }>;
}
interface MockFinding {
  id: string; projectId: string; title: string; summary: string;
  limitedContext: boolean;    // paket bukti "konteks terbatas" (M07)
  evidence: EvidenceItem[];   // paket bukti beku
}

interface Claim { id: string; type: ClaimType; text: string; citations: string[]; candidateId?: string }
interface Section { key: SectionKey; claims: Claim[] }
interface Attempt { n: number; sections: Section[]; violations: Violation[]; checks: CheckResult[] }
interface Violation { check: CheckKey; claimId?: string; message: string }
interface CheckResult { check: CheckKey; ok: boolean; messages: string[] }
interface CheckOverride { check: CheckKey; claimId?: string; reason: string; by: string; at: string }

interface Interpretation {
  id: string; projectId: string; findingId: string; audience: Audience;
  status: InterpretationStatus;
  attempts: Attempt[];        // 1–3; percobaan terakhir menentukan status
  overrides: CheckOverride[];
  templateVersion: "tiruan-1"; model: "model-tiruan";
  createdBy: string; createdAt: string;
}
```

`MockState` bertambah `findings: MockFinding[]` dan `interpretations: Interpretation[]`. Data awal untuk `p-p2p` (proyek lain tanpa temuan): tiga temuan tiruan, masing-masing menentukan hasil skrip generator:

| Temuan | Perilaku generator | Hasil |
|---|---|---|
| `finding_42` "Antrean persetujuan PO melebihi SLA" | bersih | lolos di percobaan 1 |
| `finding_57` "Rework pada verifikasi faktur" | percobaan 1 menyebut tindakan di luar kandidat dan memakai angka literal | gagal, lolos di percobaan 2 |
| `finding_63` "Penyimpangan urutan pembayaran" (`limitedContext: true`) | tiap percobaan menyebut keputusan ("akan diterapkan") | `gagal_pemeriksaan` setelah 3 percobaan |

Dua audiens menghasilkan teks berbeda (pemilik proses: istilah teknis dijelaskan, kalimat lebih pendek), struktur sama.

## Aturan murni (`lib/mock/interpretation.ts`, baru, tanpa React)

- `generateAttempt(finding: MockFinding, audience: Audience, n: number): Section[]`: generator skrip deterministik menurut tabel di atas; tidak ada panggilan jaringan. Teks memakai placeholder `{{metric:<itemId>.<metricKey>}}`. Draf akhir tidak pernah menyebut hasil di luar skrip.
- `resolvePlaceholders(text: string, finding: MockFinding): Array<{ kind: "text"; text: string } | { kind: "number"; ref: string; formatted: string; origin: string } | { kind: "missing"; ref: string }>`: mengganti placeholder dengan nilai terformat id-ID dan satuan; `origin` = "{judul item} · {metrik} · {versi}". Placeholder tak dikenal jadi `missing`.
- Delapan pemeriksa, masing-masing `(sections, finding) => Violation[]`, sama dengan tabel Fitur 3 PRD:
  1. `checkSchema`: delapan bagian lengkap, tiap klaim punya `id`, `type`, `text`, `citations`.
  2. `checkPlaceholders`: semua placeholder ada di `finding.evidence[*].metrics`.
  3. `checkLiteralNumbers`: angka di luar placeholder gagal, kecuali nomor bagian dan tanggal yang tertulis di bukti (`detail`).
  4. `checkCitations`: tiap klaim ≥ 1 rujukan, semua ada di `finding.evidence`.
  5. `checkClaimTypes`: `fakta_terukur` hanya merujuk item `measured` atau `kind: "aturan"`; `rekomendasi_tervalidasi` wajib `candidateId` dengan `validated: true`.
  6. `checkUnknownActions`: kata kerja tindakan dari daftar tetap ("hentikan", "otomatisasi", "tambah staf", …) yang tidak cocok dengan judul kandidat mana pun di bukti. Heuristik.
  7. `checkDecisionLanguage`: pada `fakta_terukur` dan `interpretasi`, frasa dari daftar tetap ("dipilih", "akan diterapkan", "pasti disebabkan", …). Heuristik. Daftar kata konstanta terekspor (konfigurabel di versi nyata).
  8. `checkUncertainty`: bagian `ketidakpastian` tidak kosong; bila `limitedContext`, memuat frasa "konteks terbatas".
- `runChecks(sections, finding): CheckResult[]`: delapan hasil dalam urutan di atas.
- `runCheckedGeneration(finding, audience): Attempt[]`: `generateAttempt` n=1, `runChecks`; bila ada pelanggaran dan n < 3, percobaan berikutnya (maksimal 2 perbaikan); berhenti saat lolos atau n = 3. Murni, deterministik.
- `statusOf(attempts, overrides): InterpretationStatus`: `lolos_pemeriksaan` bila percobaan terakhir tanpa pelanggaran, atau semua pelanggarannya ada di `overrides` dan hanya dari pemeriksa heuristik (tindakan tidak dikenal, bahasa keputusan). Pemeriksa lain tidak bisa dikesampingkan.
- `unreferencedEvidence(sections, finding): EvidenceItem[]`: item bukti yang tidak muncul di `citations` mana pun.

## Aturan reducer (`lib/mock/reducer.ts`)

`requestInterpretation { projectId; findingId; audience }` (tidak melempar; galat berupa string):

- Proyek `aktif`; temuan milik proyek; audiens valid.
- Sukses: panggil `runCheckedGeneration`, tambah `Interpretation` dengan `status` dari `statusOf`, satu `AuditEvent` `interpretation.minta` (objectType `Interpretation`, label "{judul temuan} · {audiens}"). Hasil `{ state, interpretationId }`.

`overrideCheck { projectId; interpretationId; check; claimId?; reason }`:

- Hanya untuk pemeriksa heuristik; `reason` tidak kosong setelah trim; interpretasi berstatus `gagal_pemeriksaan`.
- Sukses: tambah `CheckOverride`, hitung ulang `status` dengan `statusOf`, satu `AuditEvent` `interpretation.kesampingkan` dengan alasan.

Helper terekspor: `interpretationsForProject(s, projectId)` (terbaru dulu), `findingsForProject(s, projectId)`.

## Layar

Semua di bawah `projects/[projectId]/interpretations/`. Tab proyek baru "Interpretasi" (ikon `Sparkle`, hitungan = jumlah draf) di antara "Monitoring" bila ada, atau "Konteks" dan "Anggota"; aktif untuk path yang diawali `/interpretations`.

1. **`/interpretations`**: tabel draf (temuan, audiens, status pil, jumlah percobaan, dibuat oleh, waktu). Filter status. Tombol "Buat interpretasi" bila `can("interpretation.request")` dan `acceptsData`, membuka `NoraModal`: pilih temuan, pilih audiens (radio dengan penjelasan satu baris), tombol kirim. Galat reducer di Banner. Keadaan kosong: ajakan membuat draf pertama; proyek tanpa temuan: "Belum ada temuan untuk diinterpretasi (M06)".
2. **`/interpretations/[interpretationId]`**:
   - Kepala: judul temuan, audiens, pil status, banner tetap "Draf dibuat model — belum ditinjau" (info), tombol "Buka di M11" nonaktif.
   - `lolos_pemeriksaan`: delapan bagian berurutan. Tiap klaim: lencana tipe (warna beda per tipe, label Indonesia, ikon), teks dengan angka dirender sebagai token bertanda (tooltip asal-usul), rujukan sebagai chip yang membuka panel samping item bukti (judul, jenis, detail/kutipan sebagai teks, metrik). Daftar "bukti tidak dirujuk" di akhir.
   - `gagal_pemeriksaan`: banner galat dan daftar pelanggaran percobaan terakhir; draf tidak ditampilkan sebagai hasil. Pelanggaran heuristik punya tombol "Kesampingkan" (hanya `interpretation.override`) yang membuka `NoraModal` dengan alasan wajib.
   - Panel samping/tab "Pemeriksaan": delapan aturan lulus/gagal untuk percobaan terpilih, plus pemilih percobaan (1–3) dengan ringkasan pelanggaran tiap percobaan; ini tempat juri melihat draf gagal lalu diperbaiki. Penggantian ke percobaan lama menampilkan banner "Percobaan lama, bukan hasil akhir".
   - Pengesampingan yang ada ditampilkan (pemeriksa, alasan, oleh siapa, kapan).
   - Interpretasi tidak ada atau milik proyek lain: `NotFoundPanel`.

Teks Bahasa Indonesia, ikon Phosphor, kontrol 32px, judul 20px, pola Pill/Card/Table/NoraModal/Banner yang ada; semua string data (judul temuan, kutipan, teks klaim) dirender sebagai teks, tidak pernah HTML.

## Pengujian

- `interpretation.test.ts`: `resolvePlaceholders` (angka, satuan, placeholder tak dikenal jadi `missing`); tiap pemeriksa gagal pada masukan buruk terarah dan lolos pada masukan baik; `finding_42` lolos di percobaan 1; `finding_57` gagal lalu lolos di percobaan 2; `finding_63` tiga percobaan, status `gagal_pemeriksaan`; `limitedContext` tanpa frasa gagal pada `checkUncertainty`; `unreferencedEvidence`; `statusOf` dengan pengesampingan heuristik vs non-heuristik; determinisme (dua panggilan, hasil sama); dua audiens, struktur sama dan teks beda.
- `interpretation-reducer.test.ts`: permintaan sukses + 1 audit; ditolak bila proyek tidak aktif, temuan bukan milik proyek, audiens tak valid; id tak dikenal tidak melempar; `overrideCheck` ditolak untuk pemeriksa non-heuristik dan alasan kosong, sukses menghitung ulang status dan menulis audit.
- `permissions.test.ts`: matriks `interpretation.*`.
- `seed.test.ts`: invarian seed (semua sitasi bukti ada, tiga temuan ada, hanya `p-p2p`).
- Verifikasi manual di browser (1280px dan 1024px), termasuk Pemilik proses dan Administrator.

## Struktur berkas (baru/ubah)

`lib/mock/{types,data,reducer,permissions}.ts` (ubah), `lib/mock/interpretation.ts` + `interpretation.test.ts` + `interpretation-reducer.test.ts` (baru), `components/project/{interpretations-table,request-interpretation-modal,interpretation-view,claim-badge,evidence-panel,check-report,override-check-modal}.tsx` (baru), rute `interpretations/page.tsx` dan `interpretations/[interpretationId]/page.tsx` (baru), `[projectId]/layout.tsx` (tab "Interpretasi"). Tidak ada dependensi baru.
