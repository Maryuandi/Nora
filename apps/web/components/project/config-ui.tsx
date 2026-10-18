"use client";

import { useState } from "react";
import { CheckCircle, Flag } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { RuleStatusBadge } from "@/components/project/rule-status";
import { CLIENT_CONFIRM_KINDS } from "@/lib/mock/configs";
import type { DefinitionImpact } from "@/lib/mock/configs";
import { acceptsData } from "@/lib/mock/permissions";
import { nextStatuses } from "@/lib/mock/rules";
import type { ConfigVersion, RuleStatus } from "@/lib/mock/types";

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </Card>
  );
}

export const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-ink-3">{label}</dt>
    <dd className="mt-0.5 text-sm break-words text-ink">{children}</dd>
  </div>
);

export function ConfigBadges({ config }: { config: ConfigVersion }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <RuleStatusBadge status={config.status} />
      <span className="text-sm text-ink-2">v{config.version}</span>
      {config.clientConfirmed && <Pill><CheckCircle size={14} weight="fill" className="text-status-active" aria-hidden />Dikonfirmasi klien</Pill>}
      {config.needsValidation && <Pill><Flag size={14} weight="fill" className="text-status-suspended" aria-hidden />Perlu validasi Javan</Pill>}
    </span>
  );
}

const LABEL: Partial<Record<RuleStatus, string>> = { ditinjau: "Ajukan tinjauan", draf: "Kembalikan ke draf", disetujui: "Setujui", usang: "Tandai usang" };

/** Review workflow buttons for the latest version of a configuration. Reducer errors are shown inline. */
export function ConfigStatusActions({ config }: { config: ConfigVersion }) {
  const ctx = useProject();
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return null;
  const { project, can, dispatch } = ctx;
  if (!acceptsData(project.status)) return null;
  const mayEdit = can("config.edit", project.id);
  const mayConfirm = can("config.confirm", project.id) && CLIENT_CONFIRM_KINDS.includes(config.data.kind)
    && (config.status === "ditinjau" || config.status === "disetujui") && !config.clientConfirmed;
  const move = (to: RuleStatus) => setError(dispatch({ type: "changeConfigStatus", configId: config.id, to }));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {mayEdit && nextStatuses(config.status).map((to) => (
          <Button key={to} size="xs" color={to === "usang" ? "secondary-destructive" : to === "draf" ? "secondary" : "primary"} onClick={() => move(to)}>{LABEL[to]}</Button>
        ))}
        {mayConfirm && <Button size="xs" color="primary" onClick={() => setError(dispatch({ type: "confirmConfigClient", configId: config.id }))}>Konfirmasi klien</Button>}
      </div>
      {error && <Banner tone="warning">{error}</Banner>}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div>
    <p className="text-xl font-semibold text-ink">{value.toLocaleString("id-ID")}</p>
    <p className="text-xs text-ink-3">{label}</p>
  </div>
);

/** Mock impact of a process definition on the project's sample data. */
export function ImpactCard({ impact, population, sourceLabel }: { impact: DefinitionImpact; population?: boolean; sourceLabel: string | null }) {
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Dampak pada data</h3>
      <div className="flex flex-col gap-3 px-4 py-4">
        {impact.status === "ok" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {population
                ? <Stat label="Kasus dalam populasi" value={impact.cases} />
                : <><Stat label="Kasus selesai" value={impact.completed} /><Stat label="Belum selesai" value={impact.incomplete} /></>}
              <Stat label="Kasus dengan rework" value={impact.rework} />
            </div>
            {sourceLabel && <p className="truncate text-xs text-ink-3" title={sourceLabel}>Contoh tiruan dari {sourceLabel}</p>}
          </>
        ) : <Banner tone="warning"><span className="break-words">Tidak dapat dievaluasi: {impact.reason}</span></Banner>}
      </div>
    </Card>
  );
}
