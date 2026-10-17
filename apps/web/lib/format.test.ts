import { describe, expect, it } from "vitest";
import { MOCK_TODAY } from "./mock/data";
import { daysSince, formatBytes, isStale } from "./format";

const before = (days: number) => new Date(Date.parse(`${MOCK_TODAY}T00:00:00Z`) - days * 86_400_000).toISOString();

describe("formatBytes", () => {
  it("formats with id-ID decimals", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1536 * 1024)).toBe("1,5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GB");
  });
});

describe("staleness", () => {
  it("counts whole days", () => expect(daysSince(before(5))).toBe(5));
  it("exactly 30 days is fresh", () => expect(isStale(before(30))).toBe(false));
  it("31 days is stale", () => expect(isStale(before(31))).toBe(true));
});
