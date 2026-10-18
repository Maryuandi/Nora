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

let failures = 0;
export function check(cond: unknown, label: string, detail?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 600));
  }
}

export async function run(name: string, body: (s: Smoke) => Promise<void>, extraEnv?: Record<string, string>) {
  console.log(`smoke ${name}`);
  const s = await startSmoke(name, extraEnv);
  try {
    await body(s);
  } catch (err) {
    failures++;
    console.error(err);
  } finally {
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
