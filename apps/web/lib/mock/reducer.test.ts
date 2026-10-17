import { describe, expect, it } from "vitest";
import { contractEndingSoon, initialState, MOCK_TODAY, projectsForViewer, reduce, viewerRole } from "./reducer";
import type { MockState, Project } from "./types";

const s0 = (): MockState => structuredClone(initialState);
const newProject = (over: Partial<Record<string, string>> = {}) => ({
  type: "createProject" as const,
  input: {
    clientId: "c-manufaktur", name: "Proyek baru", description: "", processName: "Purchase-to-Pay",
    startActivity: "Create PO", endActivity: "Clear invoice", contractStart: "2026-11-01", contractEnd: "2027-04-30", retention: "2 tahun",
    ...over,
  },
});

describe("reduce: projects", () => {
  it("creates a draft project and records one audit event", () => {
    const before = s0();
    const { state, error } = reduce(before, newProject());
    expect(error).toBeUndefined();
    const created = state.projects.find((p) => p.name === "Proyek baru")!;
    expect(created.status).toBe("draft");
    expect(state.audit.length).toBe(before.audit.length + 1);
    expect(state.audit[0]).toMatchObject({ result: "sukses", projectId: created.id });
  });

  it("makes the creator an administrator of the new project", () => {
    const { state } = reduce(s0(), newProject());
    const created = state.projects.find((p) => p.name === "Proyek baru")!;
    expect(viewerRole(state, created.id)).toBe("administrator");
  });

  it("rejects a duplicate project name within the same client", () => {
    const before = s0();
    const existing = before.projects.find((p) => p.clientId === "c-manufaktur")!;
    const { state, error } = reduce(before, newProject({ name: existing.name }));
    expect(error).toBeTruthy();
    expect(state).toBe(before);
  });

  it("allows the same project name under a different client", () => {
    const before = s0();
    const existing = before.projects.find((p) => p.clientId === "c-manufaktur")!;
    expect(reduce(before, newProject({ name: existing.name, clientId: "c-retail" })).error).toBeUndefined();
  });

  it("rejects a contract that ends before it starts", () => {
    expect(reduce(s0(), newProject({ contractStart: "2027-01-01", contractEnd: "2026-12-01" })).error).toBeTruthy();
  });
});

describe("reduce: status", () => {
  const withStatus = (status: Project["status"]) => {
    const s = s0();
    s.projects[0] = { ...s.projects[0], status };
    return { s, id: s.projects[0].id };
  };

  it("requires a reason", () => {
    const { s, id } = withStatus("draft");
    expect(reduce(s, { type: "changeProjectStatus", projectId: id, to: "aktif", reason: "  " }).error).toBeTruthy();
  });

  const valid: [Project["status"], Project["status"]][] = [
    ["draft", "aktif"], ["aktif", "ditangguhkan"], ["aktif", "berakhir"], ["ditangguhkan", "aktif"],
    ["ditangguhkan", "berakhir"], ["berakhir", "diarsipkan"],
  ];
  for (const [from, to] of valid) {
    it(`allows ${from} -> ${to} and records history`, () => {
      const { s, id } = withStatus(from);
      const { state, error } = reduce(s, { type: "changeProjectStatus", projectId: id, to, reason: "Uji" });
      expect(error).toBeUndefined();
      const p = state.projects.find((x) => x.id === id)!;
      expect(p.status).toBe(to);
      expect(p.statusHistory.at(-1)).toMatchObject({ from, to, reason: "Uji" });
    });
  }

  for (const [from, to] of [["diarsipkan", "aktif"], ["berakhir", "aktif"], ["draft", "berakhir"]] as const) {
    it(`rejects ${from} -> ${to}`, () => {
      const { s, id } = withStatus(from);
      expect(reduce(s, { type: "changeProjectStatus", projectId: id, to, reason: "Uji" }).error).toBeTruthy();
    });
  }
});

describe("reduce: members", () => {
  const projectId = "p-procure";

  it("adds a new email as a pending user", () => {
    const { state, error } = reduce(s0(), { type: "addMember", projectId, email: "baru@klien.co.id", role: "analis" });
    expect(error).toBeUndefined();
    const u = state.users.find((x) => x.email === "baru@klien.co.id")!;
    expect(u.pending).toBe(true);
    expect(state.memberships.some((m) => m.userId === u.id && m.projectId === projectId && m.role === "analis")).toBe(true);
  });

  it("updates the role instead of duplicating an existing member", () => {
    const s = s0();
    const sari = s.users.find((u) => u.persona === "sari")!;
    const before = s.memberships.filter((m) => m.projectId === projectId).length;
    const { state } = reduce(s, { type: "addMember", projectId, email: sari.email, role: "analis" });
    const mine = state.memberships.filter((m) => m.projectId === projectId);
    expect(mine.length).toBe(before);
    expect(mine.find((m) => m.userId === sari.id)!.role).toBe("analis");
  });

  it("refuses to remove the last administrator", () => {
    const s = s0();
    const admins = s.memberships.filter((m) => m.projectId === projectId && m.role === "administrator");
    expect(admins.length).toBe(1);
    expect(reduce(s, { type: "removeMember", projectId, userId: admins[0].userId }).error).toBeTruthy();
  });

  it("refuses to demote the last administrator", () => {
    const s = s0();
    const admin = s.memberships.find((m) => m.projectId === projectId && m.role === "administrator")!;
    expect(reduce(s, { type: "changeMemberRole", projectId, userId: admin.userId, role: "analis" }).error).toBeTruthy();
  });

  it("removes a non-admin member and records audit", () => {
    const s = s0();
    const sari = s.users.find((u) => u.persona === "sari")!;
    const { state, error } = reduce(s, { type: "removeMember", projectId, userId: sari.id });
    expect(error).toBeUndefined();
    expect(state.memberships.some((m) => m.projectId === projectId && m.userId === sari.id)).toBe(false);
    expect(state.audit.length).toBe(s.audit.length + 1);
  });
});

describe("viewer", () => {
  it("switches the preview user", () => {
    const s = s0();
    const dimas = s.users.find((u) => u.persona === "dimas")!;
    expect(reduce(s, { type: "setViewer", userId: dimas.id }).state.viewerId).toBe(dimas.id);
  });

  it("lists only projects the viewer is a member of", () => {
    const s = s0();
    const sari = s.users.find((u) => u.persona === "sari")!;
    const { state } = reduce(s, { type: "setViewer", userId: sari.id });
    const mine = new Set(s.memberships.filter((m) => m.userId === sari.id).map((m) => m.projectId));
    const listed = projectsForViewer(state).map((p) => p.id);
    expect(listed.length).toBe(mine.size);
    expect(listed.every((id) => mine.has(id))).toBe(true);
    expect(listed.length).toBeLessThan(s.projects.length);
  });

  it("returns no role for a project the viewer is not in", () => {
    const s = s0();
    const sari = s.users.find((u) => u.persona === "sari")!;
    const notMine = s.projects.find((p) => !s.memberships.some((m) => m.userId === sari.id && m.projectId === p.id))!;
    expect(viewerRole(reduce(s, { type: "setViewer", userId: sari.id }).state, notMine.id)).toBeNull();
  });
});

describe("contractEndingSoon", () => {
  const p = (status: Project["status"], contractEnd: string) => ({ ...initialState.projects[0], status, contractEnd });
  it("is true for an active project ending within 14 days", () => {
    expect(MOCK_TODAY).toBe("2026-10-17");
    expect(contractEndingSoon(p("aktif", "2026-10-31"))).toBe(true);
  });
  it("is false beyond 14 days", () => expect(contractEndingSoon(p("aktif", "2026-11-15"))).toBe(false));
  it("is false for non-active projects", () => expect(contractEndingSoon(p("ditangguhkan", "2026-10-20"))).toBe(false));
});

describe("initialState", () => {
  it("has three clients and one project per status", () => {
    expect(initialState.clients.length).toBe(3);
    expect(new Set(initialState.projects.map((p) => p.status)).size).toBe(5);
  });
});
