# Product Requirements Document: Prisma ORM + tRPC Migration

**Version**: 1.0
**Date**: 2026-10-18
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

Nora's data and API layers are hand-built. `@nora/db` wraps raw `pg`, and the schema evolves through 9 hand-written SQL migrations (69 tables, ~1,250 lines) applied by a custom runner. The web app exposes 75 REST route handlers under `app/api/**`, which call ~17 `lib/lite/*` service modules holding ~245 raw `.query()` calls. The Temporal TypeScript worker and the F01–F10 smoke scripts also query Postgres directly. Rows are untyped at the SQL boundary, and API responses are untyped at the `fetch()` boundary.

This project replaces that stack in a single rewrite. Prisma ORM will own the schema, migrations, and all Postgres access. tRPC (with the TanStack Query integration) will replace every REST route except `/health`. The result is one type chain from table to UI component, less boilerplate per feature, and a stack the team already knows.

There is no production data. The dev database will be dropped and rebuilt from the new Prisma migrations. Behaviour must not change: every F01–F10 smoke flow must still pass afterwards.

---

## Problem Statement

**Current Situation**:
- Query results are typed by hand, or not at all. A renamed column breaks at runtime, not at compile time.
- Each endpoint repeats the same steps: route file, `route()` wrapper, `parseJson`, a service function, and a client `fetch()` with manual typing.
- The schema lives only in SQL files, and the migration runner is custom code the team maintains.
- The stack is non-standard for the team, so onboarding and review are slower.

**Proposed Solution**: Model the full schema in `schema.prisma` and manage it with Prisma Migrate. Rewrite every Postgres access as Prisma Client calls. Rewrite every REST handler as a tRPC procedure, consumed through `@trpc/tanstack-react-query` in client components and `createTRPCOptionsProxy` in Server Components.

**Business Impact**: Schema drift is caught at compile time. A new endpoint needs one procedure instead of a route, a service, and a fetch wrapper. The team works on a familiar, documented stack instead of in-house infrastructure.

---

## Success Metrics

**Primary KPIs (all required for "done"):**
- **Behavioural parity**: `pnpm smoke:f01` … `smoke:f10` all pass against the new stack, with the smoke scripts rewritten to call tRPC/Prisma.
- **Zero raw driver usage**: `grep -rE "from ['\"]pg['\"]|\.query\(" apps packages` (excluding `node_modules` and generated code) returns 0 hits, and `pg` / `@types/pg` are removed from every `package.json`.
- **Workers migrated**: every Temporal TS activity in `apps/worker/src/activities/*` uses Prisma Client.
- **Green build**: `tsc --noEmit` and `pnpm -r test` pass workspace-wide, with no `any` / `as unknown as` on DB rows or tRPC inputs and outputs.
- **REST removed**: the only route handlers left under `apps/web/app/**/route.ts` are the tRPC adapter (`/api/trpc/[trpc]`) and `/health`.

**Validation**: Run all five checks in CI (or locally before merge) on `feat/prisma`. The PR doesn't merge to `main` until every check passes.

---

## User Personas

### Primary: Nora Developer
- **Role**: Full-stack engineer adding or changing F-modules (web, worker, schema)
- **Goals**: Ship features quickly with compile-time confidence. Change a column and see every affected call site light up.
- **Pain Points**: Hand-typed SQL rows, duplicated route/fetch boilerplate, and a custom migration runner to maintain
- **Technical Level**: Advanced

### Secondary: Analyst / Process Owner (end user)
- **Role**: Uses the `/lite` UI
- **Goals**: No visible change. The same screens and data, with errors still shown in Indonesian.
- **Pain Points**: None from this project, as long as it introduces no regressions

---

## User Stories & Acceptance Criteria

### Story 1: Schema owned by Prisma

**As a** developer
**I want to** define the schema in `schema.prisma` and evolve it with `prisma migrate dev`
**So that** the schema and the generated types stay in sync without a custom runner

**Acceptance Criteria:**
- [ ] `packages/db/prisma/schema.prisma` models all 69 tables with their relations, enums, defaults, and indexes.
- [ ] Triggers, functions, CHECK constraints, generated columns, and partial or expression indexes that Prisma can't express are kept as hand-written SQL appended to the Prisma migration (`migrate dev --create-only`, then edit `migration.sql`). No database-level invariant is lost.
- [ ] `pnpm db:migrate` on an empty database produces a schema equivalent to the old migrations 0001–0009, so all smoke tests pass on it.
- [ ] `packages/db/src/migrate.ts`, `scripts/migrate.ts`, `migrations/*.sql`, and the `schema_migrations` table are deleted.
- [ ] `pnpm db:reset` (drop, migrate, seed) works on a dev machine.

### Story 2: Typed data access through Prisma Client

**As a** developer
**I want** every Postgres read and write to go through a typed Prisma Client
**So that** schema changes become compile errors, not runtime errors

**Acceptance Criteria:**
- [ ] `@nora/db` exports one shared `PrismaClient`, created with the `@prisma/adapter-pg` driver adapter, the `prisma-client` generator, and `prisma.config.ts`. It replaces `createPool` and `Queryable`.
- [ ] `withTx` is replaced by `prisma.$transaction(async (tx) => …)`. A mutation and its audit write still commit or roll back together.
- [ ] Row locks (`FOR UPDATE`, 12 sites), advisory locks (`pg_advisory_*`, 6 sites), and upserts (`ON CONFLICT`, 12 sites) keep their semantics. Use Prisma `upsert`, or `tx.$queryRaw` / TypedSQL where Prisma Client can't express the query. Every remaining raw-SQL site carries a one-line comment explaining why.
- [ ] Timestamp and date values reach JSON and Temporal payloads in the same form as before (an ISO string), or every consumer is updated to match. `bigint` / `bigserial` columns (29) never throw during JSON serialization.
- [ ] `expireContracts` and `pnpm db:expire-contracts` work on Prisma.

### Story 3: tRPC replaces REST

**As a** developer
**I want** each endpoint to be a single tRPC procedure with a Zod input
**So that** the client gets inferred types without hand-written fetch wrappers

**Acceptance Criteria:**
- [ ] The tRPC server is mounted at `app/api/trpc/[trpc]/route.ts` with `fetchRequestHandler`. There is one sub-router per domain (projects, auth, datasets, context, analyses, findings, assessments, recommendations, interpretations, graph, audit, …).
- [ ] The tRPC context resolves the viewer from the `nora_session` cookie. `protectedProcedure` replaces `requireViewer`, and project-scoped procedures enforce `@nora/authz` the same way the current routes do.
- [ ] Existing `HttpError` mapping (401/403/404/409/422) becomes `TRPCError` codes, and the Indonesian user-facing messages are kept.
- [ ] Existing Zod schemas (`lib/lite/schemas.ts`, `@nora/contracts`) are reused as procedure `.input()` validators, not duplicated.
- [ ] The correlation ID behaviour of `route()` is kept, either in tRPC middleware or in the context.
- [ ] Every `route.ts` under `app/api/**` is deleted except the tRPC handler and `/health`. This includes `/api/ping`; its README curl check is replaced or removed.
- [ ] Presigned S3 upload flows keep working: the procedure returns the presigned PUT, and the browser uploads straight to S3.
- [ ] Login, logout, and activate still set and clear the session cookie correctly from inside procedures.

### Story 4: Frontend consumes tRPC through TanStack Query

**As a** developer
**I want** client components to use `useTRPC()` with TanStack Query, and Server Components to prefetch through `createTRPCOptionsProxy`
**So that** caching, invalidation, and loading states come from the library instead of hand-rolled `useEffect` / `fetch` code

**Acceptance Criteria:**
- [ ] `@tanstack/react-query`, `@trpc/client`, `@trpc/server`, and `@trpc/tanstack-react-query` are installed. A `TRPCReactProvider` wraps the `/lite` layout.
- [ ] Every client-side `fetch('/api/…')` call is replaced with tRPC query or mutation options. After a mutation, the related queries are invalidated.
- [ ] Server Components that load data use the server-side proxy (`trpc.x.queryOptions()` + `HydrateClient`) or a direct caller, never an HTTP round-trip to themselves.
- [ ] There are no visible UI changes. Loading, empty, and error states behave as they did before.

### Story 5: Worker and scripts on Prisma

**As a** developer
**I want** the Temporal TS worker and the smoke and ops scripts to share the same Prisma Client
**So that** there is one data-access path in the repo

**Acceptance Criteria:**
- [ ] Every activity in `apps/worker/src/activities/*` uses `@nora/db`'s Prisma Client.
- [ ] Activity inputs and outputs stay JSON-serializable, so Temporal payloads have no `Date`, `BigInt`, or `Decimal` instances unless they are explicitly converted.
- [ ] Smoke scripts f01–f10 and `harness.ts` call the tRPC router through `createCaller` or HTTP, and use Prisma for setup and assertions.
- [ ] `pg` is removed from `apps/web`, `apps/worker`, and `packages/db`.

---

## Functional Requirements

### Core Features

**Feature 1: Prisma schema and migrations (`@nora/db`)**
- Description: Introspect the existing database with `prisma db pull`, curate the result into an idiomatic `schema.prisma` (model names, `@map` / `@@map` to keep snake_case tables), then squash it into one fresh `0_init` migration plus raw SQL for logic Prisma doesn't model.
- Flow: `pnpm infra:up`, then `pnpm db:migrate` (`prisma migrate deploy`). In dev: `prisma migrate dev`, then `prisma generate`.
- Edge cases: Generated columns and triggers must survive future `migrate dev` runs without drift warnings. Use `@default(dbgenerated())` / `Unsupported` where needed, and document every exception in the schema.
- Error handling: A failed migration aborts. Prisma's migration lock replaces the custom advisory lock.

**Feature 2: Data access layer**
- Description: The ~17 `lib/lite/*` services keep their public function signatures where practical. Their bodies switch from SQL strings to Prisma Client.
- Edge cases: Concurrency-sensitive paths (status transitions with `FOR UPDATE`, job claiming with advisory locks) keep their exact locking behaviour.
- Error handling: Prisma `P2002` (unique violation), `P2025` (not found), and `P2003` (FK violation) map to the existing conflict, not-found, and validation errors.

**Feature 3: tRPC API**
- Description: `appRouter` composed of domain routers. Context = `{ prisma, viewer | null, correlationId, headers }`.
- Flow: Browser → `/api/trpc/<path>` (batched via `httpBatchLink`) → procedure → service → Prisma.
- Error handling: Errors are `TRPCError`s with stable `code` values. The error formatter exposes Zod field errors to forms.

**Feature 4: Frontend data layer**
- Description: The client `QueryClient` and tRPC provider, plus the RSC proxy with `getQueryClient = cache(makeQueryClient)`.
- Edge cases: Session expiry mid-session (`UNAUTHORIZED`) redirects to login the same way it does today.

**Feature 5: `/health`**
- Description: A plain `GET /health` route handler that returns `checkAll()` (`lib/health.ts`) as JSON, for probes and the README. It isn't tRPC. The existing project `system` page keeps working.

### Out of Scope
- Changes to Neo4j (`@nora/graph`), S3 (`@nora/storage`), or the Python worker, none of which touch Postgres
- New features or UI changes beyond what the migration needs
- Preserving existing dev data (the database is reset)
- A public or versioned REST API for third parties
- tRPC subscriptions or WebSockets
- Moving database invariants (triggers, CHECKs) into application code

---

## Technical Constraints

### Performance
- No visible regression. Smoke flow wall time stays within +20% of the pre-migration baseline (record the baseline before starting).
- Avoid N+1 queries: replace hand-written SQL JOINs with `include`/`select` or one raw query, never with loops of queries.
- Keep a single `PrismaClient` per process. In Next.js dev, use a `globalThis` singleton so hot reload doesn't exhaust connections. The pool size stays at about the current `max: 10`.

### Security
- Session handling is unchanged: scrypt hashing, a 14-day `nora_session` cookie, and timing-safe comparison stay as they are.
- Every project-scoped procedure enforces `@nora/authz`. No procedure is reachable without `protectedProcedure` unless it was public before (login, activate).
- `$queryRaw` must use tagged templates only. `$queryRawUnsafe` with interpolated input is forbidden.
- The Prisma Client and server router are never bundled into client code (`server-only` guards).

### Integration
- **Temporal**: The worker shares `@nora/db`. Payloads stay plain JSON.
- **S3/MinIO**: The presigned-PUT flow is unchanged.
- **@nora/contracts**: The Zod schemas stay the source of truth for API inputs and for the JSON Schema export.

### Technology Stack
- Prisma ORM (current major) with the `prisma-client` generator, `prisma.config.ts`, and `@prisma/adapter-pg`
- tRPC v11 (`@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`), TanStack Query v5, Zod 4
- Next.js 16 App Router, Node ≥ 22, pnpm workspaces, Postgres 17
- A transformer such as `superjson`, if one is adopted, must be applied on both the client and the RSC proxy. Otherwise, procedures return JSON-safe values.

---

## MVP Scope & Phasing

The work is one big-bang rewrite on `feat/prisma`, merged once. The order of work inside the branch:

### Phase 1: MVP (all required before merge)
1. Foundation: `schema.prisma`, `0_init` migration with raw SQL, shared Prisma Client, `db:migrate` / `db:reset` scripts
2. tRPC skeleton: init, context, `protectedProcedure`, error mapping, adapter route, React provider, RSC proxy, and `/health`
3. Domain migration in feature order F01 → F10 (auth/projects → data prep → context → process map → dashboard → evidence graph → assessment → recommendations → interpretation). Each step rewrites the service, procedures, UI calls, and smoke script, and passes that step's smoke test before the next starts.
4. Worker activities and the `expire-contracts` script on Prisma
5. Cleanup: delete REST routes, the `pg` dependency, the custom runner, and old migrations. Update the README.

**MVP Definition**: All five success metrics pass on `feat/prisma`.

### Phase 2: Enhancements (post-merge)
- Seed script with realistic demo data
- Prisma Studio and TypedSQL for the heavier analytics queries
- `prisma migrate diff` drift check in CI

### Future Considerations
- tRPC subscriptions for job and workflow progress (replacing polling)
- Prisma Client extensions for audit logging, if that reduces duplication

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| DB logic (triggers, CHECKs, generated columns) lost or drifting after the `db pull` squash | Med | High | Diff `pg_dump --schema-only` of the old and new databases before deleting old migrations. Keep every non-Prisma construct in `migration.sql`. |
| Type changes: Prisma returns `Date`/`BigInt`/`Decimal` where `pg` parsers returned strings or numbers | High | Med | Decide on serialization once (map in services, or superjson end to end). Add a test asserting that Temporal payloads and API outputs are JSON-safe. |
| Locking semantics lost (`FOR UPDATE`, advisory locks) | Med | High | Keep these as `tx.$queryRaw` inside interactive transactions. Smoke tests cover concurrent status changes where they exist. |
| Big-bang branch diverges from `main` for a long time | Med | Med | Freeze feature work on F01–F10 during the rewrite, or rebase often. Migrate in F-order so the branch is always runnable. |
| Smoke scripts rewritten together with the code hide regressions | Med | High | Before rewriting each smoke script, record its current assertions (the expected outputs) and keep them unchanged. Change only the transport layer. |
| Connection exhaustion in Next.js dev or the worker | Low | Med | Use a `globalThis` singleton and one client per worker process. |

---

## Dependencies & Blockers

**Dependencies:**
- Docker infra (`pnpm infra:up`) running Postgres 17, so `db pull`, the migrations, and the smoke tests can run
- A smoke-test baseline recorded on `main` before the rewrite starts (timings and expected outputs)
- Agreement to pause F01–F10 feature work on `main` during the rewrite

**Known Blockers:**
- The README says the end-to-end flow hasn't been run without Docker. A working local Docker setup is needed before Phase 1, step 1.

---

## Appendix

### Glossary
- **Prisma Migrate**: Prisma's schema migration tool. It generates SQL from `schema.prisma` diffs and tracks history in `_prisma_migrations`.
- **Driver adapter**: Prisma's mechanism for running queries through a JS driver (here `pg` via `@prisma/adapter-pg`). It's used internally by Prisma, not imported by app code.
- **Procedure**: A tRPC query or mutation, the replacement for one REST route.
- **`createTRPCOptionsProxy`**: The tRPC helper that produces TanStack Query options, used server-side for RSC prefetching.

### References
- Current DB layer: `packages/db/src/index.ts`, `packages/db/migrations/`
- Current HTTP layer: `apps/web/lib/lite/http.ts`, `apps/web/lib/lite/auth.ts`, `apps/web/app/api/**`
- Module map: [feature-modules-v1.3.md](feature-modules-v1.3.md)
- Prisma docs: driver adapters, `prisma-client` generator, customizing migrations (`--create-only`)
- tRPC docs: Next.js App Router setup, TanStack React Query integration, server components

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
