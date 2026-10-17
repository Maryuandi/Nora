import { MOCK_TODAY, initialState } from "./data";
import { projectSchema, type ProjectInput } from "./schemas";
import type { AuditEvent, MockState, Project, ProjectStatus, Role } from "./types";

export { MOCK_TODAY, initialState };

export type MockAction =
  | { type: "createClient"; input: { name: string; sector: string; contact: string } }
  | { type: "createProject"; input: ProjectInput }
  | { type: "changeProjectStatus"; projectId: string; to: ProjectStatus; reason: string }
  | { type: "addMember"; projectId: string; email: string; role: Role }
  | { type: "changeMemberRole"; projectId: string; userId: string; role: Role }
  | { type: "removeMember"; projectId: string; userId: string }
  | { type: "setViewer"; userId: string };

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["aktif"],
  aktif: ["ditangguhkan", "berakhir"],
  ditangguhkan: ["aktif", "berakhir"],
  berakhir: ["diarsipkan"],
  diarsipkan: [],
};

export const allowedTransitions = (from: ProjectStatus) => TRANSITIONS[from];

// Fixed clock so the demo looks the same every time.
const now = () => `${MOCK_TODAY}T09:30:00Z`;
let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

const withAudit = (state: MockState, e: Omit<AuditEvent, "id" | "at" | "actorId" | "result">): MockState => ({
  ...state,
  audit: [{ id: id("a"), at: now(), actorId: state.viewerId, result: "sukses", ...e }, ...state.audit],
});

const isLastAdmin = (s: MockState, projectId: string, userId: string) => {
  const admins = s.memberships.filter((m) => m.projectId === projectId && m.role === "administrator");
  return admins.length === 1 && admins[0].userId === userId;
};

export function reduce(state: MockState, action: MockAction): { state: MockState; error?: string } {
  const fail = (error: string) => ({ state, error });
  switch (action.type) {
    case "setViewer":
      return { state: { ...state, viewerId: action.userId } };

    case "createClient": {
      const name = action.input.name.trim();
      if (state.clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail("Klien dengan nama ini sudah ada");
      const client = { id: id("c"), name, sector: action.input.sector.trim(), contact: action.input.contact.trim() };
      return { state: withAudit({ ...state, clients: [...state.clients, client] }, { action: "klien.buat", objectType: "Klien", objectLabel: name, projectId: null }) };
    }

    case "createProject": {
      const parsed = projectSchema.safeParse(action.input);
      if (!parsed.success) return fail(parsed.error.issues[0].message);
      const v = parsed.data;
      if (state.projects.some((p) => p.clientId === v.clientId && p.name.toLowerCase() === v.name.toLowerCase()))
        return fail("Nama proyek sudah dipakai di klien ini");
      const project: Project = {
        id: id("p"), clientId: v.clientId, name: v.name, description: v.description,
        process: { name: v.processName, startActivity: v.startActivity, endActivity: v.endActivity },
        contractStart: v.contractStart, contractEnd: v.contractEnd, retention: v.retention,
        status: "draft", statusHistory: [], lastActivityAt: now(),
      };
      const next = {
        ...state,
        projects: [...state.projects, project],
        memberships: [...state.memberships, { userId: state.viewerId, projectId: project.id, role: "administrator" as const, addedAt: now() }],
      };
      return { state: withAudit(next, { action: "proyek.buat", objectType: "Proyek", objectLabel: project.name, projectId: project.id }) };
    }

    case "changeProjectStatus": {
      const p = state.projects.find((x) => x.id === action.projectId);
      if (!p) return fail("Proyek tidak ditemukan");
      if (!action.reason.trim()) return fail("Alasan wajib diisi");
      if (!TRANSITIONS[p.status].includes(action.to)) return fail("Perubahan status ini tidak diizinkan");
      const updated: Project = {
        ...p, status: action.to, lastActivityAt: now(),
        statusHistory: [...p.statusHistory, { from: p.status, to: action.to, reason: action.reason.trim(), at: now(), by: state.viewerId }],
      };
      const next = { ...state, projects: state.projects.map((x) => (x.id === p.id ? updated : x)) };
      return { state: withAudit(next, { action: "proyek.status", objectType: "Proyek", objectLabel: `${p.name}: ${p.status} → ${action.to}`, projectId: p.id }) };
    }

    case "addMember": {
      const email = action.email.trim().toLowerCase();
      let users = state.users;
      let user = users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        user = { id: id("u"), name: email.split("@")[0], email, persona: null, pending: true };
        users = [...users, user];
      }
      const existing = state.memberships.find((m) => m.projectId === action.projectId && m.userId === user!.id);
      if (existing) {
        if (existing.role === action.role) return { state };
        return reduce({ ...state, users }, { type: "changeMemberRole", projectId: action.projectId, userId: user.id, role: action.role });
      }
      const next = { ...state, users, memberships: [...state.memberships, { userId: user.id, projectId: action.projectId, role: action.role, addedAt: now() }] };
      return { state: withAudit(next, { action: "anggota.tambah", objectType: "Anggota", objectLabel: user.email, projectId: action.projectId }) };
    }

    case "changeMemberRole": {
      const mem = state.memberships.find((m) => m.projectId === action.projectId && m.userId === action.userId);
      if (!mem) return fail("Anggota tidak ditemukan");
      if (mem.role === "administrator" && action.role !== "administrator" && isLastAdmin(state, action.projectId, action.userId))
        return fail("Administrator terakhir tidak bisa diturunkan");
      const next = { ...state, memberships: state.memberships.map((m) => (m === mem ? { ...m, role: action.role } : m)) };
      const label = state.users.find((u) => u.id === action.userId)?.email ?? action.userId;
      return { state: withAudit(next, { action: "anggota.ubah_peran", objectType: "Anggota", objectLabel: `${label}: ${mem.role} → ${action.role}`, projectId: action.projectId }) };
    }

    case "removeMember": {
      const mem = state.memberships.find((m) => m.projectId === action.projectId && m.userId === action.userId);
      if (!mem) return fail("Anggota tidak ditemukan");
      if (isLastAdmin(state, action.projectId, action.userId)) return fail("Administrator terakhir tidak bisa dicabut");
      const next = { ...state, memberships: state.memberships.filter((m) => m !== mem) };
      const label = state.users.find((u) => u.id === action.userId)?.email ?? action.userId;
      return { state: withAudit(next, { action: "anggota.cabut", objectType: "Anggota", objectLabel: label, projectId: action.projectId }) };
    }
  }
}

export const viewerRole = (s: MockState, projectId: string): Role | null =>
  s.memberships.find((m) => m.projectId === projectId && m.userId === s.viewerId)?.role ?? null;

export const projectsForViewer = (s: MockState): Project[] =>
  s.projects.filter((p) => s.memberships.some((m) => m.projectId === p.id && m.userId === s.viewerId));

export function contractEndingSoon(p: Project, today = MOCK_TODAY): boolean {
  if (p.status !== "aktif" || !p.contractEnd) return false;
  const days = (Date.parse(p.contractEnd) - Date.parse(today)) / 86_400_000;
  return days >= 0 && days <= 14;
}
