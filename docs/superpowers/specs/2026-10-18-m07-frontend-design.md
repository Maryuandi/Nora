# Spec: M07 frontend, Jejak bukti dan pengetahuan proses (data tiruan)

Tanggal: 18 Oktober 2026. Status: menunggu review.

Acuan: [PRD M07](../../prd/m07-jejak-bukti-pengetahuan-proses-prd.md), Story 1, 2, 3, 5, 6 (sisi UI). Dibangun di atas `feat/m04c-frontend` (snapshot, pemetaan, aturan sudah ada di `apps/web/lib/mock/`), komponen Untitled UI, token Nora, ikon Phosphor. Branch baru: `feat/m07-frontend`. Tidak ada Neo4j, outbox, Temporal, atau retrieval sungguhan.

## Tujuan

Analis menunjukkan asal sebuah temuan sampai snapshot sumber dan dokumen aturan, menjelajah konteks di sekitar aktivitas, dan membuka paket bukti yang diberikan ke model. Administrator melihat kesegaran graph dan memicu pembangunan ulang. Hubungan hipotesis tidak pernah tampil sebagai fakta.

**Berhasil bila:**

1. Proyek punya tab "Jejak" dengan lima rute (di bawah) yang dapat dicapai lewat navigasi.
2. Dari satu temuan p2p, jejak tampil sebagai graf (React Flow) dan daftar bertingkat sampai snapshot dan dokumen sumber; tiap simpul menaut ke halaman asal.
3. Dari penilaian Jev tiruan, analis membuka paket bukti: item beserta versi, item dikecualikan karena anggaran, hash.
4. `pnpm --filter web test` dan `pnpm --filter web build` lulus.

## Di luar cakupan

Neo4j, outbox, worker proyeksi, retrieval sungguhan (hanya hasilnya yang ditiru), embedding (Fase 2), Cypher dari UI, halaman M05/M06/M08/M10/M11 (simpul menuju placeholder), audit untuk setiap pembukaan paket bukti, layar ponsel.

## Rute dan layar

| Rute | Isi |
|---|---|
| `/projects/[id]/trace` | Daftar temuan (nama, metrik, status graph, jumlah bukti). Titik masuk. |
| `/projects/[id]/trace/findings/[findingId]` | Jejak bukti. Toggle Graf / Daftar bertingkat. Panel detail simpul terpilih. |
| `/projects/[id]/trace/explore?node=` | Eksplorasi aktivitas/transisi. Pemilih simpul di atas, hasil per kategori relasi. |
| `/projects/[id]/trace/bundles/[bundleId]` | Paket bukti. |
| `/projects/[id]/trace/graph-status` | Kesegaran, antrean gagal, tombol rebuild. |

Tab "Jejak" (ikon `TreeStructure`) ditambah di `projects/[projectId]/layout.tsx` setelah "Konteks"; aktif untuk semua path di bawah `/trace`. Sub-navigasi `TraceTabs` (pola `ContextTabs`): "Temuan", "Eksplorasi", "Status graph". Halaman findings dan bundles tidak punya tab sendiri, memakai tombol kembali.

Selalu tampil di halaman graf dan eksplorasi: banner tetap "Hubungan dalam graph bukan bukti sebab-akibat."

## Model data tiruan (`lib/mock/types.ts`)

```ts
type RelationCategory = "asal_usul" | "observasi" | "dukungan_hipotesis" | "keputusan";
type RelationCreator = "sistem" | "model" | "pengguna";
type GraphNodeKind =
  | "Source" | "Snapshot" | "MappingVersion" | "Rule" | "Document"
  | "Activity" | "Transition" | "Analysis" | "MetricDefinition" | "Finding"
  | "Hypothesis" | "Intervention" | "Assessment" | "EvidenceBundle" | "Decision";

interface GraphNode {
  id: string; projectId: string; kind: GraphNodeKind;
  label: string; sublabel?: string;
  href: string | null;     // halaman asal; null = placeholder modul belum ada
  module: "M02" | "M03" | "M04" | "M05" | "M06" | "M08" | "M11";
  supersededBy?: string;   // id simpul versi lebih baru
}
interface GraphEdge {
  id: string; projectId: string; from: string; to: string;
  type: string;            // DERIVED_FROM, OBSERVED_AT, MAY_EXPLAIN, ...
  category: RelationCategory; createdBy: RelationCreator;
  status: "aktif" | "digantikan"; recordId: string; at: string;
}

interface Finding { id: string; projectId: string; title: string; metric: string; value: string; analysisId: string; at: string }

interface BundleItem { nodeId: string; version: number | null; kind: GraphNodeKind; summary: string }
interface EvidenceBundle {
  id: string; projectId: string; hash: string;
  target: string;          // id simpul
  purpose: "jev_assessment" | "llm_interpretation";
  requestedBy: string; at: string;
  budget: { items: number; tokens: number };
  items: BundleItem[];
  excluded: { nodeId: string; reason: "dikecualikan karena anggaran" | "di luar hak akses"; kind: GraphNodeKind }[];
  limitedContext: boolean; // PRD: "konteks terbatas"
  assessmentId: string;
}

interface GraphStatus { version: number; projectedAt: string; authoritativeAt: string; failed: { eventId: string; reason: string; attempts: number }[]; rebuilding: boolean }
```

`MockState` bertambah: `findings`, `bundles`, `graphNodes`, `graphEdges` (hanya simpul/relasi seed: Finding, Analysis, MetricDefinition, Activity, Transition, Hypothesis, Intervention, Assessment, EvidenceBundle, Decision, Document), dan `graphStatus: Record<projectId, GraphStatus>`.

Simpul `Source`, `Snapshot`, `MappingVersion`, `Rule` **tidak diseed**: diturunkan dari `sources`, `snapshots`, `mappings`, `rules` yang sudah ada oleh `buildGraph` sehingga tautan dan "ada versi lebih baru" selalu konsisten (mapping versi lebih tinggi pada sumber yang sama, aturan versi lebih tinggi pada `ruleKey` yang sama). `href` menuju halaman M02/M03/M04c yang sudah ada.

## Data awal (proyek `p-p2p`)

Satu rantai penuh agar demo MVP jalan:

- Temuan "Durasi PO ke Goods Receipt melewati SLA di 23% kasus" → `Analysis` "Peta proses Q3" → `MetricDefinition` "Waktu siklus PO→GR" + filter → `Snapshot sn-1` + `MappingVersion m-1` (dan bila ada, aturan `r-sla` v1 yang kini `usang`, v2 `disetujui`, sehingga simpul v1 bertanda "ada versi lebih baru").
- Temuan terhubung ke `Rule r-sla-2` → `Document` "SOP Pengadaan" bagian 4.2.
- `Activity` "Record Goods Receipt" dan "Clear Invoice" + `Transition` di antaranya; `OBSERVED_AT` dari temuan.
- `Hypothesis` "Persetujuan manual memperlambat PO" (`MAY_EXPLAIN`, pembuat `model`) dan `Intervention` "Approval ganda otomatis"; satu `Decision` (relasi `REVIEWED`, pembuat `pengguna`).
- Satu `Assessment` Jev → satu `EvidenceBundle` berisi 7 item, 2 dikecualikan karena anggaran, 1 dikecualikan karena hak akses.
- Satu temuan kedua tanpa aturan dan tanpa kandidat katalog: paketnya `limitedContext: true`.
- `graphStatus` p-p2p: terlambat 40 detik (segar). Satu proyek lain: terlambat 12 menit dengan satu event gagal (menampilkan tanda "konteks mungkin belum terbaru").
- Proyek lain tanpa temuan: layar menampilkan keadaan kosong.

## Fungsi murni (`lib/mock/graph.ts`, baru, tanpa React)

- `RELATION_META: Record<RelationCategory, { label; icon; color; unproven: boolean }>`. `dukungan_hipotesis.unproven = true` → label "belum terbukti".
- `buildGraph(state, projectId): { nodes; edges }`: gabung simpul seed dengan simpul turunan; selalu menyaring `projectId` (simpul/relasi proyek lain tidak pernah muncul). Menandai `supersededBy`.
- `lineage(graph, findingId): LineageResult`: telusuri relasi `asal_usul` dan `observasi` dari temuan; hasil berupa tingkat berurutan (temuan → analisis → metrik+filter → dataset/pemetaan+aturan perbaikan → snapshot; cabang aturan → dokumen+bagian) plus daftar tepi untuk graf. Tidak mengikuti `dukungan_hipotesis`/`keputusan`.
- `neighborhood(graph, nodeId, opts: { perGroup = 50; expanded: Set<RelationCategory> }): { groups: { category; nodes; total; hidden }[] }`: kelompokkan per kategori; kelompok yang lebih dari `perGroup` terpotong dengan `hidden` > 0 sampai di-expand.
- `freshness(status: GraphStatus, now: string, thresholdMin = 5): { lagSeconds; stale: boolean }`.
- `bundleBudgetUsage(bundle)`: item dan token terpakai vs anggaran.

## Reducer (`lib/mock/reducer.ts`)

Aksi baru `rebuildGraph { projectId }`: hanya administrator (cek di UI; reducer mengikuti pola yang ada), proyek `aktif`, tidak sedang `rebuilding`. Menyetel `rebuilding: true`; UI menjalankan timer tiruan, lalu aksi `finishGraphRebuild { projectId }` menaikkan `version`, menyetel `projectedAt = authoritativeAt`, mengosongkan `failed`. Audit `graf.bangun_ulang` (objectType `Graph`) pada saat mulai. Idempoten: memanggil lagi saat `rebuilding` mengembalikan galat "Pembangunan ulang sedang berjalan".

## Izin (`lib/mock/permissions.ts`)

`trace.view`: semua peran. `graph.rebuild`: administrator. Tombol rebuild tersembunyi dengan penjelasan bila bukan administrator atau proyek tidak `aktif`, sama seperti pola M02.

## Komponen (`components/trace/`)

- `RelationBadge` (kategori, pembuat, status; warna dan ikon per kategori; "belum terbukti" untuk hipotesis).
- `GraphCanvas` (React Flow; simpul dikelompokkan per tingkat lineage; tepi diwarnai per kategori; filter kategori; klik simpul membuka `NodePanel`).
- `NodePanel` (detail simpul, relasi masuk/keluar dengan kategori+pembuat+status, tautan "Buka di {modul}" atau badge "Modul belum tersedia").
- `LineageList` (daftar bertingkat, bentuk yang dibaca non-teknis).
- `CategoryFilter`, `TraceNotice` (banner sebab-akibat), `StaleBadge`.
- `BundleItemsTable`, `ExcludedList`, `BudgetMeter`.
- `GraphStatusCard` + `RebuildButton`.

Dependensi baru: `@xyflow/react` saja. Layout graf dihitung sendiri per tingkat (tanpa dagre/elk).

## Rincian layar

**Daftar temuan.** Tabel: judul, metrik+nilai, analisis, jumlah simpul bukti, `StaleBadge` bila graph terlambat. Klik baris membuka jejak.

**Jejak bukti.** Toggle Graf/Daftar (bawaan Daftar di lebar sempit). Simpul "ada versi lebih baru" diberi lencana dan menaut ke versi baru tanpa mengubah jalur. Filter kategori mempengaruhi graf saja. Panel detail menampilkan semua relasi simpul.

**Eksplorasi.** Pemilih aktivitas/transisi (`?node=`). Hasil per kategori dengan ikon/warna; hipotesis diberi "belum terbukti"; tiap kelompok batas 50 dengan tombol "Tampilkan semua (N)". Menampilkan: temuan terkait, aturan, task BPMN (placeholder M04d), hipotesis dan intervensi, keputusan sebelumnya.

**Paket bukti.** Header: target, tujuan, peminta, waktu, hash, tautan ke penilaian. Meter anggaran (item dan token). Tabel item (jenis, versi, ringkasan, tautan). Daftar dikecualikan dengan alasan. Spanduk "Konteks terbatas" bila `limitedContext`. Spanduk "Konteks mungkin belum terbaru" bila graph proyek stale. Dibaca saja, tidak ada aksi ubah.

**Status graph.** Kartu: versi, proyeksi terakhir, keterlambatan, ambang 5 menit. Tabel event gagal. Tombol "Bangun ulang graph" (admin) dengan dialog konfirmasi; progres tiruan ±3 detik.

## Pengujian (vitest)

- `graph.test.ts`: `buildGraph` tidak memuat simpul proyek lain; simpul turunan sinkron dengan state; `supersededBy` benar; `lineage` memuat jalur penuh dan mengabaikan hipotesis/keputusan; `neighborhood` memotong di 50 dan expand membuka sisanya; `freshness` stale lewat 5 menit.
- `graph-reducer.test.ts`: rebuild hanya saat `aktif`, menolak ganda, selesai menaikkan versi dan mengosongkan antrean gagal, satu audit.
- `permissions.test.ts`: `trace.view` semua peran, `graph.rebuild` hanya administrator.
- `seed.test.ts`: tiap seed temuan p-p2p punya jalur utuh sampai snapshot; bundle item dan excluded merujuk simpul yang ada; tidak ada simpul menggantung.

Pengujian komponen mengikuti pola M04c (hanya logika murni yang diuji; layar diperiksa manual di preview).

## Risiko

- React Flow menambah ukuran bundle; dimuat dinamis hanya di halaman jejak.
- Seed graf besar mudah tidak konsisten; ditutup oleh `seed.test.ts` yang memeriksa semua rujukan.
- Pengguna salah membaca hipotesis sebagai fakta; ditutup oleh `RelationBadge`, label "belum terbukti", dan banner tetap.
