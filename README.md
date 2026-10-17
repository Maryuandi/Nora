# Nora — Narrative Operational Risk Analyzer

Process intelligence platform: ingest client process logs, map and monitor how processes actually run, assess findings with Jev and explain them with an LLM, then let analysts and process owners decide and evaluate interventions.

## Docs

- [Feature modules v1.3](docs/feature-modules-v1.3.md) — module map (M01–M13), roles, architecture
- [PRDs](docs/prd/) — one per module

## Planned stack

Next.js (App Router, TypeScript) · Zod · Temporal (TypeScript + Python workers) · PM4Py · SimPy · PostgreSQL · Neo4j · S3-compatible object storage · React Flow · Recharts

Status: monorepo skeleton (web, TS worker, Python worker, shared contracts); feature modules not yet implemented.

## Menjalankan lokal

Prasyarat, berurutan: Docker Desktop atau OrbStack, Node >= 22, pnpm, uv.

```bash
cp .env.example .env     # wajib sebelum infra:up dan dev
pnpm install
(cd workers/python && uv sync)
pnpm infra:up
pnpm dev                 # web :3000, worker TS, worker Python
```

| Perintah | Fungsi |
| --- | --- |
| `pnpm infra:up` | Jalankan Postgres, Neo4j, MinIO, Temporal (Docker) |
| `pnpm infra:down` | Hentikan infra |
| `pnpm dev` | Jalankan web, worker TS, dan worker Python sekaligus |
| `pnpm test` | Uji semua paket TS lalu pytest worker Python |
| `pnpm contracts:export` | Regenerasi JSON Schema di `packages/contracts/schemas/` |

Uji ping end-to-end (setelah `pnpm dev` jalan):

```bash
curl -s -X POST localhost:3000/api/ping -H 'content-type: application/json' -d '{"message":"halo"}'
# 202 {"workflowId":"<id>"}
curl -s localhost:3000/api/ping/<workflowId>
# {"status":"completed","result":{"message":"halo","pm4pyVersion":"...","handledBy":"python"}}
```

Status layanan: http://localhost:3000/health
