import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { CHECKS, CHECK_LABEL } from "@/lib/mock/interpretation";
import type { CheckOverride, CheckResult } from "@/lib/mock/types";

export function CheckReport({ results, overrides }: { results: CheckResult[]; overrides: CheckOverride[] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-white">
      {results.map((r) => {
        const heuristic = CHECKS.find((c) => c.key === r.check)?.heuristic;
        const ov = overrides.filter((o) => o.check === r.check);
        return (
          <li key={r.check} className="flex gap-2.5 px-3 py-2.5">
            {r.ok ? (
              <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-status-active" aria-label="Lulus" />
            ) : (
              <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-status-ended" aria-label="Gagal" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium text-ink">{CHECK_LABEL[r.check]}</span>
                {heuristic && <Pill className="text-ink-2">Heuristik</Pill>}
              </div>
              {r.messages.map((m, i) => (
                <p key={i} className="break-words text-xs text-ink-2">{m}</p>
              ))}
              {ov.map((o, i) => (
                <p key={i} className="break-words text-xs text-status-suspended">Dikesampingkan: {o.reason}</p>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
