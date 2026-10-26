import { check, Client, rejects, run } from "./harness.ts";

await run("f01", async (s) => {
  const anon = new Client(s.baseUrl);
  check((await anon.page("/lite")).headers.get("location")?.endsWith("/lite/setup"), "empty database redirects to setup");
  check((await s.db.project.count()) === 0, "fresh database has no projects");

  const admin = new Client(s.baseUrl);
  check((await admin.call((t) => t.auth.setup.mutate({ name: "Admin", email: "admin@example.test", password: "short" }))).status === 400, "weak password rejected");
  check((await admin.call((t) => t.auth.setup.mutate({ name: "Admin", email: "admin@example.test", password: "password-123" }))).status === 200, "first admin created");
  check((await new Client(s.baseUrl).call((t) => t.auth.setup.mutate({ name: "X", email: "x@example.test", password: "password-123" }))).status === 409, "second setup refused");
  check((await anon.call((t) => t.auth.login.mutate({ email: "admin@example.test", password: "wrong-password" }))).status === 401, "wrong password refused");

  const c = await admin.call((t) => t.clients.create.mutate({ name: "PT Uji", sector: "Manufaktur" }));
  check(c.status === 200, "client created");
  check((await admin.call((t) => t.clients.create.mutate({ name: "pt uji" }))).status === 409, "duplicate client name refused");

  const base = { clientId: c.body.id, processName: "P2P", contractStart: "2026-01-01", contractEnd: "2099-12-31", retentionPolicy: "2 tahun" };
  check((await admin.call((t) => t.projects.create.mutate({ ...base, name: "Bad", contractEnd: "2025-01-01" }))).status === 400, "contract end before start refused");
  const p1 = await admin.call((t) => t.projects.create.mutate({ ...base, name: "Proyek A" }));
  check(p1.status === 200, "project created");
  check((await admin.call((t) => t.projects.create.mutate({ ...base, name: "proyek a" }))).status === 409, "project name unique per client");
  const p2 = await admin.call((t) => t.projects.create.mutate({ ...base, name: "Proyek B" }));
  const A = p1.body.id;
  const B = p2.body.id;

  const detail = await admin.call((t) => t.projects.get.query({ projectId: A }));
  check(detail.body.status === "draft" && detail.body.role === "administrator", "creator is administrator of a draft project", detail.body);
  const ready = await admin.call((t) => t.projects.readiness.query({ projectId: A }));
  check(ready.body.state === "needs_source" && ready.body.cta.section === "activate", "draft readiness asks to activate", ready.body);
  check((await admin.call((t) => t.projects.audit.query({ projectId: A }))).body.events.some((e) => e.action === "project.create"), "creation is audited");

  check((await admin.call((t) => t.projects.setStatus.mutate({ projectId: A, status: "ended" }))).status === 409, "draft cannot jump to ended");
  check((await admin.call((t) => t.projects.setStatus.mutate({ projectId: A, status: "active" }))).status === 200, "project activated");
  check((await admin.call((t) => t.projects.readiness.query({ projectId: A }))).body.cta.section === "sources", "active empty project points to sources");

  // Isolation: an analyst of A must not see B; revocation applies on the next request.
  const invite = await admin.call((t) => t.members.add.mutate({ projectId: A, email: "ana@example.test", name: "Ana", role: "analyst" }));
  check(invite.status === 200 && invite.body.activationUrl, "invite returns activation link");
  const token = new URL(invite.body.activationUrl!).searchParams.get("token")!;
  const ana = new Client(s.baseUrl);
  check((await ana.call((t) => t.auth.activate.mutate({ token, name: "Ana", password: "password-123" }))).status === 200, "invitee activates");
  check((await new Client(s.baseUrl).call((t) => t.auth.activate.mutate({ token, name: "Ana", password: "password-123" }))).status === 410, "activation link is single-use");
  check((await ana.call((t) => t.projects.list.query())).body.projects.length === 1, "analyst lists only own project");
  check((await ana.call((t) => t.projects.get.query({ projectId: B }))).status === 404, "other project answers 404");
  check((await ana.call((t) => t.projects.readiness.query({ projectId: B }))).status === 404, "other project readiness answers 404");
  check((await ana.call((t) => t.projects.get.query({ projectId: "00000000-0000-4000-8000-000000000000" }))).status === 404, "unknown project answers 404");
  check((await ana.call((t) => t.members.add.mutate({ projectId: A, email: "z@example.test", role: "analyst" }))).status === 403, "analyst cannot manage members");
  check((await ana.call((t) => t.clients.create.mutate({ name: "Klien lain" }))).status === 403, "member cannot create clients");
  const adminId = (await s.db.user.findUniqueOrThrow({ where: { email: "admin@example.test" } })).id;
  check((await admin.call((t) => t.members.remove.mutate({ projectId: A, userId: adminId }))).status === 409, "last administrator cannot be removed");

  const anaId = (await s.db.user.findUniqueOrThrow({ where: { email: "ana@example.test" } })).id;
  check((await admin.call((t) => t.members.remove.mutate({ projectId: A, userId: anaId }))).status === 200, "member removed");
  check((await ana.call((t) => t.projects.get.query({ projectId: A }))).status === 404, "revocation applies on next request");

  check((await admin.call((t) => t.projects.setStatus.mutate({ projectId: A, status: "suspended" }))).status === 200, "project suspended");
  check((await admin.call((t) => t.projects.get.query({ projectId: A }))).status === 200, "suspended project remains readable");

  // Audit is append-only and written in the mutation's transaction.
  check(await rejects(s.db.auditEvent.updateMany({ data: { action: "x" } })), "audit_events rejects updates");
  await s.db.$executeRaw`ALTER TABLE audit_events ADD CONSTRAINT smoke_block CHECK (action <> 'project.update')`;
  check((await admin.call((t) => t.projects.update.mutate({ projectId: B, description: "x" }))).status === 500, "failing audit fails the mutation");
  check((await s.db.project.findUniqueOrThrow({ where: { id: B } })).description === "", "mutation rolled back with audit");
  await s.db.$executeRaw`ALTER TABLE audit_events DROP CONSTRAINT smoke_block`;

  // Contract expiry runs on read.
  await s.db.project.update({ where: { id: B }, data: { status: "active", contractStart: new Date("2020-01-01"), contractEnd: new Date("2020-12-31") } });
  check((await admin.call((t) => t.projects.get.query({ projectId: B }))).body.status === "ended", "expired contract moves project to ended");

  const page = await admin.page(`/lite/projects/${A}`);
  check(page.status === 200 && page.body.includes("Kesiapan analisis"), "summary page renders");
  check((await ana.page(`/lite/projects/${A}`)).status === 404, "summary page answers 404 to non-members");
  await admin.call((t) => t.projects.setStatus.mutate({ projectId: A, status: "active" }));
  check((await admin.call((t) => t.clients.create.mutate({} as never))).status === 400, "invalid client body rejected");
  // Mutations are POSTs to /api/trpc/<procedure> with the input as the JSON body.
  const post = (procedure: string, origin: string, input: unknown) => fetch(`${s.baseUrl}/api/trpc/${procedure}`, {
    method: "POST", headers: { cookie: admin.cookie, origin, "content-type": "application/json" }, body: JSON.stringify(input),
  });
  const same = await post("projects.setStatus", s.baseUrl, { projectId: A, status: "suspended" });
  check(same.status !== 403, "same-origin browser mutation accepted", same.status);
  const cross = await post("clients.create", "https://evil.example", { name: "Evil" });
  check(cross.status === 403, "cross-origin mutation refused");
});
