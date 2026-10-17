import { Clock } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { freshness } from "@/lib/mock/graph";
import type { GraphStatus } from "@/lib/mock/types";

export function StaleBadge({ status }: { status: GraphStatus | undefined }) {
  if (!status || !freshness(status).stale) return null;
  return (
    <Pill>
      <Clock size={14} weight="fill" className="text-status-suspended" aria-hidden />
      <span className="text-ink-2">Konteks mungkin belum terbaru</span>
    </Pill>
  );
}
