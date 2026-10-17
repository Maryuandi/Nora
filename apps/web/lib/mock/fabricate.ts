import type { Snapshot } from "./types";

const COLUMNS = [
  { name: "Case ID", samples: ["C-0001", "C-0002", "C-0003"] },
  { name: "Activity", samples: ["Create Order", "Approve Order", "Ship Goods"] },
  { name: "Timestamp", samples: ["2026-09-01 08:00:00", "2026-09-01 09:10:00", "2026-09-01 10:20:00"] },
  { name: "Resource", samples: ["user_01", "user_02", "user_03"] },
  { name: "Amount", samples: ["120000", "450000", "75000"] },
];
const ACTIVITIES = ["Create Order", "Approve Order", "Ship Goods", "Send Invoice", "Receive Payment"];

// Deterministic fake content for a mock upload: no real file is ever read.
export function fabricate(rows: number, rejected: number): Pick<Snapshot, "columns" | "preview" | "errors"> {
  const preview = Array.from({ length: Math.min(100, rows) }, (_, i) => [
    `C-${String(1 + Math.floor(i / 5)).padStart(4, "0")}`,
    ACTIVITIES[i % 5],
    `2026-09-${String(1 + (i % 28)).padStart(2, "0")} ${String(8 + (i % 10)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00`,
    `user_${String(1 + (i % 4)).padStart(2, "0")}`,
    String(((i * 37) % 90 + 10) * 5000),
  ]);
  const dateCount = Math.ceil(rejected * 0.7);
  const kinds = [
    { kind: "Format tanggal tidak valid", count: dateCount, text: (r: number) => `31/13/2026 ${r}` },
    { kind: "Kolom kurang", count: rejected - dateCount, text: (r: number) => `C-${r};Create Order;;user_01` },
  ];
  const errors = kinds
    .filter((k) => k.count > 0)
    .map((k) => ({
      kind: k.kind,
      count: k.count,
      examples: Array.from({ length: Math.min(k.count, 5) }, (_, i) => {
        const row = Math.min(Math.max(1, 2 + Math.floor(((i + 1) * rows) / 7)), Math.max(rows, 1));
        return { row, text: k.text(row) };
      }),
    }));
  return { columns: COLUMNS, preview, errors };
}
