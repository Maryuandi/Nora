import "server-only";
import { authorize, type Action, type Grant, type ProjectStatus, type Role } from "@nora/authz";
import { day, expireContracts, jsonAs, membership, type Db } from "@nora/db";
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

const PROJECT_SELECT = {
  id: true, clientId: true, client: { select: { name: true } }, name: true, description: true, processName: true, timezone: true,
  contractStart: true, contractEnd: true, retentionPolicy: true, status: true, statusChangedAt: true, lastActivityAt: true, createdAt: true,
} as const;

type ProjectRecord = { id: string; clientId: string; client: { name: string }; name: string; description: string; processName: string; timezone: string;
  contractStart: Date; contractEnd: Date; retentionPolicy: string; status: string; statusChangedAt: Date; lastActivityAt: Date; createdAt: Date };

// status and role are CHECK-constrained to the authz unions.
const toProjectRow = ({ client, ...p }: ProjectRecord, role: string): ProjectRow => ({
  ...p, clientName: client.name, contractStart: day(p.contractStart), contractEnd: day(p.contractEnd), status: p.status as ProjectStatus,
  statusChangedAt: p.statusChangedAt.toISOString(), lastActivityAt: p.lastActivityAt.toISOString(), createdAt: p.createdAt.toISOString(), role: role as Role,
});

export const can = (viewer: Viewer, action: Action, projectId: string): Promise<Grant> =>
  authorize((userId, pid) => membership(db(), userId, pid), viewer.id, action, projectId);

const byName = new Intl.Collator("id", { sensitivity: "base" });

export async function listClients(viewer: Viewer) {
  if (viewer.globalRole !== "admin") return [];
  const rows = await db().client.findMany({ select: { id: true, name: true, sector: true } });
  return rows.sort((a, b) => byName.compare(a.name, b.name));
}

export async function createClient(viewer: Viewer, input: z.infer<typeof ClientInput>, correlationId: string) {
  if (viewer.globalRole !== "admin") throw new HttpError(403, "forbidden", "Hanya Administrator yang dapat menambah klien");
  return withTx(async (tx) => {
    if (await tx.client.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } }, select: { id: true } })) {
      throw conflict("Klien dengan nama ini sudah ada", { name: "Klien dengan nama ini sudah ada" });
    }
    const { id } = await tx.client.create({ data: { name: input.name, sector: input.sector, contact: input.contact }, select: { id: true } });
    await audit(tx, { projectId: null, actorId: viewer.id, action: "client.create", objectType: "client", objectId: id, correlationId, metadata: { name: input.name } });
    return { id };
  });
}

export async function listProjects(viewer: Viewer, correlationId: string): Promise<ProjectRow[]> {
  const mine = await db().membership.findMany({ where: { userId: viewer.id }, select: { projectId: true } });
  if (mine.length) await expireContracts(db(), correlationId, mine.map((m) => m.projectId));
  const rows = await db().membership.findMany({
    where: { userId: viewer.id }, orderBy: { project: { lastActivityAt: "desc" } }, select: { role: true, project: { select: PROJECT_SELECT } },
  });
  return rows.map((m) => toProjectRow(m.project, m.role));
}

/** Throws not_found for non-members, exactly like an unknown id. */
export async function getProject(viewer: Viewer, projectId: string, correlationId: string): Promise<ProjectRow> {
  await can(viewer, "project.read", projectId);
  await expireContracts(db(), correlationId, [projectId]);
  const m = await db().membership.findUnique({ where: { projectId_userId: { projectId, userId: viewer.id } }, select: { role: true, project: { select: PROJECT_SELECT } } });
  if (!m) throw notFound();
  return toProjectRow(m.project, m.role);
}

export async function createProject(viewer: Viewer, input: z.infer<typeof ProjectInput>, correlationId: string) {
  if (viewer.globalRole !== "admin") throw new HttpError(403, "forbidden", "Hanya Administrator yang dapat membuat proyek");
  return withTx(async (tx) => {
    if (!(await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } }))) throw badRequest("Klien tidak ditemukan", { clientId: "Klien tidak ditemukan" });
    if (await tx.project.findFirst({ where: { clientId: input.clientId, name: { equals: input.name, mode: "insensitive" } }, select: { id: true } })) {
      throw conflict("Nama proyek sudah dipakai untuk klien ini", { name: "Nama proyek sudah dipakai untuk klien ini" });
    }
    const { id } = await tx.project.create({
      data: {
        clientId: input.clientId, name: input.name, description: input.description, processName: input.processName, timezone: input.timezone,
        contractStart: new Date(input.contractStart), contractEnd: new Date(input.contractEnd), retentionPolicy: input.retentionPolicy,
      },
      select: { id: true },
    });
    await tx.membership.create({ data: { projectId: id, userId: viewer.id, role: "administrator", addedBy: viewer.id } });
    await audit(tx, { projectId: id, actorId: viewer.id, action: "project.create", objectType: "project", objectId: id, correlationId, metadata: { name: input.name, clientId: input.clientId } });
    return { id };
  });
}

export async function updateProject(viewer: Viewer, projectId: string, patch: z.infer<typeof ProjectPatch>, correlationId: string) {
  await can(viewer, "project.update", projectId);
  return withTx(async (tx) => {
    // Row lock: concurrent edits of the contract dates must not interleave with the start/end check.
    const [cur] = await tx.$queryRaw<{ client_id: string; contract_start: string; contract_end: string }[]>`
      SELECT client_id::text, contract_start::text, contract_end::text FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    if (!cur) throw notFound();
    const start = patch.contractStart ?? cur.contract_start;
    const end = patch.contractEnd ?? cur.contract_end;
    if (end < start) throw badRequest("Tanggal selesai tidak boleh sebelum tanggal mulai", { contractEnd: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
    if (patch.name && await tx.project.findFirst({ where: { clientId: cur.client_id, name: { equals: patch.name, mode: "insensitive" }, id: { not: projectId } }, select: { id: true } })) {
      throw conflict("Nama proyek sudah dipakai untuk klien ini", { name: "Nama proyek sudah dipakai untuk klien ini" });
    }
    const fields = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
    if (!fields.length) return { id: projectId };
    await tx.project.update({
      where: { id: projectId },
      data: {
        ...patch,
        contractStart: patch.contractStart ? new Date(patch.contractStart) : undefined,
        contractEnd: patch.contractEnd ? new Date(patch.contractEnd) : undefined,
        updatedAt: new Date(),
      },
    });
    await audit(tx, { projectId, actorId: viewer.id, action: "project.update", objectType: "project", objectId: projectId, correlationId, metadata: { fields } });
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
    // Row lock, and "contract ended" is judged in the project's own time zone.
    const [cur] = await tx.$queryRaw<{ status: ProjectStatus; ended: boolean }[]>`
      SELECT status, contract_end < (now() AT TIME ZONE timezone)::date AS ended FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
    if (!cur) throw notFound();
    if (!STATUS_TRANSITIONS[cur.status].includes(input.status)) throw conflict(`Status ${cur.status} tidak dapat diubah menjadi ${input.status}`);
    if (input.status === "active" && cur.ended) throw conflict("Kontrak sudah berakhir; perbarui tanggal selesai sebelum mengaktifkan");
    await tx.project.update({ where: { id: projectId }, data: { status: input.status, statusChangedAt: new Date(), updatedAt: new Date() } });
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
  const rows = await db().membership.findMany({
    where: { projectId }, orderBy: { addedAt: "asc" }, select: { role: true, addedAt: true, user: { select: { id: true, name: true, email: true, status: true } } },
  });
  // role and status are CHECK-constrained to these unions.
  return rows.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role as Role, status: m.user.status as MemberRow["status"], addedAt: m.addedAt.toISOString() }));
}

const ACTIVATION_DAYS = 7;

/** Membership row lock: role changes and removals of the same member are serialised. */
const lockMembership = async (tx: Db, projectId: string, userId: string) =>
  (await tx.$queryRaw<{ role: Role }[]>`SELECT role FROM memberships WHERE project_id = ${projectId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`)[0];

/** Adds an existing account, or creates an invited one with a single-use activation link. Re-adding sets the role. */
export async function addMember(viewer: Viewer, projectId: string, input: z.infer<typeof MemberInput>, correlationId: string) {
  await can(viewer, "members.manage", projectId);
  return withTx(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: input.email }, select: { id: true, status: true } })
      ?? await tx.user.create({ data: { email: input.email, name: input.name || input.email.split("@")[0]!, status: "invited" }, select: { id: true, status: true } });
    let activationToken: string | null = null;
    if (user.status === "invited") {
      activationToken = newToken();
      await tx.activationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.activationToken.create({ data: { tokenHash: tokenHash(activationToken), userId: user.id, createdBy: viewer.id, expiresAt: new Date(Date.now() + ACTIVATION_DAYS * 86_400_000) } });
    }
    const prev = await lockMembership(tx, projectId, user.id);
    if (prev?.role === "administrator" && input.role !== "administrator") await assertAnotherAdmin(tx, projectId, user.id);
    await tx.membership.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, role: input.role, addedBy: viewer.id },
      update: { role: input.role },
    });
    await audit(tx, { projectId, actorId: viewer.id, action: prev ? "member.role" : "member.add", objectType: "membership", objectId: user.id, correlationId, metadata: { email: input.email, role: input.role, from: prev?.role ?? null } });
    return { userId: user.id, activationToken };
  });
}

async function assertAnotherAdmin(tx: Db, projectId: string, exceptUserId: string) {
  if (!(await tx.membership.findFirst({ where: { projectId, role: "administrator", userId: { not: exceptUserId } }, select: { userId: true } }))) {
    throw conflict("Proyek harus memiliki minimal satu Administrator");
  }
}

export async function removeMember(viewer: Viewer, projectId: string, userId: string, correlationId: string) {
  await can(viewer, "members.manage", projectId);
  return withTx(async (tx) => {
    const prev = await lockMembership(tx, projectId, userId);
    if (!prev) throw notFound();
    if (prev.role === "administrator") await assertAnotherAdmin(tx, projectId, userId);
    await tx.membership.delete({ where: { projectId_userId: { projectId, userId } } });
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
  const rows = await db().auditEvent.findMany({
    where: { projectId, ...(opts.before ? { id: { lt: BigInt(opts.before) } } : {}) },
    orderBy: { id: "desc" }, take: Math.min(opts.limit ?? 50, 200),
    select: { id: true, action: true, objectType: true, objectId: true, result: true, correlationId: true, metadataJson: true, createdAt: true, actor: { select: { name: true } } },
  });
  return rows.map(({ actor, metadataJson, ...a }) => ({
    ...a, id: Number(a.id), actorName: actor?.name ?? null, result: a.result as AuditRow["result"],
    metadata: jsonAs<Record<string, unknown>>(metadataJson), createdAt: a.createdAt.toISOString(),
  }));
}
