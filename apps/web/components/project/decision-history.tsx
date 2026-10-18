"use client";

import { Pill, ROLE_LABEL } from "@/components/nora/badges";
import { linkTitle } from "@/components/project/link-object-modal";
import { formatDateTime } from "@/lib/format";
import { DECISION_LABEL, decisionHistory } from "@/lib/mock/investigation";
import { useMock } from "@/lib/mock/store";

/** Semua versi keputusan untuk satu kandidat, terbaru dulu. Hanya baca. */
export function DecisionHistory({ investigationId, linkId }: { investigationId: string; linkId: string }) {
  const { state } = useMock();
  const projectId = state.investigations.find((i) => i.id === investigationId)?.projectId ?? "";
  const versions = decisionHistory(state, investigationId, linkId);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  const link = (id: string) => state.links.find((l) => l.id === id);
  if (!versions.length) return <p className="text-sm text-ink-3">Belum ada riwayat.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {versions.map((d) => {
        const repl = d.replacedByLinkId ? link(d.replacedByLinkId) : undefined;
        return (
          <li key={d.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">v{d.version}</span>
              <Pill>{DECISION_LABEL[d.status]}</Pill>
              <span className="text-ink-2">{name(d.byId)} ({ROLE_LABEL[d.byRole]}) · {formatDateTime(d.at)}</span>
            </div>
            <p className="whitespace-pre-wrap text-ink">{d.reason}</p>
            {d.replacedByLinkId && <p className="text-ink-2">Digantikan oleh: {repl ? linkTitle(state, projectId, repl) : d.replacedByLinkId}</p>}
          </li>
        );
      })}
    </ol>
  );
}
