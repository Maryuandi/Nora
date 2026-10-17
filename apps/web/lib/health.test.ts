import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAll, withTimeout } from "./health";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("rejects with 'timeout after 2000ms' once 2000ms pass", async () => {
    const result = withTimeout(new Promise(() => {}), 2000);
    const assertion = expect(result).rejects.toThrow("timeout after 2000ms");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });
});

describe("checkAll", () => {
  const ok = () => Promise.resolve("ok");

  it("returns 4 entries and marks the rejecting checker ok:false", async () => {
    const results = await checkAll({
      postgres: ok,
      neo4j: () => Promise.reject(new Error("boom")),
      minio: ok,
      temporal: ok,
    });
    expect(results.map((r) => r.name)).toEqual(["postgres", "neo4j", "minio", "temporal"]);
    expect(results.find((r) => r.name === "neo4j")).toMatchObject({ ok: false, message: "boom" });
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });

  it("yields ok:false after 2s for a hanging checker", async () => {
    const pending = checkAll({ postgres: ok, neo4j: ok, minio: () => new Promise(() => {}), temporal: ok });
    await vi.advanceTimersByTimeAsync(2000);
    const results = await pending;
    expect(results.find((r) => r.name === "minio")).toEqual({
      name: "minio",
      ok: false,
      message: "timeout after 2000ms",
    });
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });
});
