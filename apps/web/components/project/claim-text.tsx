import type { Claim, MockFinding } from "@/lib/mock/types";
import { resolvePlaceholders } from "@/lib/mock/interpretation";
import { cx } from "@/utils/cx";

export function ClaimText({
  claim, finding, onCite, flagged,
}: { claim: Claim; finding: MockFinding; onCite: (itemId: string) => void; flagged?: boolean }) {
  const segments = resolvePlaceholders(claim.text, finding);
  const cites = claim.citations.flatMap((id) => {
    const item = finding.evidence.find((e) => e.id === id);
    return item ? [item] : [];
  });
  return (
    <div className={cx("break-words text-sm text-ink", flagged && "border-l-2 border-status-ended pl-3")}>
      <p>
        {segments.map((s, i) =>
          s.kind === "text" ? (
            <span key={i}>{s.text}</span>
          ) : s.kind === "number" ? (
            <span key={i} tabIndex={0} title={s.origin} className="font-medium underline decoration-dashed underline-offset-2">
              {s.formatted}
            </span>
          ) : (
            <span key={i} className="rounded-sm bg-red-50 px-1 text-xs font-medium text-red-700">[nilai tidak ditemukan]</span>
          ),
        )}
      </p>
      {cites.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {cites.map((e) => (
            <button
              key={e.id}
              type="button"
              title={e.title}
              onClick={() => onCite(e.id)}
              className="max-w-[16rem] truncate rounded-full border border-line bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent hover:border-accent"
            >
              {e.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
