export const ROLES = ["administrator", "analyst", "process_owner"] as const;
export type Role = (typeof ROLES)[number];

export const PROJECT_STATUSES = ["draft", "active", "suspended", "ended", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

type Rule = { roles: readonly Role[]; /** new data or jobs; only accepted while the project is active */ work?: boolean };

const ALL = ROLES;
const ADMIN = ["administrator"] as const;
const PREP = ["administrator", "analyst"] as const;
const ANALYST = ["analyst"] as const;

export const ACTIONS = {
  "project.read": { roles: ALL },
  "project.update": { roles: ADMIN },
  "project.status": { roles: ADMIN },
  "members.read": { roles: ALL },
  "members.manage": { roles: ADMIN },
  "audit.read": { roles: PREP },
  "system.read": { roles: ADMIN },
  "data.write": { roles: PREP, work: true },
  "context.write": { roles: PREP, work: true },
  "analysis.run": { roles: PREP, work: true },
  "analysis.settings": { roles: PREP, work: true },
  "graph.rebuild": { roles: ADMIN },
  "assessment.run": { roles: ANALYST, work: true },
  "assessment.correct": { roles: ANALYST, work: true },
  "recommendation.write": { roles: ANALYST, work: true },
  "interpretation.request": { roles: ANALYST, work: true },
  "interpretation.review": { roles: ANALYST, work: true },
} as const satisfies Record<string, Rule>;
export type Action = keyof typeof ACTIONS;

export function roleCan(role: Role, action: Action): boolean {
  return (ACTIONS[action].roles as readonly Role[]).includes(role);
}

/** Whether an action is accepted in a project status; reads stay open after a project is suspended or ended. */
export function statusAllows(status: ProjectStatus, action: Action): boolean {
  const rule: Rule = ACTIONS[action];
  if (rule.work) return status === "active";
  if (action === "project.read" || action === "members.read" || action === "audit.read" || action === "system.read") return true;
  return status !== "archived";
}

export type AuthzErrorCode = "not_found" | "forbidden" | "project_inactive";

export class AuthzError extends Error {
  constructor(readonly code: AuthzErrorCode, message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

/** Membership of an active user in a project, with the project's status; null when there is none. */
export type MembershipLookup = (userId: string, projectId: string) => Promise<{ role: string; status: string } | null>;

export interface Grant {
  userId: string;
  projectId: string;
  role: Role;
  projectStatus: ProjectStatus;
}

const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);
const isStatus = (s: string): s is ProjectStatus => (PROJECT_STATUSES as readonly string[]).includes(s);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks membership on every call (no cache) so a revoked membership takes effect on the next request.
 * Non-members and unknown projects both get `not_found`: the API answers 404, never "forbidden".
 */
export async function authorize(lookup: MembershipLookup, userId: string, action: Action, projectId: string): Promise<Grant> {
  if (!UUID.test(projectId) || !UUID.test(userId)) throw new AuthzError("not_found", "project not found");
  const row = await lookup(userId, projectId);
  if (!row || !isRole(row.role) || !isStatus(row.status)) throw new AuthzError("not_found", "project not found");
  if (!roleCan(row.role, action)) throw new AuthzError("forbidden", `role ${row.role} may not ${action}`);
  if (!statusAllows(row.status, action)) throw new AuthzError("project_inactive", `project is ${row.status}`);
  return { userId, projectId, role: row.role, projectStatus: row.status };
}

/** Object keys for project data always live under this prefix; workers refuse keys outside it. */
export const projectPrefix = (projectId: string) => `projects/${projectId}/`;

export function assertProjectKey(projectId: string, key: string): void {
  if (!UUID.test(projectId) || !key.startsWith(projectPrefix(projectId)) || key.includes("..")) {
    throw new AuthzError("not_found", "object key is outside the project prefix");
  }
}
