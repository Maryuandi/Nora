import { Pill } from "@/components/nora/badges";
import { RELATION_META, type RelationTone } from "@/lib/mock/graph";
import type { GraphEdge, RelationCategory, RelationCreator } from "@/lib/mock/types";

// RELATION_META.tone holds semantic names; map them to Tailwind token classes here. Colour sits on the icon only: amber text on white fails contrast.
const TONE: Record<RelationTone, string> = { accent: "text-accent", ink: "text-ink", warning: "text-status-suspended", neutral: "text-ink-3" };

export function RelationBadge({ category, createdBy, status, type }: { category: RelationCategory; createdBy: RelationCreator; status: GraphEdge["status"]; type?: string }) {
  const m = RELATION_META[category];
  const I = m.icon;
  return (
    <Pill>
      <I size={14} weight="fill" className={TONE[m.tone]} aria-hidden />
      <span className="text-ink-2">
        {m.label}
        {type && <> · {type}</>}
        {" · "}{createdBy}
        {status === "digantikan" && " · digantikan"}
        {m.unproven && " · belum terbukti"}
      </span>
    </Pill>
  );
}
