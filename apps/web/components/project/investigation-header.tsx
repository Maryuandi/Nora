"use client";

import { useState } from "react";
import { Flask } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { AvatarStack } from "@/components/nora/avatar";
import { Banner } from "@/components/nora/banner";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { InvestigationStatusPill } from "@/components/project/investigation-status";
import { INVESTIGATION_STATUS_LABEL, unreviewedModelOutputs } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";
import { useMock } from "@/lib/mock/store";
import type { InvestigationStatus } from "@/lib/mock/types";

const STATUSES = Object.keys(INVESTIGATION_STATUS_LABEL) as InvestigationStatus[];

export function InvestigationHeader({ investigationId }: { investigationId: string }) {
  const { state, dispatch, can } = useMock();
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  const project = inv && state.projects.find((p) => p.id === inv.projectId);
  if (!inv || !project) return null;
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  const unreviewed = unreviewedModelOutputs(state, inv.id).length;
  const mayManage = can("investigation.status", project.id) && acceptsData(project.status);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">{inv.title}</h1>
          <p className="mt-1 text-sm text-ink-2">{inv.question}</p>
        </div>
        <InvestigationStatusPill status={inv.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-2">
        <span>Pemilik: <span className="font-medium text-ink">{name(inv.ownerId)}</span></span>
        <span className="flex items-center gap-2">Anggota: <AvatarStack names={inv.memberIds.map(name)} /></span>
      </div>
      {unreviewed > 0 && <Banner tone="warning">{unreviewed} keluaran model belum ditinjau</Banner>}
      {error && <Banner tone="warning">{error}</Banner>}
      {mayManage && (
        <div className="flex flex-wrap items-end gap-3">
          <NativeSelect
            label="Ubah status" size="sm" value={inv.status} className="w-52"
            onChange={(e) => setError(dispatch({ type: "setInvestigationStatus", investigationId: inv.id, to: e.target.value as InvestigationStatus }))}
            options={STATUSES.map((s) => ({ label: INVESTIGATION_STATUS_LABEL[s], value: s }))}
          />
          <Button color="secondary" size="xs" iconLeading={Flask} onClick={() => setError(dispatch({ type: "simulateNewAnalysis", projectId: project.id }))}>
            Simulasikan analisis baru <Pill className="ml-1">Demo</Pill>
          </Button>
        </div>
      )}
    </Card>
  );
}
