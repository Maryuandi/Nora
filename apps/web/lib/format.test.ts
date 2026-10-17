import { describe, expect, it } from "vitest";
import { MOCK_TODAY } from "./mock/data";
import { daysSince, formatBytes, formatDuration, isStale } from "./format";

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

describe("formatDuration", () => {
  const D = 86_400_000, H = 3_600_000, M = 60_000;
  it.each([
    [3.2 * D, "3,2 hari"], [4 * H, "4 jam"], [0, "< 1 menit"], [90 * M, "1,5 jam"],
    [45 * M, "45 menit"], [36 * H, "1,5 hari"], [12 * H, "12 jam"], [12.5 * D, "13 hari"],
    [59_999, "< 1 menit"], [60_000, "1 menit"], [3_599_999, "1 jam"], [3_600_000, "1 jam"],
    [86_399_999, "1 hari"], [86_400_000, "1 hari"], [35_856_000, "10 jam"],
    [NaN, "-"], [-1, "-"], [Infinity, "-"],
  ])("%s -> %s", (ms, out) => expect(formatDuration(ms)).toBe(out));
});
