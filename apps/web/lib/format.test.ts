import { describe, expect, it } from "vitest";
import { MOCK_TODAY } from "./mock/data";
import { daysSince, formatBytes, formatDuration, formatEventTime, formatNumber, formatPercent, formatRange, formatRatioPct, formatScore, isStale } from "./format";

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

describe("formatEventTime", () => {
  it("shows the wall clock of the given IANA zone with a zone label", () => {
    const iso = "2026-05-01T17:30:15Z";
    const jkt = formatEventTime(iso, "Asia/Jakarta");
    expect(jkt).toContain("00.30.15"); // 17:30 UTC = 00:30 next day in WIB (UTC+7) -> 2 May
    expect(jkt).toMatch(/2 Mei 2026.*WIB/);
    expect(formatEventTime(iso, "UTC")).toContain("17.30.15");
    expect(formatEventTime(iso, "UTC")).not.toBe(jkt);
  });
  it("invalid zone or date falls back instead of throwing", () => {
    expect(() => formatEventTime("2026-05-01T00:00:00Z", "Not/AZone")).not.toThrow();
    expect(formatEventTime("garbage", "UTC")).toBe("-");
  });
});

describe("formatRange", () => {
  it("returns - for non-finite bounds instead of throwing", () => {
    expect(formatRange(NaN, 1, "UTC")).toBe("-");
    expect(formatRange(Infinity, -Infinity, "UTC")).toBe("-");
    expect(formatRange(0, 1000, "UTC")).toContain(" - ");
  });
});

describe("formatScore", () => {
  it("uses the id-ID decimal comma", () => {
    expect(formatScore(82.5)).toBe("82,5");
    expect(formatScore(80)).toBe("80");
  });
  it("shows a dash for missing or non-finite scores", () => {
    expect(formatScore(null)).toBe("–");
    expect(formatScore(NaN)).toBe("–");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent and clamps", () => {
    expect(formatPercent(0.666)).toBe("67%");
    expect(formatPercent(1.4)).toBe("100%");
  });
  it("renders NaN as 0%", () => expect(formatPercent(NaN)).toBe("0%"));
});

describe("formatNumber", () => {
  it("pads to fixed digits with decimal comma", () => {
    expect(formatNumber(0.8, 2)).toBe("0,80");
    expect(formatNumber(5, 1)).toBe("5,0");
  });
  it("renders null and NaN as a dash", () => {
    expect(formatNumber(null, 2)).toBe("–");
    expect(formatNumber(NaN, 1)).toBe("–");
  });
});

describe("formatRatioPct", () => {
  it("keeps one decimal at most", () => {
    expect(formatRatioPct(0.8)).toBe("80%");
    expect(formatRatioPct(0.8333)).toBe("83,3%");
    expect(formatRatioPct(null)).toBe("–");
    expect(formatRatioPct(NaN)).toBe("–");
  });
});
