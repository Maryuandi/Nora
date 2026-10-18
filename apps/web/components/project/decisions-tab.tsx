"use client";

import { useState } from "react";
import { CheckCircle, ClockCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Pill, ROLE_LABEL } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { DecisionHistory } from "@/components/project/decision-history";
import { DecisionModal } from "@/components/project/decision-modal";
import { linkTitle } from "@/components/project/link-object-modal";
import { ProposalsSection } from "@/components/project/proposals-section";
import { formatDateTime } from "@/lib/format";
import { DECISION_LABEL, canDecide, decisionHistory } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";
import { findingsForProject, flagsForProject } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";
import type { DecisionStatus } from "@/lib/mock/types";

const STATUSES = Object.keys(DECISION_LABEL) as DecisionStatus[];
const DOT: Record<DecisionStatus, string> = {
  perlu_investigasi: "bg-status-neutral", usulan_uji_coba: "bg-status-suspended", dipilih: "bg-status-active",
  ditolak: "bg-status-ended", digantikan: "bg-status-neutral",
};

export function DecisionsTab({ investigationId }: { investigationId: string }) {
  const { state, dispatch, roleIn } = useMock();
  const [deciding, setDeciding] = useState<{ linkId: string; expectedVersion: number; validated: boolean } | null>(null);
  const [history, setHistory] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  const project = inv && state.projects.find((p) => p.id === inv.projectId);
  if (!inv || !project) return null;
  const role = roleIn(project.id);
  const writable = acceptsData(project.status);
  const allowed = STATUSES.filter((s) => canDecide(role, s));
  const mayDecide = writable && allowed.length > 0;
  const candidates = state.links.filter((l) => l.investigationId === inv.id && l.kind === "kandidat");
  const evidence = findingsForProject(state, project.id).flatMap((f) => f.evidence);
  const flags = flagsForProject(state, project.id);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  const toggle = (id: string) => setHistory((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const roleNote =
    role === "administrator" ? "Administrator hanya dapat melihat keputusan."
    : role === "pemilik_proses" ? "Sebagai pemilik proses, Anda hanya dapat menetapkan status Dipilih; status analitis ditetapkan analis."
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Keputusan kandidat</h2>
        {inv.status !== "siap_diputuskan" && (
          <p className="mt-1 text-sm text-ink-2">Keputusan membutuhkan status Siap diputuskan, kecuali Perlu investigasi yang bisa ditetapkan kapan saja.</p>
        )}
        {roleNote && <p className="mt-1 text-sm text-ink-3">{roleNote}</p>}
      </div>
      {error && <Banner tone="warning">{error}</Banner>}

      {candidates.length ? candidates.map((l) => {
        const item = evidence.find((e) => e.id === l.targetId);
        const validated = !!item?.validated;
        const versions = decisionHistory(state, inv.id, l.id);
        const d = versions[0];
        const flag = d && flags.find((f) => f.decisionId === d.id);
        const replacement = d?.replacedByLinkId && state.links.find((x) => x.id === d.replacedByLinkId);
        return (
          <Card key={l.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{linkTitle(state, project.id, l)}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-ink-2">
                  {validated
                    ? <><CheckCircle size={14} weight="fill" className="text-status-active" aria-hidden /> Tervalidasi</>
                    : <><WarningCircle size={14} weight="fill" className="text-ink-3" aria-hidden /> Belum tervalidasi</>}
                </p>
              </div>
              {mayDecide && (
                <Button color="secondary" size="xs" onClick={() => setDeciding({ linkId: l.id, expectedVersion: d?.version ?? 0, validated })}>
                  {d ? "Ubah keputusan" : "Tetapkan keputusan"}
                </Button>
              )}
            </div>

            {flag && (
              <div className="flex flex-col gap-2 rounded-lg border border-status-suspended/40 bg-status-suspended/10 px-3 py-2 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <WarningCircle size={16} weight="fill" className="text-status-suspended" aria-hidden /> Perlu ditinjau ulang
                </p>
                <ul className="list-disc pl-5 text-ink-2">{flag.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
                {writable && canDecide(role, d.status) ? (
                  <div><Button color="primary" size="xs" onClick={() => setError(dispatch({ type: "confirmDecision", decisionId: d.id }))}>Tegaskan</Button></div>
                ) : !writable ? (
                  <p className="text-ink-3">Proyek tidak menerima perubahan.</p>
                ) : (
                  <p className="text-ink-3">{d.status === "dipilih" ? "Hanya pemilik proses" : "Hanya analis"} yang dapat menegaskan keputusan ini.</p>
                )}
              </div>
            )}

            {d ? (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill dot={DOT[d.status]}>{DECISION_LABEL[d.status]}</Pill>
                  <span className="text-ink-2">v{d.version} · {name(d.byId)} ({ROLE_LABEL[d.byRole]}) · {formatDateTime(d.at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-ink"><span className="text-ink-2">Alasan: </span>{d.reason}</p>
                {replacement && <p className="text-ink-2">Digantikan oleh: {linkTitle(state, project.id, replacement)}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-canvas px-3 py-2 text-xs sm:grid-cols-5">
                  {([
                    ["Dataset", d.snapshot.datasetVersion], ["Paket konteks", d.snapshot.contextPackage], ["Analisis", d.snapshot.analysis],
                    ["Paket bukti", d.snapshot.evidencePackage], ["Versi narasi", d.snapshot.narrativeVersion],
                  ] as const).map(([k, v]) => (
                    <div key={k}><dt className="text-ink-3">{k}</dt><dd className="font-medium text-ink">{v || "—"}</dd></div>
                  ))}
                </dl>
              </div>
            ) : <p className="text-sm text-ink-3">Belum ada keputusan.</p>}

            {d && (
              <div className="flex flex-col gap-2">
                <div><Button color="link-gray" size="xs" iconLeading={ClockCounterClockwise} onClick={() => toggle(l.id)}>
                  {history.has(l.id) ? "Sembunyikan riwayat" : `Riwayat versi (${versions.length})`}
                </Button></div>
                {history.has(l.id) && <DecisionHistory investigationId={inv.id} linkId={l.id} />}
              </div>
            )}
          </Card>
        );
      }) : <Card className="p-6 text-center text-sm text-ink-3">Belum ada kandidat tertaut. Tautkan kandidat di tab Objek tertaut.</Card>}

      {mayDecide && (
        <DecisionModal open={!!deciding} onClose={() => setDeciding(null)} investigationId={inv.id}
          linkId={deciding?.linkId ?? ""} expectedVersion={deciding?.expectedVersion ?? 0} validated={deciding?.validated ?? false} />
      )}

      <ProposalsSection investigationId={inv.id} />
    </div>
  );
}
