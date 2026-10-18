import { describe, expect, it } from "vitest";
import { MOCK_TODAY } from "./mock/data";
import { daysSince, formatBytes, formatNumber, formatRatioPct, formatPercent, formatScore, isStale } from "./format";

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
