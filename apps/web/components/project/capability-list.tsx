import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import type { Capability, CapabilityStatus } from "@/lib/mock/types";

const STATUS: Record<CapabilityStatus, { label: string; icon: Icon; color: string }> = {
  tersedia: { label: "Tersedia", icon: CheckCircle, color: "text-status-active" },
  terbatas: { label: "Terbatas", icon: WarningCircle, color: "text-status-suspended" },
  tidak_tersedia: { label: "Tidak tersedia", icon: XCircle, color: "text-ink-3" },
};

/** What the dataset can be used for. Labels and explanations are plain text nodes. */
export function CapabilityList({ items }: { items: Capability[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line" aria-label="Kapabilitas dataset">
      {items.map((c) => {
        const m = STATUS[c.status];
        const I = m.icon;
        return (
          <li key={c.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex shrink-0 items-center gap-2 sm:w-[300px]">
              <Pill>
                <I size={14} weight="fill" className={m.color} aria-hidden />
                {m.label}
              </Pill>
              <span className="min-w-0 text-sm font-medium break-words text-ink">{c.label}</span>
            </div>
            <p className="min-w-0 text-sm break-words text-ink-2">{c.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}
