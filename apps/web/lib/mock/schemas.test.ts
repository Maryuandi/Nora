import { describe, expect, it } from "vitest";
import { activateSchema, clientSchema, classCorrectionSchema, correctionSchema, memberSchema, projectSchema, statusChangeSchema, thresholdsSchema } from "./schemas";

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

  describe("correctionSchema", () => {
    const ok = { relevance: "relevan", reason: "Bukti jelas", addToGoldSet: false };
    it("rejects a whitespace-only reason", () => {
      expect(errorsOf(correctionSchema.safeParse({ ...ok, reason: "   " })).reason?.[0]).toBe("Alasan wajib diisi");
    });
    it("rejects a 501-character reason", () => {
      expect(errorsOf(correctionSchema.safeParse({ ...ok, reason: "a".repeat(501) })).reason?.[0]).toBe("Alasan maksimal 500 karakter");
    });
    it("accepts a 500-character reason", () => {
      expect(correctionSchema.safeParse({ ...ok, reason: "a".repeat(500) }).success).toBe(true);
    });
    it("rejects a relevance outside the enum", () => {
      expect(correctionSchema.safeParse({ ...ok, relevance: "mungkin" }).success).toBe(false);
    });
  });

  describe("classCorrectionSchema", () => {
    const ok = { category: "pembayaran", reason: "Jelas", addToGoldSet: false };
    it("rejects a whitespace-only reason", () => {
      expect(errorsOf(classCorrectionSchema.safeParse({ ...ok, reason: "   " })).reason?.[0]).toBe("Alasan wajib diisi");
    });
    it("rejects 501 characters and accepts 500", () => {
      expect(errorsOf(classCorrectionSchema.safeParse({ ...ok, reason: "a".repeat(501) })).reason?.[0]).toBe("Alasan maksimal 500 karakter");
      expect(classCorrectionSchema.safeParse({ ...ok, reason: "a".repeat(500) }).success).toBe(true);
    });
    it("rejects an empty category", () => {
      expect(errorsOf(classCorrectionSchema.safeParse({ ...ok, category: "" })).category?.[0]).toBe("Kategori wajib diisi");
    });
  });

  describe("thresholdsSchema", () => {
    const ok = { sufficient: 0.5, topProb: 0.6, margin: 0.15 };
    it("accepts the defaults and the range edges", () => {
      expect(thresholdsSchema.safeParse(ok).success).toBe(true);
      expect(thresholdsSchema.safeParse({ sufficient: 0, topProb: 0.3, margin: 0 }).success).toBe(true);
      expect(thresholdsSchema.safeParse({ sufficient: 1, topProb: 0.95, margin: 0.5 }).success).toBe(true);
    });
    it.each([
      [{ topProb: 0.29 }, "topProb", "Ambang probabilitas teratas harus 0,3–0,95"],
      [{ topProb: 0.96 }, "topProb", "Ambang probabilitas teratas harus 0,3–0,95"],
      [{ margin: 0.51 }, "margin", "Margin harus 0–0,5"],
      [{ margin: -0.01 }, "margin", "Margin harus 0–0,5"],
      [{ sufficient: 1.1 }, "sufficient", "Ambang bukti cukup harus 0–1"],
      [{ sufficient: NaN }, "sufficient", "Ambang bukti cukup harus 0–1"],
      [{ topProb: NaN }, "topProb", "Ambang probabilitas teratas harus 0,3–0,95"],
    ])("rejects %j", (patch, key, msg) => {
      expect(errorsOf(thresholdsSchema.safeParse({ ...ok, ...patch }))[key]?.[0]).toBe(msg);
    });
  });
});
