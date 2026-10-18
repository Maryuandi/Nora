import "server-only";
import { authorize, type Action, type Grant, type ProjectStatus, type Role } from "@nora/authz";
import { expireContracts, type Queryable } from "@nora/db";
import type { z } from "zod";
import { audit } from "./audit";
import { newToken, tokenHash, type Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest, conflict, HttpError, notFound } from "./http";
import type { ClientInput, MemberInput, ProjectInput, ProjectPatch, StatusInput } from "./schemas";

export interface ProjectRow {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description: string;
  processName: string;
  timezone: string;
  contractStart: string;
  contractEnd: string;
  retentionPolicy: string;
  status: ProjectStatus;
  statusChangedAt: string;
  lastActivityAt: string;
  createdAt: string;
  role: Role;
}

const PROJECT_COLUMNS = `p.id, p.client_id AS "clientId", c.name AS "clientName", p.name, p.description, p.process_name AS "processName",
  p.timezone, p.contract_start AS "contractStart", p.contract_end AS "contractEnd", p.retention_policy AS "retentionPolicy",
  p.status, p.status_changed_at AS "statusChangedAt", p.last_activity_at AS "lastActivityAt", p.created_at AS "createdAt", m.role`;

export const can = (viewer: Viewer, action: Action, projectId: string): Promise<Grant> => authorize(db(), viewer.id, action, projectId);

export async function listClients(viewer: Viewer) {
  if (viewer.globalRole !== "admin") return [];
  const { rows } = await db().query<{ id: string; name: string; sector: string }>("SELECT id, name, sector FROM clients ORDER BY lower(name)");
  return rows;
}

export async function createClient(viewer: Viewer, input: z.infer<typeof ClientInput>, correlationId: string) {
  if (viewer.globalRole !== "admin") throw new HttpError(403, "forbidden", "Hanya Administrator yang dapat menambah klien");
  return withTx(async (tx) => {
    const exists = await tx.query("SELECT 1 FROM clients WHERE lower(name) = lower($1)", [input.name]);
    if (exists.rows.length) throw conflict("Klien dengan nama ini sudah ada", { name: "Klien dengan nama ini sudah ada" });
    const { rows } = await tx.query<{ id: string }>("INSERT INTO clients (name, sector, contact) VALUES ($1, $2, $3) RETURNING id", [input.name, input.sector, input.contact]);
    const id = rows[0]!.id;
    await audit(tx, { projectId: null, actorId: viewer.id, action: "client.create", objectType: "client", objectId: id, correlationId, metadata: { name: input.name } });
    return { id };
  });
}

export async function listProjects(viewer: Viewer, correlationId: string): Promise<ProjectRow[]> {
  const mine = await db().query<{ id: string }>("SELECT project_id AS id FROM memberships WHERE user_id = $1", [viewer.id]);
  if (mine.rows.length) await expireContracts(db(), correlationId, mine.rows.map((r) => r.id));
  const { rows } = await db().query<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM memberships m JOIN projects p ON p.id = m.project_id JOIN clients c ON c.id = p.client_id
      WHERE m.user_id = $1 ORDER BY p.last_activity_at DESC`,
    [viewer.id],
  );
  return rows;
}

/** Throws not_found for non-members, exactly like an unknown id. */
export async function getProject(viewer: Viewer, projectId: string, correlationId: string): Promise<ProjectRow> {
  await can(viewer, "project.read", projectId);
  await expireContracts(db(), correlationId, [projectId]);
  const { rows } = await db().query<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects p JOIN clients c ON c.id = p.client_id JOIN memberships m ON m.project_id = p.id AND m.user_id = $2
      WHERE p.id = $1`,
    [projectId, viewer.id],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function createProject(viewer: Viewer, input: z.infer<typeof ProjectInput>, correlationId: string) {
  if (viewer.globalRole !== "admin") throw new HttpError(403, "forbidden", "Hanya Administrator yang dapat membuat proyek");
  return withTx(async (tx) => {
    const client = await tx.query("SELECT 1 FROM clients WHERE id = $1", [input.clientId]);
    if (!client.rows.length) throw badRequest("Klien tidak ditemukan", { clientId: "Klien tidak ditemukan" });
    const dup = await tx.query("SELECT 1 FROM projects WHERE client_id = $1 AND lower(name) = lower($2)", [input.clientId, input.name]);
    if (dup.rows.length) throw conflict("Nama proyek sudah dipakai untuk klien ini", { name: "Nama proyek sudah dipakai untuk klien ini" });
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO projects (client_id, name, description, process_name, timezone, contract_start, contract_end, retention_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [input.clientId, input.name, input.description, input.processName, input.timezone, input.contractStart, input.contractEnd, input.retentionPolicy],
    );
    const id = rows[0]!.id;
    await tx.query("INSERT INTO memberships (project_id, user_id, role, added_by) VALUES ($1, $2, 'administrator', $2)", [id, viewer.id]);
    await audit(tx, { projectId: id, actorId: viewer.id, action: "project.create", objectType: "project", objectId: id, correlationId, metadata: { name: input.name, clientId: input.clientId } });
    return { id };
  });
}

const PATCH_COLUMNS: Record<string, string> = {
  name: "name", description: "description", processName: "process_name", timezone: "timezone",
  contractStart: "contract_start", contractEnd: "contract_end", retentionPolicy: "retention_policy",
};

export async function updateProject(viewer: Viewer, projectId: string, patch: z.infer<typeof ProjectPatch>, correlationId: string) {
  await can(viewer, "project.update", projectId);
  return withTx(async (tx) => {
    const cur = (await tx.query<{ client_id: string; contract_start: string; contract_end: string }>("SELECT client_id, contract_start, contract_end FROM projects WHERE id = $1 FOR UPDATE", [projectId])).rows[0];
    if (!cur) throw notFound();
    const start = patch.contractStart ?? cur.contract_start;
    const end = patch.contractEnd ?? cur.contract_end;
    if (end < start) throw badRequest("Tanggal selesai tidak boleh sebelum tanggal mulai", { contractEnd: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
    if (patch.name) {
      const dup = await tx.query("SELECT 1 FROM projects WHERE client_id = $1 AND lower(name) = lower($2) AND id <> $3", [cur.client_id, patch.name, projectId]);
      if (dup.rows.length) throw conflict("Nama proyek sudah dipakai untuk klien ini", { name: "Nama proyek sudah dipakai untuk klien ini" });
    }
    const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && PATCH_COLUMNS[k]);
    if (!entries.length) return { id: projectId };
    const sets = entries.map(([k], i) => `${PATCH_COLUMNS[k]} = $${i + 2}`).join(", ");
    await tx.query(`UPDATE projects SET ${sets}, updated_at = now() WHERE id = $1`, [projectId, ...entries.map(([, v]) => v)]);
    await audit(tx, { projectId, actorId: viewer.id, action: "project.update", objectType: "project", objectId: projectId, correlationId, metadata: { fields: entries.map(([k]) => k) } });
    return { id: projectId };
  });
}

export const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["active", "archived"],
  active: ["suspended", "ended"],
  suspended: ["active", "ended"],
  ended: ["archived"],
  archived: [],
};

export async function changeStatus(viewer: Viewer, projectId: string, input: z.infer<typeof StatusInput>, correlationId: string) {
  await can(viewer, "project.status", projectId);
  return withTx(async (tx) => {
    const cur = (await tx.query<{ status: ProjectStatus; ended: boolean }>(
      "SELECT status, contract_end < (now() AT TIME ZONE timezone)::date AS ended FROM projects WHERE id = $1 FOR UPDATE", [projectId],
    )).rows[0];
    if (!cur) throw notFound();
    if (!STATUS_TRANSITIONS[cur.status].includes(input.status)) throw conflict(`Status ${cur.status} tidak dapat diubah menjadi ${input.status}`);
    if (input.status === "active" && cur.ended) throw conflict("Kontrak sudah berakhir; perbarui tanggal selesai sebelum mengaktifkan");
    await tx.query("UPDATE projects SET status = $2, status_changed_at = now(), updated_at = now() WHERE id = $1", [projectId, input.status]);
    await audit(tx, { projectId, actorId: viewer.id, action: "project.status", objectType: "project", objectId: projectId, correlationId, metadata: { from: cur.status, to: input.status, reason: input.reason } });
    return { status: input.status };
  });
}

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: "invited" | "active" | "disabled";
  addedAt: string;
}

export async function listMembers(viewer: Viewer, projectId: string): Promise<MemberRow[]> {
  await can(viewer, "members.read", projectId);
  const { rows } = await db().query<MemberRow>(
    `SELECT u.id AS "userId", u.name, u.email, m.role, u.status, m.added_at AS "addedAt"
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.project_id = $1 ORDER BY m.added_at`,
    [projectId],
  );
  return rows;
}

const ACTIVATION_DAYS = 7;

/** Adds an existing account, or creates an invited one with a single-use activation link. Re-adding sets the role. */
export async function addMember(viewer: Viewer, projectId: string, input: z.infer<typeof MemberInput>, correlationId: string) {
  await can(viewer, "members.manage", projectId);
  return withTx(async (tx) => {
    let user = (await tx.query<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = $1", [input.email])).rows[0];
    let activationToken: string | null = null;
    if (!user) {
      user = (await tx.query<{ id: string; status: string }>(
        "INSERT INTO users (email, name, status) VALUES ($1, $2, 'invited') RETURNING id, status", [input.email, input.name || input.email.split("@")[0]],
      )).rows[0]!;
    }
    if (user.status === "invited") {
      activationToken = newToken();
      await tx.query("UPDATE activation_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
      await tx.query("INSERT INTO activation_tokens (token_hash, user_id, created_by, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))",
        [tokenHash(activationToken), user.id, viewer.id, ACTIVATION_DAYS]);
    }
    const prev = (await tx.query<{ role: Role }>("SELECT role FROM memberships WHERE project_id = $1 AND user_id = $2 FOR UPDATE", [projectId, user.id])).rows[0];
    if (prev?.role === "administrator" && input.role !== "administrator") await assertAnotherAdmin(tx, projectId, user.id);
    await tx.query(
      `INSERT INTO memberships (project_id, user_id, role, added_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [projectId, user.id, input.role, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: prev ? "member.role" : "member.add", objectType: "membership", objectId: user.id, correlationId, metadata: { email: input.email, role: input.role, from: prev?.role ?? null } });
    return { userId: user.id, activationToken };
  });
}

async function assertAnotherAdmin(tx: Queryable, projectId: string, exceptUserId: string) {
  const { rows } = await tx.query("SELECT 1 FROM memberships WHERE project_id = $1 AND role = 'administrator' AND user_id <> $2 LIMIT 1", [projectId, exceptUserId]);
  if (!rows.length) throw conflict("Proyek harus memiliki minimal satu Administrator");
}

export async function removeMember(viewer: Viewer, projectId: string, userId: string, correlationId: string) {
  await can(viewer, "members.manage", projectId);
  return withTx(async (tx) => {
    const prev = (await tx.query<{ role: Role }>("SELECT role FROM memberships WHERE project_id = $1 AND user_id = $2 FOR UPDATE", [projectId, userId])).rows[0];
    if (!prev) throw notFound();
    if (prev.role === "administrator") await assertAnotherAdmin(tx, projectId, userId);
    await tx.query("DELETE FROM memberships WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
    await audit(tx, { projectId, actorId: viewer.id, action: "member.remove", objectType: "membership", objectId: userId, correlationId, metadata: { role: prev.role } });
  });
}

export interface AuditRow {
  id: number;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  result: "success" | "denied" | "failed";
  correlationId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listAudit(viewer: Viewer, projectId: string, opts: { before?: number; limit?: number } = {}): Promise<AuditRow[]> {
  await can(viewer, "audit.read", projectId);
  const { rows } = await db().query<AuditRow>(
    `SELECT a.id, u.name AS "actorName", a.action, a.object_type AS "objectType", a.object_id AS "objectId", a.result,
            a.correlation_id AS "correlationId", a.metadata_json AS metadata, a.created_at AS "createdAt"
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.project_id = $1 AND ($2::bigint IS NULL OR a.id < $2) ORDER BY a.id DESC LIMIT $3`,
    [projectId, opts.before ?? null, Math.min(opts.limit ?? 50, 200)],
  );
  return rows;
}
