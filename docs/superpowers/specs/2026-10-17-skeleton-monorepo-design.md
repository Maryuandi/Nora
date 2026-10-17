# Spec: Skeleton monorepo Nora

Tanggal: 17 Oktober 2026. Status: menunggu review.

Acuan: [feature-modules-v1.3.md](../../feature-modules-v1.3.md) dan [PRD M01–M13](../../prd/).

## Tujuan

Menyediakan kerangka repo yang **bisa dijalankan** dan membuktikan pola eksekusi PRD (API menerima → worker memproses → UI membaca) sebelum fitur modul apa pun dibangun.

**Berhasil bila:** pada mesin dengan Docker, `pnpm install`, `pnpm infra:up`, lalu `pnpm dev` menghasilkan:

1. Halaman `/health` menampilkan keempat layanan (Postgres, Neo4j, MinIO, Temporal) berstatus terhubung.
2. Alur ping berhasil end-to-end: web → Temporal → worker TS → worker Python → hasil terbaca lewat API.
3. `pnpm test` lulus (Vitest + pytest).

## Di luar cakupan

ORM dan skema database, autentikasi/otorisasi, logika modul M01–M13, deployment VPS, CI. Semuanya diputuskan saat membangun M01, agar skeleton tidak mengunci pilihan lebih awal.

## Struktur

```
nora/
  apps/web/              Next.js App Router + TypeScript
  apps/worker/           Worker TypeScript Temporal
  workers/python/        Worker Python (uv, Python 3.12)
  packages/contracts/    Skema Zod + JSON Schema hasil ekspor
  infra/                 docker-compose.yml
  docs/                  PRD, katalog modul, spec
  package.json           Skrip root + pnpm workspaces
  pnpm-workspace.yaml
  .env.example
```

Workspace pnpm: `apps/*`, `packages/*`. `workers/python` bukan paket pnpm; dikelola uv.

## Komponen

### `infra/docker-compose.yml`

| Layanan | Image | Port host | Catatan |
|---|---|---|---|
| postgres | `postgres:17` | 5432 | DB `nora`, volume bernama |
| neo4j | `neo4j:5-community` | 7474, 7687 | Auth dari env |
| minio | `minio/minio` | 9000 (API), 9001 (console) | Bucket `nora` dibuat oleh service init `minio/mc` |
| temporal | `temporalio/temporal` dengan `server start-dev --ip 0.0.0.0` | 7233 (gRPC), 8233 (UI) | Dev server bawaan, cukup untuk lokal; Temporal produksi diputuskan saat deploy |

Kredensial dev diambil dari `.env` (disalin dari `.env.example`). Tidak ada rahasia nyata di repo.

### `packages/contracts`

- Skema Zod `PingRequest` (`{ message: string (1–200 karakter) }`) dan `PingResult` (`{ message, pm4pyVersion, handledBy: "python" }`).
- Tipe TypeScript diinfer dari skema (`z.infer`), tidak ditulis manual.
- Skrip `export` menulis JSON Schema via `z.toJSONSchema()` ke `packages/contracts/schemas/<nama>.json`. File hasil ekspor **di-commit**, sehingga worker Python tidak butuh Node.
- Konstanta bersama: nama task queue `nora-ts` dan `nora-python`.

### `apps/web`

- Halaman beranda dengan daftar 13 modul; tiap modul punya rute kosong `/m01` … `/m13` berisi judul dan tautan ke PRD-nya.
- `POST /api/ping`: validasi body dengan `PingRequest`; tidak valid → `400` dengan detail error Zod. Valid → mulai workflow `pingWorkflow` di queue `nora-ts` dengan workflow ID unik, balas `202 { workflowId, status: "running" }`.
- `GET /api/ping/[id]`: baca status workflow. Selesai → `200 { status: "completed", result }`. Berjalan → `200 { status: "running" }`. Gagal → `200 { status: "failed", error }`. ID tidak dikenal → `404`.
- `/health`: Server Component yang memeriksa keempat layanan secara paralel dengan batas waktu 2 detik per layanan; tiap layanan tampil `ok` atau `error` beserta pesan singkat. Satu layanan mati tidak membuat halaman gagal.
- Route Handler tidak menjalankan pekerjaan berat; hanya memulai dan membaca workflow (sesuai PRD).

### `apps/worker`

- Worker Temporal TypeScript di queue `nora-ts`.
- `pingWorkflow(input)`: memanggil activity `pythonPing` pada queue `nora-python` (timeout 30 detik, retry bawaan Temporal maksimal 3 kali), lalu memvalidasi hasilnya dengan `PingResult` sebelum dikembalikan.

### `workers/python`

- Proyek uv, Python 3.12, dependensi: `temporalio`, `pm4py`, `jsonschema`.
- Worker Temporal di queue `nora-python` dengan activity `pythonPing`.
- Activity memvalidasi payload terhadap `packages/contracts/schemas/PingRequest.json`; tidak valid → `ApplicationError` non-retryable. Valid → kembalikan `{ message, pm4pyVersion, handledBy: "python" }`.
- Python tidak mengimpor atau menjalankan Zod (sesuai kontrak di katalog modul).

### Skrip root

| Perintah | Fungsi |
|---|---|
| `pnpm infra:up` / `pnpm infra:down` | `docker compose -f infra/docker-compose.yml up -d` / `down` |
| `pnpm dev` | Jalankan web, worker TS, dan worker Python bersamaan (paket `concurrently`) |
| `pnpm contracts:export` | Tulis ulang JSON Schema |
| `pnpm test` | Vitest di workspace TS + `uv run pytest` di `workers/python` |

## Alur data ping

1. UI atau `curl` → `POST /api/ping { message }`.
2. Web validasi Zod → mulai `pingWorkflow` → `202`.
3. Worker TS menjalankan workflow → activity `pythonPing` di queue Python.
4. Worker Python validasi JSON Schema → kembalikan hasil.
5. Worker TS validasi `PingResult` → workflow selesai.
6. `GET /api/ping/{id}` → `completed` + hasil.

## Penanganan error

- Input invalid ditolak di web (Zod) sebelum masuk Temporal.
- Payload yang lolos web tetapi gagal JSON Schema di Python gagal non-retryable, dan statusnya terbaca `failed` di API. Ini menandakan kontrak TS dan Python tidak sinkron.
- Temporal tidak terjangkau saat `POST /api/ping` → `503 { error: "temporal_unavailable" }`.

## Tes

- **Vitest (`packages/contracts`)**: `PingRequest` menolak pesan kosong dan > 200 karakter. JSON Schema yang di-commit identik dengan hasil ekspor terbaru (mencegah kontrak basi).
- **Vitest (`apps/web`)**: `POST /api/ping` dengan body invalid → `400` (klien Temporal di-mock).
- **pytest (`workers/python`)**: activity menolak payload tanpa `message` dan menerima payload valid.
- **Manual**: `/health` semua `ok`; `curl` alur ping sampai `completed`.

## Asumsi

- Pengembang memasang Docker Desktop atau OrbStack sendiri (belum ada di mesin saat spec ditulis).
- Versi paket: rilis stabil terbaru saat scaffold, dikunci lewat `pnpm-lock.yaml` dan `uv.lock`.
- Node 22 LTS atau lebih baru; mesin saat ini memakai Node 26.
