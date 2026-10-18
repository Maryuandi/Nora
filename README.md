# Nora — Narrative Operational Risk Analyzer

Process intelligence platform: ingest client process logs, map and monitor how processes actually run, assess findings with Jev and explain them with an LLM, then let analysts and process owners decide and evaluate interventions.

## Docs

- [Feature modules v1.3](docs/feature-modules-v1.3.md) — module map (M01–M13), roles, architecture
- [PRDs](docs/prd/) — one per module

## Planned stack

Next.js (App Router, TypeScript) · tRPC + TanStack Query · Prisma ORM · Zod · Temporal (TypeScript + Python workers) · PM4Py · SimPy · PostgreSQL · Neo4j · S3-compatible object storage · React Flow · Recharts

Status: monorepo skeleton (web, TS worker, Python worker, shared contracts); feature modules not yet implemented.

## Menjalankan lokal

Prasyarat, berurutan: Docker Desktop atau OrbStack, Node >= 22, pnpm, uv.

```bash
cp .env.example .env     # wajib sebelum infra:up dan dev
pnpm install
(cd workers/python && uv sync)
pnpm infra:up            # tunggu ~10 dtk (atau sampai http://localhost:8233 terbuka)
pnpm db:migrate          # terapkan migrasi Prisma ke DATABASE_URL
pnpm dev                 # web :3000, worker TS, worker Python
```

| Perintah | Fungsi |
| --- | --- |
| `pnpm infra:up` | Jalankan Postgres, Neo4j, MinIO, Temporal (Docker) |
| `pnpm infra:down` | Hentikan infra |
| `pnpm dev` | Jalankan web, worker TS, dan worker Python sekaligus |
| `pnpm test` | Uji semua paket TS lalu pytest worker Python |
| `pnpm db:migrate` | Terapkan migrasi Prisma (`prisma migrate deploy`) |
| `pnpm db:reset` | Hapus dan buat ulang database dev dari migrasi Prisma |
| `pnpm --filter @nora/db migrate:dev` | Buat migrasi baru dari perubahan `packages/db/prisma/schema.prisma` |
| `pnpm contracts:export` | Regenerasi JSON Schema di `packages/contracts/schemas/` |

Status layanan (Postgres, Neo4j, object storage, Temporal; 503 bila ada yang mati):

```bash
curl -s localhost:3000/health
# {"ok":true,"services":[{"name":"postgres","ok":true,"message":"SELECT 1 ok"}, ...]}
```

API aplikasi berupa tRPC di `/api/trpc` (router: `apps/web/lib/trpc/router.ts`); skema database ada di `packages/db/prisma/schema.prisma`. Trigger, CHECK, dan indeks berbasis ekspresi yang tidak dapat ditulis di skema Prisma berada di bagian bawah `packages/db/prisma/migrations/0_init/migration.sql`; pertahankan bagian itu bila migrasi digabung ulang.

Catatan: worker tidak mengulang koneksi awal ke Temporal, jadi jalankan `pnpm dev` hanya setelah Temporal siap.
