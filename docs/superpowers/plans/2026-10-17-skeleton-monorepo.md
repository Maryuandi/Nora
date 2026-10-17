# Skeleton Monorepo Nora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo Nora yang bisa dijalankan dan membuktikan alur web → Temporal → worker TS → worker Python, plus halaman `/health`.

**Architecture:** pnpm workspaces (`apps/*`, `packages/*`) untuk Next.js, worker TS, dan kontrak Zod; `workers/python` dikelola uv. Kontrak Zod diekspor ke JSON Schema yang di-commit dan dibaca Python. Layanan (Postgres, Neo4j, MinIO, Temporal dev server) lewat Docker Compose.

**Tech Stack:** Next.js App Router, TypeScript, Zod 4 (`z.toJSONSchema`), `@temporalio/client|worker|workflow|activity`, Vitest, Python 3.12, uv, `temporalio`, `pm4py`, `jsonschema`, pytest, `concurrently`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-17-skeleton-monorepo-design.md`

Semua path relatif ke root repo `nora/`.

## Global Constraints

- Task queue: `nora-ts` (worker TS) dan `nora-python` (worker Python).
- `PingRequest = { message: string }`, panjang 1–200 karakter.
- `PingResult = { message: string, pm4pyVersion: string, handledBy: "python" }`.
- JSON Schema ditulis ke `packages/contracts/schemas/<Nama>.json` dan di-commit.
- Python tidak memakai Zod; validasi pakai `jsonschema` terhadap file di atas.
- Route Handler hanya memulai/membaca workflow, tidak menjalankan pekerjaan.
- Port: web 3000, Postgres 5432, Neo4j 7474/7687, MinIO 9000/9001, Temporal 7233 (gRPC) / 8233 (UI).
- Health check: batas waktu 2 detik per layanan, diperiksa paralel; satu layanan mati tidak menggagalkan halaman.
- Kredensial dev hanya di `.env.example`; `.env` tidak di-commit (sudah di `.gitignore`).
- Versi paket: rilis stabil terbaru saat scaffold, dikunci `pnpm-lock.yaml` dan `uv.lock`. Node ≥ 22.
- Di luar cakupan: ORM/skema DB, auth, logika modul, deploy, CI.

## Review Focus

- Body `POST /api/ping` bukan JSON (atau kosong) → harus `400`, bukan `500`. Tes di Task 4.
- Pesan tepat 200 karakter diterima, 201 ditolak (batas spec). Tes di Task 2.
- `GET /api/ping/<id>` untuk ID yang tidak pernah dibuat → `404`. Tes di Task 4.
- Health check ke layanan yang menggantung (tidak membalas) → `error` setelah 2 detik, bukan halaman macet. Tes di Task 5.
- Worker Python dijalankan saat file JSON Schema hilang → gagal saat start dengan pesan jelas, bukan error samar saat activity pertama. Tes di Task 3.

---

### Task 1: Root workspace dan infra

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`, `infra/docker-compose.yml`
- Modify: `README.md` (bagian "Menjalankan lokal")

**Interfaces:**
- Produces: env var `DATABASE_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET=nora`, `TEMPORAL_ADDRESS=localhost:7233`. Skrip root `infra:up`, `infra:down` (skrip `dev`, `test`, `contracts:export` ditambah di Task 6).

- [ ] **Step 1:** `package.json` root: `private: true`, `packageManager` pnpm versi terpasang, `engines.node: ">=22"`, skrip `infra:up` = `docker compose --env-file .env -f infra/docker-compose.yml up -d`, `infra:down` sama dengan `down`.
- [ ] **Step 2:** `pnpm-workspace.yaml` berisi `apps/*` dan `packages/*`. `tsconfig.base.json`: `strict: true`, `module`/`moduleResolution` `NodeNext`, `target ES2022`.
- [ ] **Step 3:** `infra/docker-compose.yml` sesuai tabel spec: `postgres:17` (DB `nora`, volume `pgdata`), `neo4j:5-community` (`NEO4J_AUTH=${NEO4J_USER}/${NEO4J_PASSWORD}`, volume `neo4jdata`), `minio/minio` (`server /data --console-address :9001`, volume `miniodata`), service `minio-init` dengan `minio/mc` yang membuat bucket `nora` lalu keluar, `temporalio/temporal` dengan command `server start-dev --ip 0.0.0.0`. Semua nilai kredensial dari env.
- [ ] **Step 4:** `.env.example` berisi semua env var di Interfaces dengan nilai dev (mis. `nora`/`nora-dev-password`).
- [ ] **Step 5: Verifikasi.** Run: `pnpm install && pnpm dlx js-yaml infra/docker-compose.yml > /dev/null`. Expected: exit 0. Bila Docker tersedia: `cp .env.example .env && pnpm infra:up && docker compose -f infra/docker-compose.yml ps` → 4 layanan `running`, `minio-init` `exited (0)`.
- [ ] **Step 6:** README: bagian "Menjalankan lokal" (prasyarat Docker Desktop/OrbStack, Node ≥ 22, pnpm, uv; langkah `cp .env.example .env`, `pnpm install`, `pnpm infra:up`, `pnpm dev`).
- [ ] **Step 7: Commit** `chore: add pnpm workspace and docker compose infra`

### Task 2: `packages/contracts`

**Files:**
- Create: `packages/contracts/package.json` (nama `@nora/contracts`), `src/index.ts`, `src/ping.ts`, `src/queues.ts`, `scripts/export.ts`, `schemas/PingRequest.json`, `schemas/PingResult.json`
- Test: `packages/contracts/src/ping.test.ts`, `packages/contracts/src/schemas.test.ts`

**Interfaces:**
- Produces: `PingRequest`, `PingResult` (skema Zod) dan tipe `PingRequest`, `PingResult` (`z.infer`); `TASK_QUEUE_TS = "nora-ts"`, `TASK_QUEUE_PYTHON = "nora-python"`; fungsi `exportSchemas(): Record<string, object>` (nama file → JSON Schema); skrip `pnpm --filter @nora/contracts export` menulis `schemas/*.json` (JSON terformat 2 spasi + newline).

- [ ] **Step 1: Tes gagal** di `ping.test.ts`:
  - `PingRequest.safeParse({ message: "" }).success === false`
  - `PingRequest.safeParse({ message: "a".repeat(200) }).success === true`
  - `PingRequest.safeParse({ message: "a".repeat(201) }).success === false`
  - `PingResult.safeParse({ message: "hi", pm4pyVersion: "2.7.0", handledBy: "ts" }).success === false`
- [ ] **Step 2:** `schemas.test.ts`: untuk tiap entri `exportSchemas()`, isi `schemas/<nama>.json` sama persis dengan `JSON.stringify(schema, null, 2) + "\n"` (pesan gagal: "run pnpm contracts:export").
- [ ] **Step 3:** Run `pnpm --filter @nora/contracts test` → FAIL (modul belum ada).
- [ ] **Step 4:** Implementasi `ping.ts`, `queues.ts`, `index.ts`, `exportSchemas()` (pakai `z.toJSONSchema`), dan `scripts/export.ts` (jalankan dengan `tsx`).
- [ ] **Step 5:** Run `pnpm --filter @nora/contracts export && pnpm --filter @nora/contracts test` → PASS.
- [ ] **Step 6: Commit** `feat(contracts): add ping schemas and JSON Schema export`

### Task 3: `workers/python`

**Files:**
- Create: `workers/python/pyproject.toml` (uv, `requires-python = ">=3.12"`), `nora_worker/__init__.py`, `nora_worker/contracts.py`, `nora_worker/activities.py`, `nora_worker/main.py`
- Test: `workers/python/tests/test_activities.py`, `workers/python/tests/test_contracts.py`

**Interfaces:**
- Consumes: `packages/contracts/schemas/PingRequest.json` (Task 2), queue `nora-python`.
- Produces: activity bernama `"pythonPing"` dengan input `dict` dan output `{"message", "pm4pyVersion", "handledBy": "python"}`; `load_schema(name: str) -> dict` yang raise `FileNotFoundError` berpesan `"JSON Schema <name> not found at <path>; run pnpm contracts:export"`; entry `uv run python -m nora_worker.main` (baca `TEMPORAL_ADDRESS`).

- [ ] **Step 1: Tes gagal** `test_activities.py`:
  - `python_ping({"message": "hi"})` → `result["message"] == "hi"`, `result["handledBy"] == "python"`, `result["pm4pyVersion"] == pm4py.__version__`.
  - `python_ping({})` raise `temporalio.exceptions.ApplicationError` dengan `non_retryable is True`.
  - `python_ping({"message": "a" * 201})` raise `ApplicationError` non-retryable.
- [ ] **Step 2: Tes gagal** `test_contracts.py`: `load_schema("Missing")` raise `FileNotFoundError` yang pesannya memuat `"pnpm contracts:export"`.
- [ ] **Step 3:** Run `cd workers/python && uv run pytest` → FAIL.
- [ ] **Step 4:** Implementasi. `contracts.py` mencari schema relatif ke root repo (`Path(__file__).resolve().parents[3] / "packages/contracts/schemas"`). `activities.py`: `@activity.defn(name="pythonPing") async def python_ping(payload: dict) -> dict`, validasi pakai `jsonschema.validate`, ubah `ValidationError` jadi `ApplicationError(..., non_retryable=True)`. `main.py`: muat schema `PingRequest` saat start (gagal cepat), lalu jalankan `Worker` di queue `nora-python`.
- [ ] **Step 5:** Run `uv run pytest` → PASS.
- [ ] **Step 6: Commit** `feat(python-worker): add pythonPing activity with JSON Schema validation`

### Task 4: `apps/worker` dan API ping di `apps/web`

**Files:**
- Create: `apps/worker/package.json` (`@nora/worker`), `apps/worker/src/workflows.ts`, `apps/worker/src/main.ts`
- Create: `apps/web` (Next.js App Router, TS, tanpa Tailwind/ESLint tambahan), `apps/web/lib/temporal.ts`, `apps/web/app/api/ping/route.ts`, `apps/web/app/api/ping/[id]/route.ts`
- Test: `apps/web/app/api/ping/route.test.ts`, `apps/web/app/api/ping/[id]/route.test.ts`

**Interfaces:**
- Consumes: `PingRequest`, `PingResult`, `TASK_QUEUE_TS`, `TASK_QUEUE_PYTHON` (Task 2); activity `"pythonPing"` (Task 3).
- Produces: workflow `pingWorkflow(input: PingRequest): Promise<PingResult>`; `getTemporalClient(): Promise<Client>` (singleton, alamat `TEMPORAL_ADDRESS`); API:
  - `POST /api/ping` → `202 { workflowId, status: "running" }` | `400 { error: "invalid_request", issues }` | `503 { error: "temporal_unavailable" }`
  - `GET /api/ping/[id]` → `200 { status: "running" | "completed" | "failed", result?, error? }` | `404 { error: "not_found" }`

- [ ] **Step 1:** `workflows.ts`: `pingWorkflow` memanggil `proxyActivities` dengan `taskQueue: TASK_QUEUE_PYTHON`, `startToCloseTimeout: "30 seconds"`, `retry: { maximumAttempts: 3 }`, activity `pythonPing`; validasi hasil dengan `PingResult.parse`. `main.ts`: `Worker.create` di `TASK_QUEUE_TS` dengan `workflowsPath`. `@nora/worker` tidak punya skrip `test` (spec tidak meminta tes worker TS; `pnpm -r test` melewatinya). Verifikasi: `pnpm --filter @nora/worker exec tsc --noEmit` → tanpa error.
- [ ] **Step 2: Tes gagal** `route.test.ts` (mock `@/lib/temporal`):
  - body `{ message: "" }` → status 400, `error === "invalid_request"`.
  - body teks `"not json"` → status 400.
  - body kosong → status 400.
  - body valid, `workflow.start` dimock sukses → status 202, `workflowId` berawalan `ping-`, `status === "running"`; `workflow.start` dipanggil dengan `taskQueue: "nora-ts"`.
  - `getTemporalClient` dimock reject → status 503, `error === "temporal_unavailable"`.
- [ ] **Step 3: Tes gagal** `[id]/route.test.ts`: handle `describe()` reject dengan `WorkflowNotFoundError` → 404; status `RUNNING` → `{ status: "running" }`; `COMPLETED` + `result()` → `{ status: "completed", result }`; `FAILED` → `{ status: "failed", error }` berisi pesan.
- [ ] **Step 4:** Run `pnpm --filter web test` → FAIL.
- [ ] **Step 5:** Implementasi kedua route. Workflow ID: `ping-${crypto.randomUUID()}`. Parse JSON dalam `try`, kegagalan parse → 400.
- [ ] **Step 6:** Run `pnpm --filter web test` → PASS.
- [ ] **Step 7: Commit** `feat: add ping workflow and ping API routes`

### Task 5: Halaman modul dan `/health`

**Files:**
- Create: `apps/web/lib/modules.ts`, `apps/web/app/page.tsx`, `apps/web/app/[module]/page.tsx`, `apps/web/lib/health.ts`, `apps/web/app/health/page.tsx`
- Test: `apps/web/lib/health.test.ts`, `apps/web/lib/modules.test.ts`

**Interfaces:**
- Consumes: env var dari Task 1, `getTemporalClient` (Task 4).
- Produces: `MODULES: { id: "m01".."m13"; title: string; prdFile: string }[]` (judul dari tabel "Peta modul" di `docs/feature-modules-v1.3.md`, `prdFile` = nama file di `docs/prd/`); `withTimeout<T>(p: Promise<T>, ms: number): Promise<T>`; `checkAll(): Promise<{ name: "postgres" | "neo4j" | "minio" | "temporal"; ok: boolean; message: string }[]>`.

- [ ] **Step 1: Tes gagal** `modules.test.ts`: `MODULES.length === 13`; id unik dan berurutan `m01`…`m13`; setiap `prdFile` ada di `docs/prd/`.
- [ ] **Step 2: Tes gagal** `health.test.ts` (fake timers): `withTimeout(new Promise(() => {}), 2000)` reject dengan pesan `"timeout after 2000ms"` setelah 2000 ms; `checkAll()` dengan satu checker dimock reject tetap mengembalikan 4 entri, entri itu `ok: false`, sisanya `ok: true`.
- [ ] **Step 3:** Run `pnpm --filter web test` → FAIL.
- [ ] **Step 4:** Implementasi. Checker: Postgres `pg` `SELECT 1`; Neo4j `neo4j-driver` `verifyConnectivity()`; MinIO `@aws-sdk/client-s3` `HeadBucket` (`forcePathStyle: true`); Temporal `client.workflowService.getSystemInfo({})`. `checkAll` jalankan paralel via `Promise.allSettled`, tiap checker dibungkus `withTimeout(…, 2000)`. Halaman `/health` Server Component dengan `export const dynamic = "force-dynamic"`. Beranda menampilkan daftar `MODULES` bertaut ke `/<id>`; `[module]/page.tsx` menampilkan judul + nama file PRD, `notFound()` untuk id tak dikenal.
- [ ] **Step 5:** Run `pnpm --filter web test` → PASS; `pnpm --filter web build` → sukses.
- [ ] **Step 6: Commit** `feat(web): add module pages and health page`

### Task 6: Skrip dev/test root dan uji end-to-end

**Files:**
- Modify: `package.json` root, `apps/worker/package.json`, `README.md`

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: skrip root `dev`, `test`, `contracts:export`.

- [ ] **Step 1:** Skrip root: `contracts:export` = `pnpm --filter @nora/contracts export`; `test` = `pnpm -r test && cd workers/python && uv run pytest`; `dev` = `concurrently -n web,worker,python "pnpm --filter web dev" "pnpm --filter @nora/worker dev" "cd workers/python && uv run python -m nora_worker.main"`. Web dan worker TS memuat `.env` root (`dotenv` atau `--env-file=../../.env` pada Node).
- [ ] **Step 2:** Run `pnpm test` → semua lulus.
- [ ] **Step 3: Uji manual (butuh Docker).** `pnpm infra:up && pnpm dev`, lalu:
  - Buka `http://localhost:3000/health` → keempat layanan `ok`.
  - `curl -s -X POST localhost:3000/api/ping -H 'content-type: application/json' -d '{"message":"halo"}'` → `202` dengan `workflowId`.
  - `curl -s localhost:3000/api/ping/<workflowId>` → `{"status":"completed","result":{"message":"halo","pm4pyVersion":"…","handledBy":"python"}}`.
  - Matikan Postgres (`docker compose -f infra/docker-compose.yml stop postgres`) → `/health` menampilkan postgres `error`, lainnya `ok`.
- [ ] **Step 4:** README: tabel perintah (`infra:up`, `infra:down`, `dev`, `test`, `contracts:export`) dan contoh `curl` ping.
- [ ] **Step 5: Commit** `chore: add root dev and test scripts`
