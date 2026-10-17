import { describe, expect, it } from "vitest";
import { activateSchema, clientSchema, memberSchema, projectSchema, statusChangeSchema } from "./schemas";

const errorsOf = (r: { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[] | undefined> } } }) =>
  r.success ? {} : r.error!.flatten().fieldErrors;

describe("schemas", () => {
  it("rejects whitespace-only required client fields", () => {
    const e = errorsOf(clientSchema.safeParse({ name: "   ", sector: "Manufaktur", contact: "a@b.co" }));
    expect(e.name?.[0]).toBeTruthy();
  });

  it("rejects whitespace-only project name", () => {
    const e = errorsOf(
      projectSchema.safeParse({
        clientId: "c-1", name: "  ", description: "", processName: "Purchase-to-Pay",
        startActivity: "", endActivity: "", contractStart: "2026-01-01", contractEnd: "2026-12-31", retention: "2 tahun",
      }),
    );
    expect(e.name?.[0]).toBeTruthy();
  });

  it("rejects a project whose contract ends before it starts", () => {
    const e = errorsOf(
      projectSchema.safeParse({
        clientId: "c-1", name: "P2P", description: "", processName: "Purchase-to-Pay",
        startActivity: "", endActivity: "", contractStart: "2026-06-01", contractEnd: "2026-05-01", retention: "2 tahun",
      }),
    );
    expect(e.contractEnd?.[0]).toMatch(/sebelum/);
  });

  it("rejects an invalid member email", () => {
    expect(errorsOf(memberSchema.safeParse({ email: "bukan-email", role: "analis" })).email?.[0]).toBeTruthy();
  });

  it("requires a status-change reason", () => {
    expect(errorsOf(statusChangeSchema.safeParse({ to: "ditangguhkan", reason: "  " })).reason?.[0]).toBeTruthy();
  });

  it("rejects an 11-character activation password", () => {
    expect(errorsOf(activateSchema.safeParse({ password: "a".repeat(11), confirm: "a".repeat(11) })).password?.[0]).toBeTruthy();
  });

  it("puts a confirmation mismatch on the confirm field", () => {
    const e = errorsOf(activateSchema.safeParse({ password: "a".repeat(12), confirm: "b".repeat(12) }));
    expect(e.confirm?.[0]).toBeTruthy();
    expect(e.password).toBeUndefined();
  });
});
