// Fixture of observed cases for the M09 arithmetic scenarios (fake data, deterministic).
export type RecCase = {
  id: string; durationDays: number;
  gaps: Record<string, number>; rework: Record<string, number>; activityDays: Record<string, number>;
  unit: string; kategori: string;
};

export const TRANSITIONS = ["Create PO → Approve PO", "Approve PO → Goods Receipt"];
export const ACTIVITIES = ["Change Approval", "Manual Review"];
export const UNITS = ["Unit Jakarta", "Unit Surabaya", "Unit Medan"];
export const KATEGORI = ["Bahan baku", "Jasa", "Aset"];
export const DATASET_VERSION = "snapshot-2026-09";
export const CONTEXT_PACK = "ctx-v3";

// mulberry32: tiny seeded PRNG so the demo looks the same every time.
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCases(): RecCase[] {
  const rnd = prng(9);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  return Array.from({ length: 240 }, (_, i) => {
    const gap0 = int(0, 14), gap1 = int(0, 8);
    const rework = rnd() < 0.22 ? int(1, 5) : 0;
    const review = rnd() < 0.6 ? int(1, 3) : 0;
    return {
      id: `c${String(i + 1).padStart(3, "0")}`,
      durationDays: int(4, 14) + gap0 + gap1 + rework + review,
      gaps: { [TRANSITIONS[0]]: gap0, [TRANSITIONS[1]]: gap1 },
      rework: { [ACTIVITIES[0]]: rework },
      activityDays: { [ACTIVITIES[1]]: review },
      unit: UNITS[int(0, 2)], kategori: KATEGORI[int(0, 2)],
    };
  });
}
