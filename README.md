# Nora — Narrative Operational Risk Analyzer

Process intelligence platform: ingest client process logs, map and monitor how processes actually run, assess findings with Jev and explain them with an LLM, then let analysts and process owners decide and evaluate interventions.

## Docs

- [Feature modules v1.3](docs/feature-modules-v1.3.md) — module map (M01–M13), roles, architecture
- [PRDs](docs/prd/) — one per module

## Planned stack

Next.js (App Router, TypeScript) · Zod · Temporal (TypeScript + Python workers) · PM4Py · SimPy · PostgreSQL · Neo4j · S3-compatible object storage · React Flow · Recharts

Status: documentation only; code scaffold coming next.

## Menjalankan lokal

Prasyarat: Docker Desktop atau OrbStack, Node >= 22, pnpm, uv.

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm dev
```
