import { Pill } from "@/components/nora/badges";
import { RELATION_META } from "@/lib/mock/graph";
import type { GraphEdge, RelationCategory, RelationCreator } from "@/lib/mock/types";

// RELATION_META.tone holds semantic names; map them to Tailwind token classes here.
const TONE: Record<string, string> = { accent: "text-accent", ink: "text-ink", warning: "text-status-suspended", neutral: "text-ink-3" };
const CREATOR: Record<RelationCreator, string> = { sistem: "sistem", model: "model", pengguna: "pengguna" };

export function RelationBadge({ category, createdBy, status, type }: { category: RelationCategory; createdBy: RelationCreator; status: GraphEdge["status"]; type?: string }) {
  const m = RELATION_META[category];
  const I = m.icon;
  return (
    <Pill>
      <I size={14} weight="fill" className={TONE[m.tone]} aria-hidden />
      {m.label}
      {type && <span className="text-ink-3">{type}</span>}
      <span className="text-ink-3">· {CREATOR[createdBy]}</span>
      {status === "digantikan" && <span className="text-ink-3">· digantikan</span>}
      {m.unproven && <span className="text-status-suspended">· belum terbukti</span>}
    </Pill>
  );
}
