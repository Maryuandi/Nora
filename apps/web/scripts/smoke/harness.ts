// Shared smoke-test harness: a throwaway database, the built Next server on a spare port, and a cookie-aware tRPC client.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createTRPCClient, httpLink, TRPCClientError, type TRPCClient } from "@trpc/client";
import { createPrisma, Prisma, type PrismaClient } from "@nora/db";
import type { MappingConfig } from "@nora/contracts";
import type { z } from "zod";
import type { AppRouter } from "../../lib/trpc/router.ts";

const WEB_DIR = fileURLToPath(new URL("../..", import.meta.url));
const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));
const win = process.platform === "win32";

export interface Smoke {
  baseUrl: string;
  databaseUrl: string;
  db: PrismaClient;
  env: Record<string, string>;
  stop(): Promise<void>;
}

function withDatabase(url: string, name: string) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Applies the Prisma migrations to a database (same command as `pnpm db:migrate`). */
function migrate(databaseUrl: string) {
  const r = spawnSync(win ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], { cwd: `${REPO_DIR}packages/db`, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", shell: win });
  if (r.status !== 0) throw new Error(`prisma migrate deploy failed:\n${r.stdout}\n${r.stderr}`);
}

/** Registers a throwaway Temporal namespace (1-day retention) so smoke workflows never touch "default". */
export async function ensureNamespace(namespace: string): Promise<void> {
  const { Connection } = await import("@temporalio/client");
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  try {
    await conn.workflowService.registerNamespace({ namespace, workflowExecutionRetentionPeriod: { seconds: 86_400 } as never });
    await new Promise((r) => setTimeout(r, 3000)); // namespace cache refresh
  } catch (err) {
    if (!String((err as Error).message).includes("already")) throw err;
  } finally {
    await conn.close();
  }
}

/** Spawns the TS and Python workers against the smoke database and namespace; returns a stop function. */
export function startWorkers(env: NodeJS.ProcessEnv): () => void {
  const procs: ChildProcess[] = [
    spawn(win ? "npx.cmd" : "npx", ["tsx", "src/main.ts"], { cwd: `${REPO_DIR}apps/worker`, env, stdio: ["ignore", "pipe", "pipe"], shell: win }),
    spawn("uv", ["run", "python", "-m", "nora_worker.main"], { cwd: `${REPO_DIR}workers/python`, env, stdio: ["ignore", "pipe", "pipe"], shell: win }),
  ];
  for (const p of procs) {
    p.stderr?.on("data", (d) => { if (process.env.SMOKE_VERBOSE) process.stderr.write(d); });
    p.stdout?.on("data", (d) => { if (process.env.SMOKE_VERBOSE) process.stdout.write(d); });
  }
  return () => {
    for (const p of procs) {
      if (win && p.pid) spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
      else p.kill("SIGTERM");
    }
  };
}

export async function waitFor<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 120_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function startSmoke(name: string, extraEnv: Record<string, string> = {}): Promise<Smoke> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set (run with --env-file=../../.env)");
  const dbName = `nora_smoke_${name}_${randomBytes(4).toString("hex")}`;
  const admin = createPrisma(base);
  // Identifiers cannot be bound parameters; the name is generated above, never user input.
  await admin.$executeRaw`CREATE DATABASE ${Prisma.raw(dbName)}`;
  await admin.$disconnect();
  const databaseUrl = withDatabase(base, dbName);
  migrate(databaseUrl);

  const port = 3100 + Math.floor(Math.random() * 800);
  const env = { ...process.env, ...extraEnv, DATABASE_URL: databaseUrl, PORT: String(port) } as NodeJS.ProcessEnv & Record<string, string>;
  const server: ChildProcess = spawn(win ? "npx.cmd" : "npx", ["next", "start", "-p", String(port)], { cwd: WEB_DIR, env, stdio: ["ignore", "pipe", "pipe"], shell: win });
  let log = "";
  server.stdout?.on("data", (d) => (log += d));
  server.stderr?.on("data", (d) => (log += d));
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const r = await fetch(`${baseUrl}/lite/login`, { redirect: "manual" });
      if (r.status < 500) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`server did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const db = createPrisma(databaseUrl);

  return {
    baseUrl, databaseUrl, db, env,
    async stop() {
      await db.$disconnect().catch(() => {});
      if (win && server.pid) spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      const a = createPrisma(base);
      await a.$executeRaw`DROP DATABASE IF EXISTS ${Prisma.raw(dbName)} WITH (FORCE)`;
      await a.$disconnect();
    },
  };
}

export type Api = TRPCClient<AppRouter>;
export interface CallResult<T> {
  /** 200 on success; otherwise the server's status (400, 401, 403, 404, 409, 410, 500, …). */
  status: number;
  /** The procedure's result; undefined when the call failed. */
  body: T;
  error: { appCode: string; message: string; details?: unknown } | null;
}

export class Client {
  cookie = "";
  readonly api: Api;

  constructor(readonly baseUrl: string) {
    this.api = createTRPCClient<AppRouter>({
      links: [httpLink({
        url: `${baseUrl}/api/trpc`,
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers as HeadersInit | undefined);
          if (this.cookie) headers.set("cookie", this.cookie);
          const res = await fetch(url, { ...(init as RequestInit), headers });
          const set = res.headers.get("set-cookie");
          if (set) this.cookie = set.split(";")[0]!;
          return res;
        },
      })],
    });
  }

  async call<T>(fn: (api: Api) => Promise<T>): Promise<CallResult<T>> {
    try {
      return { status: 200, body: await fn(this.api), error: null };
    } catch (err) {
      if (!(err instanceof TRPCClientError)) throw err;
      const data = (err as TRPCClientError<AppRouter>).data;
      return { status: data?.status ?? 0, body: undefined as T, error: { appCode: data?.appCode ?? "network", message: err.message, details: data?.details } };
    }
  }

  /** Server-rendered pages: status, HTML and headers (redirects are not followed). */
  async page(path: string): Promise<{ status: number; body: string; headers: Headers }> {
    const res = await fetch(`${this.baseUrl}${path}`, { redirect: "manual", headers: this.cookie ? { cookie: this.cookie } : {} });
    return { status: res.status, body: await res.text(), headers: res.headers };
  }
}

/** Removes every object the smoke projects wrote; the real bucket keeps only real data. */
async function cleanupObjects(s: Smoke): Promise<void> {
  const { deletePrefix } = await import("@nora/storage");
  for (const r of await s.db.project.findMany({ select: { id: true } })) await deletePrefix(r.id, `projects/${r.id}/`);
}

let failures = 0;
export function check(cond: unknown, label: string, detail?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 600));
  }
}

/** True when the call rejected with one of the statuses (a database trigger refusing a write, …). */
export async function rejects(p: Promise<unknown>): Promise<boolean> {
  try { await p; return false; } catch { return true; }
}

export async function run(name: string, body: (s: Smoke) => Promise<void>, opts: { workers?: boolean; env?: Record<string, string> } = {}) {
  console.log(`smoke ${name}`);
  const namespace = `nora-${name}-smoke`;
  const env = { ...opts.env, ...(opts.workers ? { TEMPORAL_NAMESPACE: namespace } : {}) };
  if (opts.workers) await ensureNamespace(namespace);
  const s = await startSmoke(name, env);
  const stopWorkers = opts.workers ? startWorkers(s.env as NodeJS.ProcessEnv) : () => {};
  try {
    await body(s);
  } catch (err) {
    failures++;
    console.error(err);
  } finally {
    stopWorkers();
    await cleanupObjects(s).catch((err) => console.error("object cleanup failed", err));
    await s.stop();
  }
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  process.exit(failures ? 1 : 0);
}

/** Unwraps a call that must succeed in setup code. */
export function must<T>(r: CallResult<T>, what: string): T {
  if (r.status !== 200) throw new Error(`${what} ${r.status} ${JSON.stringify(r.error)}`);
  return r.body;
}

/** Creates the first admin, a client and an active project; returns the admin client and project id. */
export async function bootstrapProject(s: Smoke, name = "Proyek Uji"): Promise<{ admin: Client; projectId: string }> {
  const admin = new Client(s.baseUrl);
  must(await admin.call((t) => t.auth.setup.mutate({ name: "Admin", email: "admin@example.test", password: "password-123" })), "setup");
  const client = must(await admin.call((t) => t.clients.create.mutate({ name: `Klien ${name}`, sector: "Uji" })), "client");
  const today = new Date().toISOString().slice(0, 10);
  const project = must(await admin.call((t) => t.projects.create.mutate({
    clientId: client.id, name, processName: "Proses Uji", contractStart: today, contractEnd: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`, retentionPolicy: "Uji",
  })), "project");
  await admin.call((t) => t.projects.setStatus.mutate({ projectId: project.id, status: "active" }));
  return { admin, projectId: project.id };
}

const tokenOf = (activationUrl: string) => new URL(activationUrl).searchParams.get("token") ?? "";

/** Adds an analyst account (activated) to a project and returns its client. */
export async function addAnalyst(s: Smoke, admin: Client, projectId: string, email = "analyst@example.test"): Promise<Client> {
  const invite = await admin.call((t) => t.members.add.mutate({ projectId, email, name: "Analis", role: "analyst" }));
  const analyst = new Client(s.baseUrl);
  if (invite.body?.activationUrl) await analyst.call((t) => t.auth.activate.mutate({ token: tokenOf(invite.body.activationUrl!), name: "Analis", password: "password-123" }));
  else await analyst.call((t) => t.auth.login.mutate({ email, password: "password-123" }));
  return analyst;
}

export async function uploadFile(c: Client, projectId: string, sourceId: string, name: string, body: Uint8Array | string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const init = must(await c.call((t) => t.sources.createUpload.mutate({ projectId, sourceId, fileName: name, size: bytes.length })), "upload init");
  const put = await fetch(init.upload.url, { method: "PUT", headers: init.upload.headers, body: bytes as unknown as BodyInit });
  return { snapshotId: init.snapshotId, putStatus: put.status, url: init.upload.url, headers: init.upload.headers };
}

export async function waitSnapshot(c: Client, projectId: string, snapshotId: string) {
  return waitFor(`snapshot ${snapshotId}`, async () => {
    const r = await c.call((t) => t.snapshots.get.query({ projectId, snapshotId }));
    return ["awaiting_upload", "validating"].includes(r.body.status) ? null : r.body;
  });
}

export async function waitDataset(c: Client, projectId: string, datasetId: string) {
  return waitFor(`dataset ${datasetId}`, async () => {
    const r = await c.call((t) => t.datasets.get.query({ projectId, datasetId }));
    return ["processing", "draft"].includes(r.body.status) ? null : r.body;
  }, 180_000);
}

/** Source → upload → complete → mapping → dataset → publish; returns the published dataset. */
export async function publishCsv(c: Client, projectId: string, csv: string, config: z.input<typeof MappingConfig>, name = "ERP") {
  const src = must(await c.call((t) => t.sources.create.mutate({ projectId, name })), "source");
  const up = await uploadFile(c, projectId, src.id, `${name}.csv`, csv);
  await c.call((t) => t.snapshots.complete.mutate({ projectId, snapshotId: up.snapshotId }));
  const snap = await waitSnapshot(c, projectId, up.snapshotId);
  if (snap.status !== "ready_for_mapping") throw new Error(`snapshot ${snap.status}: ${snap.errorMessage}`);
  const m = must(await c.call((t) => t.mappings.create.mutate({ projectId, sourceId: src.id, config })), "mapping");
  const d = must(await c.call((t) => t.datasets.prepare.mutate({ projectId, snapshotId: up.snapshotId, mappingVersionId: m.id })), "dataset");
  const ds = await waitDataset(c, projectId, d.id);
  const pub = await c.call((t) => t.datasets.publish.mutate({ projectId, datasetId: d.id }));
  if (pub.status !== 200) throw new Error(`publish ${pub.status} ${JSON.stringify(pub.error)} quality=${ds.qualityStatus}`);
  return { ...ds, sourceId: src.id, snapshotId: up.snapshotId, mappingVersionId: m.id };
}

/** Deterministic purchase-to-pay log: approval waits grow with case index, every 4th case reworks. */
export function p2pCsv(cases = 120): string {
  const rows = ["case_id,activity,timestamp,user,branch"];
  const base = Date.UTC(2026, 0, 5, 1, 0);
  for (let i = 1; i <= cases; i++) {
    let t = base + i * 3_600_000;
    const at = (h: number) => (t += h * 3_600_000, new Date(t).toISOString().replace("T", " ").slice(0, 16));
    const seq: [string, number, string][] = [["Create PO", 0, "ana"], ["Approve PO", 2 + (i % 10) * 6, "bob"]];
    if (i % 4 === 0) seq.push(["Request Change", 1, "ana"], ["Approve PO", 3, "bob"]);
    seq.push(["Receive Goods", 24, "cici"], ["Pay Invoice", 48 + (i % 5) * 24, i % 7 === 0 ? "bob" : "dedi"]);
    for (const [a, h, u] of seq) rows.push(`PO-${String(i).padStart(4, "0")},${a},${at(h)},${u},${i % 3 ? "Jakarta" : "Bandung"}`);
  }
  return rows.join("\n") + "\n";
}

/** Approves a process boundary (and optional rework) and activates a context package. */
export async function activateContext(c: Client, projectId: string, opts: { rework?: boolean } = {}): Promise<string> {
  const b = must(await c.call((t) => t.context.save.mutate({ projectId, kind: "process_boundary", payload: { startActivities: ["Create PO"], endActivities: ["Pay Invoice"] } })), "boundary");
  await c.call((t) => t.context.transition.mutate({ projectId, kind: "process_boundary", id: b.id, to: "approved" }));
  if (opts.rework) {
    const r = must(await c.call((t) => t.context.save.mutate({
      projectId, kind: "rework_definition",
      payload: { rules: [{ type: "repeated_activity", activity: "Approve PO", minOccurrences: 2 }, { type: "return_transition", from: "Request Change", to: "Approve PO" }] },
    })), "rework");
    await c.call((t) => t.context.transition.mutate({ projectId, kind: "rework_definition", id: r.id, to: "approved" }));
  }
  return must(await c.call((t) => t.context.activatePackage.mutate({ projectId })), "package").id;
}

export async function waitRun(c: Client, projectId: string, runId: string, until: string[] = ["completed", "failed"]) {
  return waitFor(`run ${runId}`, async () => {
    const r = await c.call((t) => t.analyses.get.query({ projectId, runId }));
    return until.includes(r.body.status) ? r.body : null;
  }, 240_000);
}

/** A second project with its own analyst, used for isolation checks. */
export async function otherProjectUser(s: Smoke): Promise<Client> {
  const admin = new Client(s.baseUrl);
  await admin.call((t) => t.auth.login.mutate({ email: "admin@example.test", password: "password-123" }));
  const cl = must(await admin.call((t) => t.clients.create.mutate({ name: `Klien Lain ${randomBytes(3).toString("hex")}`, sector: "", contact: "" })), "client");
  const p = must(await admin.call((t) => t.projects.create.mutate({ clientId: cl.id, name: "Lain", processName: "X", contractStart: "2026-01-01", contractEnd: "2099-01-01", retentionPolicy: "x" })), "project");
  const inv = must(await admin.call((t) => t.members.add.mutate({ projectId: p.id, email: `other-${randomBytes(3).toString("hex")}@example.test`, name: "O", role: "analyst" })), "invite");
  const c = new Client(s.baseUrl);
  await c.call((t) => t.auth.activate.mutate({ token: tokenOf(inv.activationUrl!), name: "O", password: "password-123" }));
  return c;
}

/** Context kinds behind the old catalog endpoints. */
export const CATALOG_KIND = { hypotheses: "hypothesis", interventions: "intervention", rubrics: "rubric" } as const;

/** Approves every imported catalog item. */
export async function approveCatalog(c: Client, projectId: string) {
  for (const kind of Object.values(CATALOG_KIND)) {
    const { items } = must(await c.call((t) => t.context.items.query({ projectId, kinds: [kind] })), "catalog");
    for (const i of items) await c.call((t) => t.context.transition.mutate({ projectId, kind, id: i.id, to: "approved" }));
  }
}

export const P2P_CONFIG = {
  columns: { caseId: "case_id", activity: "activity", timestamp: "timestamp", resource: "user", caseAttributes: ["branch"], eventAttributes: [], objectRefs: [] },
  timestampFormat: "%Y-%m-%d %H:%M", timezone: "UTC", labelMap: {}, repairRules: [],
};
