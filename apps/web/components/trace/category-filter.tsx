import { RELATION_META } from "@/lib/mock/graph";
import type { RelationCategory } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const CATS = Object.keys(RELATION_META) as RelationCategory[];

export function CategoryFilter({ value, onChange, categories = CATS }: { value: ReadonlySet<RelationCategory>; onChange: (v: Set<RelationCategory>) => void; categories?: readonly RelationCategory[] }) {
  return (
    <div role="group" aria-label="Kategori hubungan" className="flex flex-wrap gap-2">
      {categories.map((c) => {
        const on = value.has(c);
        const I = RELATION_META[c].icon;
        return (
          <button key={c} type="button" aria-pressed={on}
            onClick={() => { const n = new Set(value); if (on) n.delete(c); else n.add(c); onChange(n); }}
            className={cx("inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium", on ? "border-accent bg-accent-soft text-ink" : "border-line bg-white text-ink-3 hover:text-ink")}>
            <I size={14} weight={on ? "fill" : "regular"} aria-hidden />
            {RELATION_META[c].label}
          </button>
        );
      })}
    </div>
  );
}
