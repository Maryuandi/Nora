# M08b/c/d Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lengkapi frontend M08: klasifikasi aktivitas dan catatan sintetis, set acuan + laporan evaluasi, dan spesifikasi pertanyaan berversi, di atas M08a.

**Architecture:** Fungsi murni baru `classification.ts` dan `evaluation.ts`, seed di `classification-data.ts`, tipe dan izin baru, satu reducer baru `classification-reducer.ts` (didelegasikan dari `reduce` seperti `assessment-reducer.ts`), lalu tiga halaman server di `assessments/classification|evaluation|specs` yang meneruskan `searchParams` ke komponen klien. Data tiruan; tanpa backend.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Untitled UI (react-aria), Phosphor, Zod, Vitest. Tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-10-18-m08bcd-frontend-design.md` (baca juga spec M08a `2026-10-18-m08-frontend-design.md` dan kode M08a di `apps/web/lib/mock/assessment*.ts`, `apps/web/components/project/{finding-view,candidate-panel,candidate-table,review-queue,correction-modal,assessment-tabs,assessment-list,probability-bars,assessment-status}.tsx`).

## Global Constraints

- Semua teks UI Bahasa Indonesia. Ikon hanya `@phosphor-icons/react`. Judul halaman 20px, kontrol 32px. Tidak ada dependensi baru. Tidak ada `dangerouslySetInnerHTML`; nilai panjang terpotong dengan `title`; hooks sebelum early return; status bukan hanya warna; setiap bilah punya angka.
- Fungsi di `classification.ts`, `evaluation.ts`, `classification-data.ts` murni (tanpa React, `Date.now()`, acak). Reducer murni, tidak melempar; tiap aksi sukses menambah tepat satu `AuditEvent`; pada galat state dikembalikan dengan referensi yang sama. Jam tetap `MOCK_TODAY`. Reducer baru tidak mengimpor `reducer.ts` (terima `ctx {now, newId, audit}`), peran dibaca dari `state.memberships`.
- Ambang bawaan `{ sufficient: 0.5, topProb: 0.6, margin: 0.15 }`; batas persis lolos (toleransi 1e-9). Pesan galat reducer Bahasa Indonesia: `"Anda tidak berwenang melakukan aksi ini"`, `"Proyek ini tidak menerima data baru"`, `"Hasil klasifikasi tidak ditemukan"`, `"Hasil ini sudah digantikan penilaian baru"`, `"Semua item sudah dinilai"`, `"Tidak ada perubahan"`. Urutan pemeriksaan: entitas ada → peran → proyek `aktif` → superseded → validasi.
- Halaman server (`page.tsx`) membaca `searchParams` (Promise, di-`await`; nilai array diperlakukan sebagai tidak valid) dan meneruskan prop; tanpa `useSearchParams`/`Suspense` (hard load harus render).
- Jangan sentuh backend, branch lain, atau berkas di luar `apps/web` dan `docs/`. Tidak ada berkas sementara. Commit tanpa baris Co-Authored-By Claude (preferensi pengguna).

## Review Focus

- Set acuan kosong, satu item, atau semua prediksi benar/salah: metrik tidak `NaN` (akurasi 0 → ditampilkan "–" bila n=0), kappa null bila < 2 item atau pembagi nol.
- Item set acuan merujuk hasil yang sudah digantikan, hilang, atau tanpa verdict (gagal): dikecualikan dan dihitung di `excluded`, tidak crash.
- Dua pelabel tidak sepakat: kesepakatan dihitung hanya atas item yang punya dua label; label kanonis tetap pelabel pertama.
- Kategori spesifikasi dengan label duplikat atau yang berubah slug: ditolak dengan pesan; hasil lama merujuk kunci yang sudah tidak ada: tampil sebagai teks kunci mentah, tidak crash.
- Ambang di luar rentang atau `NaN`: ditolak; ambang baru tidak mengubah status tersimpan sampai run diulang.
- Koreksi klasifikasi dengan kategori di luar spesifikasi / alasan kosong atau > 500 karakter: ditolak.
- Teks catatan berisi `<script>` atau 5000 karakter tanpa spasi: tampil sebagai teks terpotong.

---

### Task 1: Tipe, izin, skema, spesifikasi seed, ambang

**Files:**
- Modify: `apps/web/lib/mock/types.ts`, `apps/web/lib/mock/permissions.ts`, `apps/web/lib/mock/schemas.ts`, `apps/web/lib/mock/assessment.ts`, `apps/web/lib/mock/data.ts`
- Create: `apps/web/lib/mock/specs.ts`
- Test: `apps/web/lib/mock/permissions.test.ts`, `apps/web/lib/mock/schemas.test.ts`, `apps/web/lib/mock/specs.test.ts`, `apps/web/lib/mock/assessment.test.ts`

**Interfaces:**
- Produces (`types.ts`): semua tipe pada bagian "Tipe baru" spec (`TaskKind`, `ClassStatus`, `SpecCategory`, `Thresholds`, `QuestionSpec`, `ClassItem`, `ClassResult`, `ClassCorrection`, `GoldItem`, `Bin`, `EvaluationRun`) persis; `MockState` + `specs: QuestionSpec[]; classItems: ClassItem[]; classResults: ClassResult[]; classCorrections: ClassCorrection[]; goldItems: GoldItem[]; evaluations: EvaluationRun[]`.
- Produces (`permissions.ts`): `UiAction` + `"classify.view" | "classify.run" | "classify.correct" | "gold.view" | "gold.edit" | "evaluation.view" | "evaluation.run" | "spec.view" | "spec.edit"` (`*.view` semua peran; sisanya hanya `analis`).
- Produces (`schemas.ts`): `classCorrectionSchema = z.object({ category: required("Kategori"), reason: required("Alasan").max(500, "Alasan maksimal 500 karakter"), addToGoldSet: z.boolean() })`; `thresholdsSchema` (`sufficient` 0–1, `topProb` 0,3–0,95, `margin` 0–0,5; pesan: `"Ambang bukti cukup harus 0–1"`, `"Ambang probabilitas teratas harus 0,3–0,95"`, `"Margin harus 0–0,5"`; menolak `NaN`).
- Produces (`specs.ts`): `DEFAULT_THRESHOLDS: Thresholds`; `slugify(label: string): string` (huruf kecil, spasi/non-alfanumerik → `_`, trim `_`); `activeSpec(s: MockState, projectId: string, task: TaskKind): QuestionSpec | undefined` (versi tertinggi); `specVersions(s, projectId, task): QuestionSpec[]` (terbaru dulu); `validateSpecInput(task: TaskKind, input: { question: string; categories: { label: string; definition: string }[]; thresholds: Thresholds }): string | null` (pesan pertama atau null; aturan di spec "Validasi saveSpec"); `isStale(specVersion: number, s: MockState, projectId: string, task: TaskKind): boolean` (versi hasil < versi aktif).
- Produces (`assessment.ts`): `deriveStatus` mendapat parameter opsional kedua `th: Thresholds = THRESHOLDS` yang dipakai untuk semua ambang (perilaku default tidak berubah).

Seed spesifikasi (`data.ts` atau `classification-data.ts`, id `sp-<task>-1`, proyek `p-p2p`, `createdBy` `u-dimas`, `createdAt` `MOCK_TODAY + "T09:00:00Z"`): `relevansi` — pertanyaan "Seberapa relevan kandidat ini sebagai penjelasan temuan?", `categories: []`; `aktivitas` — pertanyaan "Golongan apa yang paling tepat untuk aktivitas ini?" dengan 8 kategori bawaan spec (label Indonesia berhuruf besar awal, definisi satu kalimat); `catatan` — pertanyaan "Apa alasan utama yang tertulis pada catatan ini?" dengan 5 kategori taksonomi alasan. Semua `DEFAULT_THRESHOLDS`. `initialState.specs` berisi ketiganya; `classItems`, `classResults`, `classCorrections`, `goldItems`, `evaluations` sementara `[]` (diisi Task 2–3).

- [ ] **Step 1: Write failing tests**
  - `permissions.test.ts`: tambah sembilan aksi baru ke tabel EXPECTED (analis boleh semua; administrator dan pemilik_proses hanya `*.view`).
  - `schemas.test.ts`: `classCorrectionSchema` menolak alasan `"   "` ("Alasan wajib diisi") dan 501 karakter, menerima 500, menolak kategori kosong; `thresholdsSchema` menerima `{0.5,0.6,0.15}`, menolak `topProb: 0.29`, `0.96`, `margin: 0.51`, `-0.01`, `sufficient: 1.1`, dan `NaN`.
  - `specs.test.ts`: `slugify("Pencatatan Dokumen")==="pencatatan_dokumen"`, `slugify("  Harga/Tak Sesuai! ")==="harga_tak_sesuai"`; `activeSpec` memilih versi tertinggi; `validateSpecInput("aktivitas", …)` menolak 1 kategori ("Minimal 2 kategori"), label kosong ("Label kategori wajib diisi"), label yang menghasilkan slug sama ("Label kategori duplikat"), pertanyaan kosong ("Pertanyaan wajib diisi") dan > 300 karakter ("Pertanyaan maksimal 300 karakter"), definisi > 200 karakter ("Definisi maksimal 200 karakter"); `validateSpecInput("relevansi", …)` dengan `categories: []` valid; `isStale(1, stateWithV2, "p-p2p", "aktivitas") === true`, versi aktif → false.
  - `assessment.test.ts`: `deriveStatus` dengan `th = {sufficient:0.3, topProb:0.9, margin:0.1}` memberi `perlu_review` untuk teratas 0,85 dan `otomatis` untuk teratas 0,9 dengan margin cukup; tanpa argumen perilaku lama.
- [ ] **Step 2: Run** `pnpm --filter web test -- permissions schemas specs assessment` — Expected: FAIL.
- [ ] **Step 3: Implement** semua di atas. `initialState` harus tetap lolos `tsc`.
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm --filter web exec tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): M08b-d types, permissions, specs`

### Task 2: Klasifikasi: logika murni, fixture, seed

**Files:**
- Create: `apps/web/lib/mock/classification.ts`, `apps/web/lib/mock/classification-data.ts`
- Modify: `apps/web/lib/mock/data.ts`
- Test: `apps/web/lib/mock/classification.test.ts`, `apps/web/lib/mock/seed.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Thresholds`, `activeSpec`, `isStale`).
- Produces (`classification.ts`):
  - `classStatus(probs: Record<string, number>, th: Thresholds, failed?: boolean): ClassStatus`
  - `topTwoOf(probs: Record<string, number>, order: string[]): { top: [string, number]; second: [string, number]; margin: number }` (seri: urutan `order`)
  - `currentClassResults(s: MockState, projectId: string, task: "aktivitas" | "catatan"): ClassResult[]` (tanpa `supersededBy`)
  - `effectiveClass(r: ClassResult, corrections: ClassCorrection[], order: string[]): { category: string; source: "model" | "analis"; correction?: ClassCorrection }` (koreksi terbaru menang; seri `at`: indeks belakang)
  - `classQueue(s: MockState, projectId: string, task: "aktivitas" | "catatan"): ClassResult[]` (non-`otomatis` tanpa koreksi; urutan `gagal`, `perlu_review` margin terkecil dulu)
  - `classSummary(s, projectId, task, order: string[]): { byCategory: Record<string, number>; byStatus: Record<ClassStatus, number>; unscored: number }` (kategori efektif; `unscored` = item tanpa hasil terkini)
  - `noteAggregation(s: MockState, projectId: string): { rows: { activity: string; counts: Record<string, number>; total: number }[]; periods: { period: string; counts: Record<string, number>; total: number }[] }` (kategori efektif per catatan)
  - `runClassFixture(items: ClassItem[], spec: QuestionSpec, ctx: { runId: string; at: string }): ClassResult[]` (id hasil = `${runId}-${item.id}`; probabilitas dari `CLASS_FIXTURE[item.id]`; item tanpa entri fixture → `gagal`, probabilitas seragam; kategori fixture yang tidak ada di spec diabaikan dan sisa massa dibagi ke kategori yang ada; status dari `classStatus` dengan ambang spec)
- Produces (`classification-data.ts`): `CLASS_FIXTURE: Record<string, { top: string; p: number; second?: string; p2?: number }>` (sisa massa dibagi rata ke kategori lain, jumlah = 1), `classItems`, `seedClassResults` dibangun di `data.ts` (hindari siklus impor, pola `seedAssessments`).

Seed aktivitas (id `a01`…`a20`, `text` = nama aktivitas, `context` = satu kalimat contoh atribut/posisi dalam varian, `synthetic: false`):

| id | aktivitas | top | p | second (p2) |
|---|---|---|---|---|
| a01 | Create Purchase Order Item | pembuatan | .93 | – |
| a02 | Vendor creates invoice | pembuatan | .52 | pencatatan_dokumen (.41) |
| a03 | Record Goods Receipt | penerimaan | .88 | – |
| a04 | Record Invoice Receipt | pencatatan_dokumen | .84 | – |
| a05 | Clear Invoice | pembayaran | .81 | – |
| a06 | Change Approval for Purchase Order | persetujuan | .55 | perubahan (.38) |
| a07 | Change Price | perubahan | .91 | – |
| a08 | Change Quantity | perubahan | .90 | – |
| a09 | Change Delivery Indicator | perubahan | .86 | – |
| a10 | Delete Purchase Order Item | pembatalan | .89 | – |
| a11 | Cancel Goods Receipt | pembatalan | .79 | – |
| a12 | Cancel Invoice Receipt | pembatalan | .77 | – |
| a13 | Receive Order Confirmation | penerimaan | .72 | pencatatan_dokumen (.20) |
| a14 | Update Order Confirmation | perubahan | .58 | pencatatan_dokumen (.33) |
| a15 | Release Purchase Order | persetujuan | .83 | – |
| a16 | Approve Purchase Requisition | persetujuan | .94 | – |
| a17 | Create Purchase Requisition Item | pembuatan | .92 | – |
| a18 | Reactivate Purchase Order Item | lainnya | .46 | pembuatan (.44) |
| a19 | Payment Block Set | lainnya | .62 | pembayaran (.30) |
| a20 | Send Reminder | lainnya | .87 | – |

Seed catatan (id `n01`…`n16`, `synthetic: true`, `text` = kalimat catatan Bahasa Indonesia 8–20 kata bernuansa alasan, `context` = "Catatan sintetis", `activity`, `period`):

| id | activity | period | top | p | second (p2) |
|---|---|---|---|---|---|
| n01 | Change Approval for Purchase Order | 2026-07 | harga_tidak_sesuai | .90 | – |
| n02 | Change Approval for Purchase Order | 2026-07 | kuantitas_tidak_sesuai | .88 | – |
| n03 | Change Approval for Purchase Order | 2026-07 | dokumen_kurang | .85 | – |
| n04 | Change Approval for Purchase Order | 2026-08 | vendor_salah | .82 | – |
| n05 | Change Approval for Purchase Order | 2026-08 | harga_tidak_sesuai | .81 | lainnya (.10) |
| n06 | Change Approval for Purchase Order | 2026-08 | kuantitas_tidak_sesuai | .91 | – |
| n07 | Change Approval for Purchase Order | 2026-09 | harga_tidak_sesuai | .87 | – |
| n08 | Change Approval for Purchase Order | 2026-09 | dokumen_kurang | .79 | – |
| n09 | Record Goods Receipt | 2026-07 | kuantitas_tidak_sesuai | .93 | – |
| n10 | Record Goods Receipt | 2026-07 | kuantitas_tidak_sesuai | .84 | – |
| n11 | Record Goods Receipt | 2026-08 | vendor_salah | .48 | dokumen_kurang (.43) |
| n12 | Record Goods Receipt | 2026-08 | dokumen_kurang | .86 | – |
| n13 | Record Goods Receipt | 2026-08 | lainnya | .74 | – |
| n14 | Record Goods Receipt | 2026-09 | harga_tidak_sesuai | .52 | kuantitas_tidak_sesuai (.40) |
| n15 | Record Goods Receipt | 2026-09 | vendor_salah | .80 | – |
| n16 | Record Goods Receipt | 2026-09 | lainnya | .66 | – |

Teks catatan harus masuk akal untuk kategorinya (mis. n01 menyebut harga pada PO berbeda dari kontrak); n05 harus terbaca sebagai masalah dokumen (model salah yakin), n11 ambigu antara vendor dan dokumen. Seed hasil: `runFixture`-setara via `runClassFixture(allItems, specOfTask, { runId: "run-seed-cls", at: MOCK_TODAY + "T09:00:00Z" })` per tugas. Hasil seed bertarget `perlu_review`: a02, a06, a14, a18, n11, n14; semua lain `otomatis`.

- [ ] **Step 1: Write failing tests** (`classification.test.ts`): `classStatus` — teratas .59 → `perlu_review`, .6 dengan kedua .3 → `otomatis`, selisih .14 → `perlu_review`, selisih tepat .15 (mis. .7 vs .55 dan .75 vs .6) → `otomatis`, `failed` → `gagal`, ambang kustom `{topProb:.9}` mengubah hasil; `topTwoOf` seri deterministik menurut `order`; `effectiveClass` koreksi terbaru menang, tanpa koreksi → argmax, masukan beku tidak termutasi; `classQueue` mengecualikan yang terkoreksi/superseded dan mengurutkan sesuai aturan (di seed: tepat enam item, `perlu_review` margin terkecil lebih dulu: a18 (.02) pertama); `classSummary` byStatus lengkap tiga kunci, `unscored` 0 pada seed dan > 0 bila hasil dihapus dari state uji; `noteAggregation` total 16, baris per aktivitas (8 + 8) dan periode (3 periode: 2026-07 = 5, 2026-08 = 6, 2026-09 = 5) menjumlah ke total; `runClassFixture` deterministik, id `${runId}-${item.id}`, item tanpa fixture → `gagal`, spec dengan kategori yang dikurangi tidak menghasilkan kunci di luar spec dan probabilitas berjumlah 1, spec dengan ambang `{topProb:0.95}` membuat hampir semua `perlu_review`. `seed.test.ts`: item seed 20 + 16, id unik, probabilitas tiap hasil berjumlah 1 (1e-9), kunci probabilitas = kunci kategori spec, enam hasil `perlu_review` persis yang disebut di atas.
- [ ] **Step 2: Run** `pnpm --filter web test -- classification seed` — Expected: FAIL.
- [ ] **Step 3: Implement** modul dan seed; sambungkan ke `initialState` di `data.ts` (ganti `[]` sementara untuk `classItems` dan `classResults`).
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm --filter web exec tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): M08c classification logic, fixture, seed`

### Task 3: Evaluasi: metrik murni dan set acuan seed

**Files:**
- Create: `apps/web/lib/mock/evaluation.ts`
- Modify: `apps/web/lib/mock/classification-data.ts`, `apps/web/lib/mock/data.ts`
- Test: `apps/web/lib/mock/evaluation.test.ts`, `apps/web/lib/mock/seed.test.ts`

**Interfaces:**
- Consumes: Task 1–2, `currentAssessments`, `hasModelVerdict`, `topTwo` dari M08a.
- Produces (`evaluation.ts`):
  - `BIN_EDGES = [0, 0.4, 0.6, 0.8, 0.9, 1.0]`
  - `type EvalPair = { pred: string; conf: number; label: string; auto: boolean }`
  - `computeMetrics(pairs: EvalPair[]): { n: number; accuracy: number | null; macroF1: number | null; autoCoverage: number | null; autoAccuracy: number | null; highConf: { n: number; accuracy: number | null }; bins: Bin[] }` (n=0 → semua null kecuali `highConf.n=0`, `bins` nol; bin terakhir inklusif 1.0)
  - `cohenKappa(pairs: { a: string; b: string }[]): number | null` (null bila < 2 pasangan atau pembagi nol)
  - `evalPairs(s: MockState, projectId: string, task: TaskKind): { pairs: EvalPair[]; excluded: number; items: { gold: GoldItem; result?: { id: string; pred: string; conf: number; auto: boolean } }[] }` (relevansi: kunci `findingId:candidateId` → hasil terkini ber-`hasModelVerdict`; klasifikasi: `itemRef` = id item → `currentClassResults`; item tanpa hasil/verdict → `excluded`)
  - `agreementPairs(s, projectId, task): { a: string; b: string }[]` (item dengan `label` dan `labelB`)
  - `reviewShareOf(s, projectId, task): number | null` (bagian non-`otomatis` dari hasil terkini tugas; relevansi memakai `currentAssessments` seluruh temuan proyek; null bila tak ada hasil)
  - `buildEvaluation(s: MockState, projectId: string, task: TaskKind, ctx: { id: string; at: string; actorId: string }): EvaluationRun | null` (null bila `activeSpec` tak ada; `modelId` dari hasil terkini pertama atau "jev-demo-fixture"; `specVersion` = versi spec aktif; `accuracy`/`macroF1` 0 bila n=0 dengan `n: 0` — UI menampilkan "–" bila `n === 0`)
  - `TARGETS`: `{ aktivitas: { accuracy: 0.85 }, relevansi: { accuracy: 0.7 }, catatan: { accuracy: 0.85 }, highConfAccuracy: 0.8, reviewShareMax: 0.3 }`
- Seed set acuan (`goldItems` di `data.ts`, id `g-<task>-<ref>`, proyek `p-p2p`, `labeler` `u-dimas`, `createdAt` `MOCK_TODAY + "T09:00:00Z"`):
  - relevansi: `f-bottleneck:c1`=relevan, `:c2`=sebagian_relevan, `:c3`=sebagian_relevan, `:c4`=tidak_relevan, `:c5`=informasi_tidak_cukup, `f-rework:c7`=relevan.
  - aktivitas: label sama dengan `top` tabel Task 2 kecuali a02=pencatatan_dokumen, a14=pencatatan_dokumen, a18=pembuatan, a19=pembayaran. `labelB`/`labelerB` (`u-anton`) pada a01…a12 sama dengan label pertama kecuali a02=pembuatan dan a06=perubahan.
  - catatan: label sama dengan `top` tabel Task 2 kecuali n05=dokumen_kurang dan n11=dokumen_kurang.
- Seed harus menghasilkan: akurasi relevansi 5/6, aktivitas 16/20, catatan 14/16 (diuji lewat `computeMetrics(evalPairs(...).pairs)`).

- [ ] **Step 1: Write failing tests** (`evaluation.test.ts`): `computeMetrics([])` → akurasi null, `bins` panjang 5 semua `n:0`; satu pasangan benar → akurasi 1, macroF1 1; contoh tangan 4 pasangan (pred/label: a/a, a/b, b/b, b/b dengan conf .9/.7/.5/.85, auto true/false/false/true) → akurasi .75, macroF1 `(2/3 + 0.8)/2` (F1 a = 2·0,5·1/(1,5)=0,6667, F1 b = 2·1·0,6667/(1,6667)=0,8) → 0.7333 (toBeCloseTo 4), autoCoverage .5, autoAccuracy 1, highConf `{n: 2, accuracy: 1}` (conf ≥ .8: .9 dan .85), bins: conf .9 masuk bin [.9,1.0], .85 masuk [.8,.9), .7 masuk [.6,.8)… pastikan tepi: nilai persis .8 → bin [.8,.9), persis 1.0 → bin terakhir; `meanConf` dan `accuracy` per bin benar; bin kosong `accuracy: null`. `cohenKappa`: sepakat penuh dengan ≥ 2 kelas → 1; kebetulan murni (a/b,b/a) → negatif; semua label sama (pembagi nol) → null; < 2 pasangan → null. `evalPairs` untuk relevansi: c3 pasangan `pred: "relevan", label: "sebagian_relevan"`; item yang hasilnya `supersededBy`, atau gagal (tambahkan gold `f-rework:c8` pada state uji) → `excluded` 1 dan tidak crash; gold yang merujuk kandidat tak ada → `excluded`. Seed: tiga akurasi persis di atas; `reviewShareOf` aktivitas = 4/20 (a02, a06, a14, a18 → 0,2) dan catatan 2/16; `agreementPairs` aktivitas 12 pasangan; `cohenKappa` aktivitas dari seed bernilai antara 0 dan 1 (tidak null); `buildEvaluation` set acuan kosong → `n: 0`, tidak `NaN`.
- [ ] **Step 2: Run** `pnpm --filter web test -- evaluation seed` — Expected: FAIL.
- [ ] **Step 3: Implement** `evaluation.ts` dan seed set acuan; sambungkan `goldItems` ke `initialState`.
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm --filter web exec tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): M08b evaluation metrics and gold set seed`

### Task 4: Reducer klasifikasi, set acuan, evaluasi, spesifikasi

**Files:**
- Create: `apps/web/lib/mock/classification-reducer.ts`
- Modify: `apps/web/lib/mock/reducer.ts` (varian `MockAction`, delegasi), `apps/web/lib/mock/assessment-reducer.ts` (koreksi relevansi dengan `addToGoldSet` membuat item set acuan)
- Test: `apps/web/lib/mock/classification-reducer.test.ts`, `apps/web/lib/mock/assessment-reducer.test.ts`

**Interfaces:**
- Consumes: Task 1–3 (`classCorrectionSchema`, `thresholdsSchema`, `validateSpecInput`, `slugify`, `activeSpec`, `runClassFixture`, `classStatus`, `effectiveClass`, `buildEvaluation`).
- Produces (`MockAction` varian): `{ type: "runClassification"; projectId: string; task: "aktivitas" | "catatan"; scope: "belum_dinilai" | "semua" }`, `{ type: "correctClass"; resultId: string; category: string; reason: string; addToGoldSet: boolean }`, `{ type: "confirmClass"; resultId: string }`, `{ type: "setGoldLabel"; projectId: string; task: TaskKind; itemRef: string; label: string }`, `{ type: "removeGoldItem"; goldId: string }`, `{ type: "runEvaluation"; projectId: string; task: TaskKind }`, `{ type: "saveSpec"; projectId: string; task: TaskKind; question: string; categories: { label: string; definition: string }[]; thresholds: Thresholds; note?: string }`. `ReduceResult` + `resultId?`, `goldId?`, `evaluationId?`, `specId?`.
- Produces: `reduceClassification(state: MockState, action: ClassificationAction, ctx: { now: string; newId: (prefix: string) => string; audit: (s: MockState, e: Omit<AuditEvent, "id" | "at" | "actorId" | "result">) => MockState }): ReduceResult`.

Aturan (pesan dari Global Constraints; audit `objectType` dan `objectLabel`):
- `runClassification`: izin `classify.run`; menilai item tugas itu tanpa hasil terkini (`belum_dinilai`) atau semua (`semua`, menandai hasil lama `supersededBy` hasil baru); spesifikasi aktif dipakai (ambang dan `specVersion`); tak ada yang dinilai → "Semua item sudah dinilai". Audit `klasifikasi.jalankan` ("Klasifikasi", label = "aktivitas"/"catatan").
- `correctClass`: izin `classify.correct`; kategori harus ada di spesifikasi aktif (selain itu "Kategori tidak ada di spesifikasi"); skema `classCorrectionSchema`; menambah `ClassCorrection` (`confirmedOnly: false`), hasil tidak diubah; bila `addToGoldSet`, buat/perbarui item set acuan (`setGold` internal: label = kategori). Audit `klasifikasi.koreksi` (label = teks item).
- `confirmClass`: hanya status `otomatis`/`perlu_review` ("Hanya hasil otomatis atau perlu review yang dapat dikonfirmasi"); koreksi `confirmedOnly: true`, kategori = argmax, alasan "Dikonfirmasi analis". Audit `klasifikasi.konfirmasi`.
- `setGoldLabel`: izin `gold.edit`; label wajib salah satu opsi tugas ("Label tidak valid"; relevansi: empat `Relevance`; klasifikasi: kunci spesifikasi aktif); `itemRef` harus ada ("Item tidak ditemukan": relevansi `findingId:candidateId` pada temuan proyek; klasifikasi id `ClassItem` proyek); aturan pelabel dari spec; label sama persis tanpa perubahan → "Tidak ada perubahan". Audit `acuan.simpan` (label = ref).
- `removeGoldItem`: izin `gold.edit`; "Item acuan tidak ditemukan"; audit `acuan.hapus`.
- `runEvaluation`: izin `evaluation.run`; `buildEvaluation` dengan id baru, ditambahkan ke `evaluations` (run lama dipertahankan); audit `evaluasi.jalankan` (label = tugas).
- `saveSpec`: izin `spec.edit`; `validateSpecInput` (pesan pertama jadi galat), `thresholdsSchema`; versi baru = versi aktif + 1 dengan kunci kategori = `slugify(label)`; kategori relevansi dipaksa `[]`; sama persis dengan versi aktif (pertanyaan, kategori kunci+label+definisi, ambang) → "Tidak ada perubahan"; audit `spesifikasi.simpan` (label = `"{task} v{n}"`).
- `correctAssessment` M08a: bila `addToGoldSet` true, sukses juga membuat/memperbarui item set acuan relevansi `findingId:candidateId` dengan `label = relevance` (tetap tepat satu audit event, `koreksi`).

- [ ] **Step 1: Write failing tests** (`classification-reducer.test.ts`, pola `assessment-reducer.test.ts`): jalankan `belum_dinilai` pada state tanpa hasil catatan (hapus `classResults` catatan di salinan) → 16 hasil dan satu audit; ulang → "Semua item sudah dinilai" dengan state sama; `semua` menandai hasil lama `supersededBy`; ambang spec v2 `{topProb:0.95}` lalu `semua` → hasil baru berstatus `perlu_review` dan `specVersion` 2 sementara hasil lama tetap; koreksi a19 → `lainnya` diganti `pembayaran`, hasil asli tak berubah (`toBe` referensi array `classResults`), audit `klasifikasi.koreksi`; `addToGoldSet` true → gold a19 diperbarui; kategori tak dikenal → "Kategori tidak ada di spesifikasi"; alasan kosong dan 501 karakter; konfirmasi a01 sukses, a02? (`perlu_review`) sukses, hasil `gagal` ditolak; `setGoldLabel` oleh `u-dimas` pada item baru membuat item dengan `labeler`; oleh `u-anton` (analis p-p2p; ganti `viewerId` pada salinan state) mengisi `labelB`; label tidak valid; item tak ada; `removeGoldItem`; `runEvaluation` aktivitas pada seed → satu run dengan `accuracy` 0.8 dan `specVersion` 1, run kedua menambah (dua run), audit `evaluasi.jalankan`; `saveSpec` aktivitas dengan kategori baru → versi 2, kunci slug, tanpa perubahan → "Tidak ada perubahan", kategori duplikat → "Label kategori duplikat", `topProb: 0.2` ditolak, relevansi dengan `categories` terisi tetap tersimpan `[]`; izin: `u-sari` dan `u-rina` ditolak pada semua tujuh aksi dengan state sama; proyek `ditangguhkan` → "Proyek ini tidak menerima data baru". `assessment-reducer.test.ts`: koreksi relevansi dengan `addToGoldSet: true` menambah satu item `goldItems` (`f-bottleneck:c3` diperbarui jika sudah ada: jumlah item tetap) dan tetap tepat satu audit.
- [ ] **Step 2: Run** `pnpm --filter web test -- classification-reducer assessment-reducer` — Expected: FAIL.
- [ ] **Step 3: Implement** reducer, sambungkan di `reduce`, perluas `ReduceResult`.
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm --filter web exec tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): M08b-d reducer actions`

### Task 5: Sub-tab, halaman Spesifikasi, tanda spesifikasi usang

**Files:**
- Modify: `apps/web/components/project/assessment-tabs.tsx`, `apps/web/components/project/candidate-panel.tsx`, `apps/web/components/project/candidate-table.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/assessments/specs/page.tsx`, `apps/web/components/project/spec-view.tsx`
- Test: browser (Task 8); logika sudah diuji.

**Interfaces:**
- Consumes: `activeSpec`, `specVersions`, `isStale`, `validateSpecInput`, `slugify`, `dispatch({ type: "saveSpec", ... })`, `can("spec.edit"|"spec.view")`, `acceptsData`.
- Produces: `AssessmentTabs({ active }: { active: "temuan" | "antrean" | "klasifikasi" | "evaluasi" | "spesifikasi" })` (tab baru "Klasifikasi" → `${base}/assessments/classification`, hitungan = jumlah `classQueue` aktivitas + catatan; "Evaluasi" → `${base}/assessments/evaluation`; "Spesifikasi" → `${base}/assessments/specs`; "Temuan"/"Antrean" tetap); `SpecView({ task }: { task: TaskKind })` (komponen klien); halaman server `specs/page.tsx` menerima `searchParams` (`task` valid salah satu `TaskKind`, selain itu `"relevansi"`) dan merender `AssessmentTabs active="spesifikasi"` + `SpecView`.

- [ ] **Step 1: Implement** `AssessmentTabs` dengan lima tab (tab Temuan/Antrean tetap bekerja di semua halaman); pemilih tugas (`relevansi`/`aktivitas`/`catatan`, tautan `?task=`).
- [ ] **Step 2: Implement `SpecView`**: kartu versi aktif (pertanyaan, kategori sebagai daftar kunci → label → definisi, tiga ambang dengan teks penjelas "Hasil otomatis bila probabilitas teratas ≥ {topProb} dan selisih ≥ {margin}"), riwayat versi (nomor, tanggal, pelaku, catatan), formulir sunting untuk `can("spec.edit")` dan proyek aktif: input pertanyaan, editor kategori (baris label + definisi, tombol tambah dan hapus; untuk `relevansi` bagian kategori diganti teks "Kategori relevansi tetap"), tiga input angka ambang, catatan perubahan, tombol "Simpan versi baru"; galat reducer inline (role="alert"), sukses menampilkan versi baru. Nilai awal formulir = versi aktif dan dimuat ulang saat versi aktif berubah.
- [ ] **Step 3: Tanda usang**: pada `CandidatePanel` (metadata) dan `CandidateTable` (kolom status atau pill) tampilkan pill "Spesifikasi telah diperbarui" bila `isStale(a.specVersion, state, project.id, "relevansi")`.
- [ ] **Step 4: Run** `pnpm --filter web test`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): M08d specs page and stale spec marker`

### Task 6: Halaman Klasifikasi

**Files:**
- Create: `apps/web/app/(app)/projects/[projectId]/assessments/classification/page.tsx`, `apps/web/components/project/classification-view.tsx`, `apps/web/components/project/class-correction-modal.tsx`
- Test: browser (Task 8).

**Interfaces:**
- Consumes: `currentClassResults`, `effectiveClass`, `topTwoOf`, `classSummary`, `noteAggregation`, `classQueue`, `activeSpec`, `isStale`, `AssessmentStatusBadge`-setara untuk `ClassStatus` (buat `ClassStatusBadge` di `components/project/assessment-status.tsx` memakai teks label Bahasa Indonesia untuk `otomatis`/`perlu_review`/`gagal`), `ProbabilityBars`, `NoraModal`, `formatPercent`, dispatch `runClassification|correctClass|confirmClass`.
- Produces: halaman server menerima `searchParams.task` (`aktivitas` | `catatan`, selain itu `aktivitas`); `ClassificationView({ task }: { task: "aktivitas" | "catatan" })`; `ClassCorrectionModal({ result, item, spec, onClose })`.

- [ ] **Step 1: Implement `ClassificationView`**: pemilih tugas (tab Aktivitas/Catatan), banner untuk catatan ("Data sintetis; BPI 2019 tidak memiliki catatan teks"), tombol "Jalankan klasifikasi" (`belum_dinilai` bila ada item tanpa hasil, selain itu "Ulangi semua" dengan konfirmasi `NoraModal` yang menjelaskan hasil lama dan koreksinya disimpan sebagai riwayat dan tidak berlaku bagi hasil baru), galat di `Banner`; ringkasan per kategori (bilah jumlah, label kategori dari spesifikasi, kunci mentah bila tidak ada di spesifikasi); untuk catatan juga tabel agregasi per aktivitas dan per periode (`noteAggregation`); filter status (select: semua, otomatis, perlu_review, gagal); tabel item: teks (terpotong, `title`), konteks, kategori efektif + "(model)"/"(analis)", teratas dan kedua dengan persen (gagal → "–"), status, label "Dinilai model" selama belum ada koreksi/konfirmasi, pill "Spesifikasi telah diperbarui" bila usang, tombol "Koreksi" dan "Konfirmasi" hanya untuk `can("classify.correct")` dan proyek aktif (konfirmasi hanya untuk status `otomatis`/`perlu_review` yang belum dikoreksi, tombol Koreksi untuk semua kecuali superseded).
- [ ] **Step 2: Implement `ClassCorrectionModal`** (pola `correction-modal.tsx`): radio kategori dari spesifikasi aktif (nilai awal = kategori efektif saat ini), alasan wajib dengan penghitung `n/500`, kotak "Masukkan ke set acuan evaluasi", validasi `classCorrectionSchema` + galat reducer inline, modal tetap terbuka saat galat.
- [ ] **Step 3: Implement halaman server** dan pastikan hard load `/assessments/classification?task=catatan` render.
- [ ] **Step 4: Run** `pnpm --filter web test`, `tsc --noEmit`, `pnpm --filter web build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): M08c classification page`

### Task 7: Halaman Evaluasi

**Files:**
- Create: `apps/web/app/(app)/projects/[projectId]/assessments/evaluation/page.tsx`, `apps/web/components/project/evaluation-view.tsx`, `apps/web/components/project/reliability-chart.tsx`
- Test: browser (Task 8).

**Interfaces:**
- Consumes: `evalPairs`, `computeMetrics`, `cohenKappa`, `agreementPairs`, `reviewShareOf`, `TARGETS`, `activeSpec`, `dispatch({ type: "setGoldLabel"|"removeGoldItem"|"runEvaluation" })`, `formatPercent`.
- Produces: halaman server menerima `searchParams.task` (`relevansi` | `aktivitas` | `catatan`, selain itu `aktivitas`); `EvaluationView({ task }: { task: TaskKind })`; `ReliabilityChart({ bins }: { bins: Bin[] })` (per bin: rentang, `n`, bilah keyakinan rata-rata dan bilah akurasi, angka persen keduanya, "–" untuk bin kosong; garis diagonal tidak wajib, sertakan tabel angka sebagai teks).

- [ ] **Step 1: Implement `EvaluationView`**: pemilih tugas; bagian "Set acuan": ukuran set, kesepakatan pelabel (kappa dan jumlah item dua label; "–" bila null), tabel item (rujukan atau teks item terpotong, label pelabel pertama, label kedua, status kesepakatan sepakat/berbeda/belum ada label kedua, prediksi model dengan keyakinan, dikecualikan bila tidak ada hasil/verdict), kontrol analis (select label dari opsi tugas yang memanggil `setGoldLabel`; tombol hapus), galat reducer di `Banner`; bagian "Laporan": hasil `computeMetrics(evalPairs(...))` langsung (kartu: akurasi, macro-F1, cakupan otomatis, akurasi otomatis, bagian perlu_review, akurasi pada keyakinan ≥ 0,8) masing-masing dengan target dari `TARGETS` dan penanda "memenuhi"/"belum memenuhi"/"–" (teks, bukan hanya warna) berlabel "Target [perlu validasi Javan]"; `ReliabilityChart`; jumlah dikecualikan; tombol "Jalankan evaluasi" (analis, proyek aktif) yang menyimpan run; riwayat run tugas itu (tanggal, model, spesifikasi v, n, akurasi, macro-F1, selisih akurasi dengan run sebelumnya dalam poin persen). n=0 → "Set acuan kosong" dan tidak ada angka `NaN`.
- [ ] **Step 2: Implement halaman server** dan pastikan hard load `/assessments/evaluation?task=aktivitas` render.
- [ ] **Step 3: Run** `pnpm --filter web test`, `tsc --noEmit`, `pnpm --filter web build` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(web): M08b evaluation page`

### Task 8: Verifikasi akhir

**Files:** hanya perbaikan yang ditemukan.

- [ ] **Step 1:** `pnpm --filter web test && pnpm --filter web build` — Expected: lulus.
- [ ] **Step 2: Browser** (server dev dari `../.claude/launch.json` entri `web-m08`, port 3108): hard load tiga halaman baru dengan `?task=` berbeda; klasifikasi aktivitas: 6 item non-otomatis, koreksi a19 → `pembayaran` dengan "masukkan ke set acuan", konfirmasi a01; catatan: banner sintetis dan agregasi; evaluasi aktivitas: akurasi 80%, kappa tampil, "Jalankan evaluasi" menambah riwayat; ubah label acuan lalu jalankan lagi dan lihat selisih; spesifikasi: ubah `topProb` ke 0,95 lalu jalankan klasifikasi "semua" (tanda usang pada hasil lama sebelum run, `perlu_review` bertambah sesudahnya); peran Sari/Rina tanpa kontrol tulis; proyek ditangguhkan menyembunyikan kontrol; tidak ada gulir horizontal pada 1024 dan 1280.
- [ ] **Step 3:** perbaiki temuan, jalankan ulang Step 1, commit `fix(web): M08b-d verification fixes` (lewati bila tidak ada).
