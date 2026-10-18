// Shared smoke-test harness: a throwaway database, the built Next server on a spare port, and a cookie-aware client.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "@nora/db/migrate";

const WEB_DIR = fileURLToPath(new URL("../..", import.meta.url));

export interface Smoke {
  baseUrl: string;
  databaseUrl: string;
  db: pg.Pool;
  env: Record<string, string>;
  stop(): Promise<void>;
}

function withDatabase(url: string, name: string) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

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
  const win = process.platform === "win32";
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
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  const databaseUrl = withDatabase(base, dbName);
  await migrate(databaseUrl);

  const port = 3100 + Math.floor(Math.random() * 800);
  const env = { ...process.env, ...extraEnv, DATABASE_URL: databaseUrl, PORT: String(port) } as NodeJS.ProcessEnv & Record<string, string>;
  const server: ChildProcess = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(port)], { cwd: WEB_DIR, env, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
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
  const db = new pg.Pool({ connectionString: databaseUrl });

  return {
    baseUrl, databaseUrl, db, env,
    async stop() {
      await db.end().catch(() => {});
      if (process.platform === "win32" && server.pid) spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      const a = new pg.Client({ connectionString: base });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await a.end();
    },
  };
}

export class Client {
  cookie = "";
  constructor(readonly baseUrl: string) {}

  async call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T; headers: Headers }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      redirect: "manual",
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    return { status: res.status, body: parsed as T, headers: res.headers };
  }
  get = <T = any>(p: string) => this.call<T>("GET", p);
  post = <T = any>(p: string, b: unknown = {}) => this.call<T>("POST", p, b);
  patch = <T = any>(p: string, b: unknown) => this.call<T>("PATCH", p, b);
  del = <T = any>(p: string) => this.call<T>("DELETE", p);
}

/** Removes every object the smoke projects wrote; the real bucket keeps only real data. */
async function cleanupObjects(s: Smoke): Promise<void> {
  const { deletePrefix } = await import("@nora/storage");
  const { rows } = await s.db.query<{ id: string }>("SELECT id FROM projects");
  for (const r of rows) await deletePrefix(r.id, `projects/${r.id}/`);
}

let failures = 0;
export function check(cond: unknown, label: string, detail?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 600));
  }
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

/** Creates the first admin, a client and an active project; returns the admin client and project id. */
export async function bootstrapProject(s: Smoke, name = "Proyek Uji"): Promise<{ admin: Client; projectId: string }> {
  const admin = new Client(s.baseUrl);
  const setup = await admin.post("/api/lite/setup", { name: "Admin", email: "admin@example.test", password: "password-123" });
  if (setup.status !== 201) throw new Error(`setup failed ${JSON.stringify(setup.body)}`);
  const client = await admin.post("/api/lite/clients", { name: `Klien ${name}`, sector: "Uji" });
  const today = new Date().toISOString().slice(0, 10);
  const project = await admin.post("/api/lite/projects", {
    clientId: client.body.id, name, processName: "Proses Uji", contractStart: today, contractEnd: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`, retentionPolicy: "Uji",
  });
  await admin.post(`/api/lite/projects/${project.body.id}/status`, { status: "active" });
  return { admin, projectId: project.body.id };
}

/** Adds an analyst account (activated) to a project and returns its client. */
export async function addAnalyst(s: Smoke, admin: Client, projectId: string, email = "analyst@example.test"): Promise<Client> {
  const invite = await admin.post(`/api/lite/projects/${projectId}/members`, { email, name: "Analis", role: "analyst" });
  const analyst = new Client(s.baseUrl);
  if (invite.body.activationUrl) {
    const token = new URL(invite.body.activationUrl).searchParams.get("token");
    await analyst.post("/api/lite/auth/activate", { token, name: "Analis", password: "password-123" });
  } else {
    await analyst.post("/api/lite/auth/login", { email, password: "password-123" });
  }
  return analyst;
}

export async function uploadFile(c: Client, projectId: string, sourceId: string, name: string, body: Uint8Array | string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const init = await c.post(`/api/lite/projects/${projectId}/sources/${sourceId}/uploads`, { fileName: name, size: bytes.length });
  if (init.status !== 201) throw new Error(`upload init ${init.status} ${JSON.stringify(init.body)}`);
  const put = await fetch(init.body.upload.url, { method: "PUT", headers: init.body.upload.headers, body: bytes as unknown as BodyInit });
  return { snapshotId: init.body.snapshotId as string, putStatus: put.status, url: init.body.upload.url as string, headers: init.body.upload.headers };
}

export async function waitSnapshot(c: Client, projectId: string, snapshotId: string) {
  return waitFor(`snapshot ${snapshotId}`, async () => {
    const r = await c.get(`/api/lite/projects/${projectId}/snapshots/${snapshotId}`);
    return ["awaiting_upload", "validating"].includes(r.body.status) ? null : r.body;
  });
}

export async function waitDataset(c: Client, projectId: string, id: string) {
  return waitFor(`dataset ${id}`, async () => {
    const r = await c.get(`/api/lite/projects/${projectId}/datasets/${id}`);
    return ["processing", "draft"].includes(r.body.status) ? null : r.body;
  }, 180_000);
}

/** Source → upload → complete → mapping → dataset → publish; returns the published dataset. */
export async function publishCsv(c: Client, projectId: string, csv: string, config: unknown, name = "ERP"): Promise<any> {
  const src = await c.post(`/api/lite/projects/${projectId}/sources`, { name });
  const up = await uploadFile(c, projectId, src.body.id, `${name}.csv`, csv);
  await c.post(`/api/lite/projects/${projectId}/snapshots/${up.snapshotId}/complete`);
  const snap = await waitSnapshot(c, projectId, up.snapshotId);
  if (snap.status !== "ready_for_mapping") throw new Error(`snapshot ${snap.status}: ${snap.errorMessage}`);
  const m = await c.post(`/api/lite/projects/${projectId}/mappings`, { sourceId: src.body.id, config });
  const d = await c.post(`/api/lite/projects/${projectId}/datasets`, { snapshotId: up.snapshotId, mappingVersionId: m.body.id });
  const ds = await waitDataset(c, projectId, d.body.id);
  const pub = await c.post(`/api/lite/projects/${projectId}/datasets/${d.body.id}/publish`);
  if (pub.status !== 200) throw new Error(`publish ${pub.status} ${JSON.stringify(pub.body)} quality=${ds.qualityStatus}`);
  return { ...ds, sourceId: src.body.id, snapshotId: up.snapshotId, mappingVersionId: m.body.id };
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
  const P = `/api/lite/projects/${projectId}`;
  const b = await c.post(`${P}/context/definitions`, { kind: "process_boundary", payload: { startActivities: ["Create PO"], endActivities: ["Pay Invoice"] } });
  await c.post(`${P}/context/items/process_boundary/${b.body.id}/status`, { to: "approved" });
  if (opts.rework) {
    const r = await c.post(`${P}/context/definitions`, { kind: "rework_definition", payload: { rules: [{ type: "repeated_activity", activity: "Approve PO", minOccurrences: 2 }, { type: "return_transition", from: "Request Change", to: "Approve PO" }] } });
    await c.post(`${P}/context/items/rework_definition/${r.body.id}/status`, { to: "approved" });
  }
  const pkg = await c.post(`${P}/context/packages`);
  if (pkg.status >= 300) throw new Error(`package ${pkg.status} ${JSON.stringify(pkg.body)}`);
  return pkg.body.id;
}

export async function waitRun(c: Client, projectId: string, runId: string, until: string[] = ["completed", "failed"]) {
  return waitFor(`run ${runId}`, async () => {
    const r = await c.get(`/api/lite/projects/${projectId}/analyses/${runId}`);
    return until.includes(r.body.status) ? r.body : null;
  }, 240_000);
}

/** A second project with its own analyst, used for isolation checks. */
export async function otherProjectUser(s: Smoke): Promise<Client> {
  const admin = new Client(s.baseUrl);
  await admin.post("/api/lite/auth/login", { email: "admin@example.test", password: "password-123" });
  const cl = await admin.post("/api/lite/clients", { name: `Klien Lain ${randomBytes(3).toString("hex")}` });
  const p = await admin.post("/api/lite/projects", { clientId: cl.body.id, name: "Lain", processName: "X", contractStart: "2026-01-01", contractEnd: "2099-01-01", retentionPolicy: "x" });
  const inv = await admin.post(`/api/lite/projects/${p.body.id}/members`, { email: `other-${randomBytes(3).toString("hex")}@example.test`, name: "O", role: "analyst" });
  const c = new Client(s.baseUrl);
  await c.post("/api/lite/auth/activate", { token: new URL(inv.body.activationUrl).searchParams.get("token"), name: "O", password: "password-123" });
  return c;
}

export const P2P_CONFIG = {
  columns: { caseId: "case_id", activity: "activity", timestamp: "timestamp", resource: "user", caseAttributes: ["branch"], eventAttributes: [], objectRefs: [] },
  timestampFormat: "%Y-%m-%d %H:%M", timezone: "UTC", labelMap: {}, repairRules: [],
};
