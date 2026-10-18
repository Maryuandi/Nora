import { check, Client, run } from "./harness.ts";

await run("f01", async (s) => {
  const anon = new Client(s.baseUrl);
  check((await anon.get("/lite")).headers.get("location")?.endsWith("/lite/setup"), "empty database redirects to setup");
  check((await s.db.query("SELECT count(*)::int n FROM projects")).rows[0].n === 0, "fresh database has no projects");

  const admin = new Client(s.baseUrl);
  check((await admin.post("/api/lite/setup", { name: "Admin", email: "admin@example.test", password: "short" })).status === 400, "weak password rejected");
  check((await admin.post("/api/lite/setup", { name: "Admin", email: "admin@example.test", password: "password-123" })).status === 201, "first admin created");
  check((await new Client(s.baseUrl).post("/api/lite/setup", { name: "X", email: "x@example.test", password: "password-123" })).status === 409, "second setup refused");
  check((await anon.post("/api/lite/auth/login", { email: "admin@example.test", password: "wrong-password" })).status === 401, "wrong password refused");

  const c = await admin.post("/api/lite/clients", { name: "PT Uji", sector: "Manufaktur" });
  check(c.status === 201, "client created");
  check((await admin.post("/api/lite/clients", { name: "pt uji" })).status === 409, "duplicate client name refused");

  const base = { clientId: c.body.id, processName: "P2P", contractStart: "2026-01-01", contractEnd: "2099-12-31", retentionPolicy: "2 tahun" };
  check((await admin.post("/api/lite/projects", { ...base, name: "Bad", contractEnd: "2025-01-01" })).status === 400, "contract end before start refused");
  const p1 = await admin.post("/api/lite/projects", { ...base, name: "Proyek A" });
  check(p1.status === 201, "project created");
  check((await admin.post("/api/lite/projects", { ...base, name: "proyek a" })).status === 409, "project name unique per client");
  const p2 = await admin.post("/api/lite/projects", { ...base, name: "Proyek B" });
  const A = p1.body.id as string;
  const B = p2.body.id as string;

  const detail = await admin.get(`/api/lite/projects/${A}`);
  check(detail.body.status === "draft" && detail.body.role === "administrator", "creator is administrator of a draft project", detail.body);
  const ready = await admin.get(`/api/lite/projects/${A}/readiness`);
  check(ready.body.state === "needs_source" && ready.body.cta.section === "activate", "draft readiness asks to activate", ready.body);
  check((await admin.get(`/api/lite/projects/${A}/audit`)).body.events.some((e: any) => e.action === "project.create"), "creation is audited");

  check((await admin.post(`/api/lite/projects/${A}/status`, { status: "ended" })).status === 409, "draft cannot jump to ended");
  check((await admin.post(`/api/lite/projects/${A}/status`, { status: "active" })).status === 200, "project activated");
  check((await admin.get(`/api/lite/projects/${A}/readiness`)).body.cta.section === "sources", "active empty project points to sources");

  // Isolation: an analyst of A must not see B; revocation applies on the next request.
  const invite = await admin.post(`/api/lite/projects/${A}/members`, { email: "ana@example.test", name: "Ana", role: "analyst" });
  check(invite.status === 201 && invite.body.activationUrl, "invite returns activation link");
  const token = new URL(invite.body.activationUrl).searchParams.get("token");
  const ana = new Client(s.baseUrl);
  check((await ana.post("/api/lite/auth/activate", { token, name: "Ana", password: "password-123" })).status === 200, "invitee activates");
  check((await new Client(s.baseUrl).post("/api/lite/auth/activate", { token, name: "Ana", password: "password-123" })).status === 410, "activation link is single-use");
  check((await ana.get(`/api/lite/projects`)).body.projects.length === 1, "analyst lists only own project");
  check((await ana.get(`/api/lite/projects/${B}`)).status === 404, "other project answers 404");
  check((await ana.get(`/api/lite/projects/${B}/readiness`)).status === 404, "other project readiness answers 404");
  check((await ana.get(`/api/lite/projects/00000000-0000-4000-8000-000000000000`)).status === 404, "unknown project answers 404");
  check((await ana.post(`/api/lite/projects/${A}/members`, { email: "z@example.test", role: "analyst" })).status === 403, "analyst cannot manage members");
  check((await ana.post(`/api/lite/clients`, { name: "Klien lain" })).status === 403, "member cannot create clients");
  check((await admin.del(`/api/lite/projects/${A}/members?userId=${(await s.db.query("SELECT id FROM users WHERE email='admin@example.test'")).rows[0].id}`)).status === 409, "last administrator cannot be removed");

  const anaId = (await s.db.query("SELECT id FROM users WHERE email = 'ana@example.test'")).rows[0].id;
  check((await admin.del(`/api/lite/projects/${A}/members?userId=${anaId}`)).status === 204, "member removed");
  check((await ana.get(`/api/lite/projects/${A}`)).status === 404, "revocation applies on next request");

  check((await admin.post(`/api/lite/projects/${A}/status`, { status: "suspended" })).status === 200, "project suspended");
  check((await admin.get(`/api/lite/projects/${A}`)).status === 200, "suspended project remains readable");

  // Audit is append-only and written in the mutation's transaction.
  let blocked = false;
  try { await s.db.query("UPDATE audit_events SET action = 'x'"); } catch { blocked = true; }
  check(blocked, "audit_events rejects updates");
  await s.db.query("ALTER TABLE audit_events ADD CONSTRAINT smoke_block CHECK (action <> 'project.update')");
  check((await admin.patch(`/api/lite/projects/${B}`, { description: "x" })).status === 500, "failing audit fails the mutation");
  check((await s.db.query("SELECT description FROM projects WHERE id = $1", [B])).rows[0].description === "", "mutation rolled back with audit");
  await s.db.query("ALTER TABLE audit_events DROP CONSTRAINT smoke_block");

  // Contract expiry runs on read.
  await s.db.query("UPDATE projects SET status = 'active', contract_start = '2020-01-01', contract_end = '2020-12-31' WHERE id = $1", [B]);
  check((await admin.get(`/api/lite/projects/${B}`)).body.status === "ended", "expired contract moves project to ended");

  const page = await admin.get(`/lite/projects/${A}`);
  check(page.status === 200 && String(page.body).includes("Kesiapan analisis"), "summary page renders");
  check((await ana.get(`/lite/projects/${A}`)).status === 404, "summary page answers 404 to non-members");
  check((await admin.call("POST", `/api/lite/projects/${A}/status`, { status: "active" }).then(() => admin.post("/api/lite/clients", {}))).status === 400, "invalid client body rejected");
  const same = await fetch(`${s.baseUrl}/api/lite/projects/${A}/status`, { method: "POST", headers: { cookie: admin.cookie, origin: s.baseUrl, "content-type": "application/json" }, body: JSON.stringify({ status: "suspended" }) });
  check(same.status !== 403, "same-origin browser mutation accepted", same.status);
  const cross = await fetch(`${s.baseUrl}/api/lite/clients`, { method: "POST", headers: { cookie: admin.cookie, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ name: "Evil" }) });
  check(cross.status === 403, "cross-origin mutation refused");
});
