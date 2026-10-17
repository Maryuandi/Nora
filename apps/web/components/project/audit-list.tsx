import { ResultBadge } from "@/components/nora/badges";
import { formatDateTime } from "@/lib/format";
import type { AuditEvent, User } from "@/lib/mock/types";

export function actorName(users: User[], id: string | null) {
  if (!id) return "Tidak dikenal";
  if (id === "system") return "Sistem";
  return users.find((u) => u.id === id)?.name ?? id;
}

/** Compact feed used on the overview card. */
export function AuditFeed({ events, users }: { events: AuditEvent[]; users: User[] }) {
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="w-36 shrink-0 text-ink-3">{formatDateTime(e.at)}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{actorName(users, e.actorId)}</span>
            <span className="text-ink-2"> · {e.action} · {e.objectLabel}</span>
          </span>
          <ResultBadge result={e.result} />
        </li>
      ))}
    </ul>
  );
}
