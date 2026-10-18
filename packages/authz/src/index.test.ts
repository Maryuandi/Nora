import { describe, expect, it } from "vitest";
import { assertProjectKey, authorize, AuthzError, roleCan, statusAllows, type MembershipLookup } from "./index.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function db(rows: Record<string, { role: string; status: string }>): MembershipLookup {
  return async (userId, projectId) => rows[`${userId}:${projectId}`] ?? null;
}

describe("authorize", () => {
  const lookup = db({ [`${U1}:${P1}`]: { role: "analyst", status: "active" } });

  it("grants a member", async () => {
    await expect(authorize(lookup, U1, "analysis.run", P1)).resolves.toMatchObject({ role: "analyst" });
  });
  it("answers not_found for another project", async () => {
    await expect(authorize(lookup, U1, "project.read", P2)).rejects.toMatchObject({ code: "not_found" });
  });
  it("answers not_found for a malformed id", async () => {
    await expect(authorize(lookup, U1, "project.read", "x")).rejects.toBeInstanceOf(AuthzError);
  });
  it("forbids admin-only actions to an analyst", async () => {
    await expect(authorize(lookup, U1, "members.manage", P1)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("blocks work on a suspended project but keeps reads", async () => {
    const suspended = db({ [`${U1}:${P1}`]: { role: "analyst", status: "suspended" } });
    await expect(authorize(suspended, U1, "data.write", P1)).rejects.toMatchObject({ code: "project_inactive" });
    await expect(authorize(suspended, U1, "project.read", P1)).resolves.toBeTruthy();
  });
});

describe("roles", () => {
  it("keeps process owners read-only", () => {
    expect(roleCan("process_owner", "project.read")).toBe(true);
    expect(roleCan("process_owner", "data.write")).toBe(false);
    expect(roleCan("process_owner", "interpretation.request")).toBe(false);
  });
  it("only accepts work on active projects", () => {
    expect(statusAllows("draft", "data.write")).toBe(false);
    expect(statusAllows("active", "data.write")).toBe(true);
    expect(statusAllows("archived", "project.update")).toBe(false);
  });
});

describe("assertProjectKey", () => {
  it("accepts keys under the project prefix", () => {
    expect(() => assertProjectKey(P1, `projects/${P1}/raw/x/source`)).not.toThrow();
  });
  it("rejects keys of another project or with traversal", () => {
    expect(() => assertProjectKey(P1, `projects/${P2}/raw/x/source`)).toThrow();
    expect(() => assertProjectKey(P1, `projects/${P1}/../${P2}/x`)).toThrow();
  });
});
