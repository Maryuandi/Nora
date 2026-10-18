"use client";

import { useState } from "react";
import { CheckCircle, FileText, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { CheckReport } from "@/components/project/check-report";
import { ClaimBadge } from "@/components/project/claim-badge";
import { ClaimText } from "@/components/project/claim-text";
import { EvidencePanel } from "@/components/project/evidence-panel";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { InterpretationStatusBadge, OverriddenPill } from "@/components/project/interpretation-status";
import { OverrideCheckModal } from "@/components/project/override-check-modal";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, CHECK_LABEL, SECTION_LABEL, SECTION_ORDER, TARGET_KIND_LABEL, isOverridable, unreferencedEvidence, violationKey } from "@/lib/mock/interpretation";
import { acceptsData } from "@/lib/mock/permissions";
import type { Interpretation, MockFinding, Violation } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

type Tab = "bukti" | "pemeriksaan";

export function InterpretationView({ interpretation, finding }: { interpretation: Interpretation; finding: MockFinding }) {
  const ctx = useProject();
  const [picked, setPicked] = useState<number | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(interpretation.status === "gagal_pemeriksaan" ? "pemeriksaan" : "bukti");
  const [overriding, setOverriding] = useState<Violation | null>(null);
  if (!ctx) return null;
  const { project, state, can } = ctx;

  const { attempts, overrides, status } = interpretation;
  const lastIdx = attempts.length - 1;
  const idx = picked ?? lastIdx;
  const attempt = attempts[idx];
  const isLast = idx === lastIdx;
  const failed = isLast && status === "gagal_pemeriksaan";
  const overridden = new Set(overrides.map(violationKey));
  const mayOverrideRole = can("interpretation.override", project.id);
  const mayOverride = mayOverrideRole && acceptsData(project.status);
  // one row per violationKey: a single override clears every violation sharing it
  const groups = [...attempt.violations.reduce((m, v) => m.set(violationKey(v), [...(m.get(violationKey(v)) ?? []), v]), new Map<string, Violation[]>()).values()];
  const hint = mayOverride && groups.some((g) => isOverridable(g[0].check) && !overridden.has(violationKey(g[0])));
  const flaggedIds = new Set(attempt.violations.flatMap((v) => (v.claimId ? [v.claimId] : [])));
  const overriddenClaims = new Set(isLast ? overrides.flatMap((o) => (o.claimId ? [o.claimId] : [])) : []);
  const unreferenced = unreferencedEvidence(attempt.sections, finding);
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  const cite = (id: string) => { setItemId(id); setTab("bukti"); };
  const item = finding.evidence.find((e) => e.id === itemId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="min-w-0 break-words text-[20px] leading-7 font-semibold tracking-[-0.02em]">{finding.title}</h2>
          <Pill className="text-ink-2">{TARGET_KIND_LABEL[finding.kind]}</Pill>
          <span className="text-sm text-ink-2">{AUDIENCE_LABEL[interpretation.audience]}</span>
          <InterpretationStatusBadge status={status} />
          {overrides.length > 0 && <OverriddenPill />}
        </div>
        <div className="flex items-center gap-2">
          <Button color="secondary" size="xs" iconLeading={FileText} href={`/projects/${project.id}/interpretations/templates`}>Templat prompt</Button>
          <span title="Workspace tinjauan (M11) belum tersedia"><Button color="secondary" size="xs" isDisabled>Buka di M11</Button></span>
        </div>
      </div>
      <Banner tone="info">Draf dibuat model — belum ditinjau</Banner>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Percobaan">
        {attempts.map((a, i) => {
          const ok = i === lastIdx ? status === "lolos_pemeriksaan" : a.violations.length === 0;
          const I = ok ? CheckCircle : XCircle;
          return (
            <button key={a.n} type="button" aria-pressed={i === idx} onClick={() => setPicked(i)}
              className={cx("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-sm", i === idx ? "border-accent bg-accent-soft font-medium text-ink" : "border-line bg-white text-ink-2 hover:text-ink")}>
              <I size={14} weight="fill" className={ok ? "text-status-active" : "text-status-ended"} aria-label={ok ? "Lolos" : "Gagal"} />
              Percobaan {a.n}{a.violations.length > 0 && ` · ${a.violations.length} pelanggaran`}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {failed ? (
            <>
              <Banner tone="warning">Draf gagal pemeriksaan setelah {attempts.length} percobaan dan tidak ditampilkan.</Banner>
              {hint && <p className="text-sm text-ink-2">Pelanggaran heuristik dapat dikesampingkan dengan alasan tercatat.</p>}
              {mayOverrideRole && !mayOverride && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; pengesampingan dinonaktifkan</p>}
              <ul className="divide-y divide-line rounded-lg border border-line bg-white">
                {groups.map((g) => {
                  const v = g[0];
                  return (
                    <li key={violationKey(v)} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{CHECK_LABEL[v.check]}</p>
                        {g.map((x, i) => <p key={i} className="break-words text-xs text-ink-2">{x.message}</p>)}
                      </div>
                      {overridden.has(violationKey(v)) ? <OverriddenPill />
                        : isOverridable(v.check) && mayOverride && <Button color="secondary" size="xs" onClick={() => setOverriding(v)}>Kesampingkan</Button>}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              {!isLast && <Banner tone="warning">Percobaan lama, bukan hasil akhir</Banner>}
              {SECTION_ORDER.map((key) => (
                <Card key={key} className="px-4 py-3">
                  <h3 className="mb-2 text-sm font-semibold text-ink">{SECTION_LABEL[key]}</h3>
                  <div className="flex flex-col gap-3">
                    {attempt.sections.find((s) => s.key === key)?.claims.map((c) => (
                      <div key={c.id} className="flex min-w-0 flex-col items-start gap-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          <ClaimBadge type={c.type} />
                          {overriddenClaims.has(c.id) && <OverriddenPill />}
                        </div>
                        <ClaimText claim={c} finding={finding} onCite={cite} flagged={flaggedIds.has(c.id)} />
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
              <Card className="px-4 py-3">
                <h3 className="mb-2 text-sm font-semibold text-ink">Bukti tidak dirujuk</h3>
                {unreferenced.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                    {unreferenced.map((e) => <li key={e.id} className="break-words">{e.title}</li>)}
                  </ul>
                ) : <p className="text-sm text-ink-3">Semua bukti dirujuk</p>}
              </Card>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Panel samping">
            {([["bukti", "Bukti"], ["pemeriksaan", "Pemeriksaan"]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cx("flex-1 rounded-md px-3 py-1 text-sm", tab === id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
                {label}
              </button>
            ))}
          </div>
          {tab === "bukti" ? <EvidencePanel item={item} /> : (
            <>
              <CheckReport results={attempt.checks} overrides={isLast ? overrides : []} />
              <Card className="px-4 py-3">
                <h3 className="mb-2 text-sm font-semibold text-ink">Pengesampingan</h3>
                {overrides.length ? (
                  <ul className="space-y-2">
                    {overrides.map((o) => (
                      <li key={violationKey(o)} className="text-sm">
                        <p className="font-medium text-ink">{CHECK_LABEL[o.check]}</p>
                        <p className="break-words text-ink-2">{o.reason}</p>
                        <p className="text-xs text-ink-3">{userName(o.by)} · {formatDateTime(o.at)}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-ink-3">Belum ada pengesampingan</p>}
              </Card>
            </>
          )}
        </div>
      </div>
      <OverrideCheckModal open={!!overriding} onClose={() => setOverriding(null)} interpretationId={interpretation.id} violation={overriding} />
    </div>
  );
}
