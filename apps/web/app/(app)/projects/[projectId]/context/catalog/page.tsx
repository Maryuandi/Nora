"use client";

import { useState } from "react";
import { Books } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { ConfigSection } from "@/components/project/config-section";
import { ContextTabs } from "@/components/project/context-tabs";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { configsForProject } from "@/lib/mock/reducer";
import type { ConfigKind } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const TABS: { kind: ConfigKind; label: string }[] = [
  { kind: "hypothesis", label: "Hipotesis" }, { kind: "intervention", label: "Intervensi" }, { kind: "rubric", label: "Rubrik" },
];

export default function CatalogPage() {
  const ctx = useProject();
  const [kind, setKind] = useState<ConfigKind>("hypothesis");
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return null;
  const { project, state, can, dispatch } = ctx;
  const mine = configsForProject(state, project.id);
  const empty = !mine.some((c) => TABS.some((t) => t.kind === c.data.kind));
  const mayCopy = can("config.edit", project.id) && acceptsData(project.status);

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/catalog" />
      <Banner>Katalog awal P2P disusun dari literatur dan berlabel &quot;perlu validasi Javan&quot; sampai ditinjau analis.</Banner>
      {empty && (
        <Card className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <Books size={28} className="text-ink-3" aria-hidden />
          <p className="text-sm text-ink-2">Katalog proyek ini masih kosong. Salin katalog awal P2P sebagai titik mulai; salinan menjadi milik proyek dan dapat diubah.</p>
          {mayCopy && <Button size="xs" color="primary" onClick={() => setError(dispatch({ type: "copyStarterCatalog", projectId: project.id }))}>Salin katalog awal P2P</Button>}
          {error && <Banner tone="warning">{error}</Banner>}
        </Card>
      )}
      <div className="flex w-fit rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Jenis katalog">
        {TABS.map((t) => (
          <button key={t.kind} role="tab" aria-selected={kind === t.kind} onClick={() => setKind(t.kind)}
            className={cx("rounded-md px-3 py-1 text-sm", kind === t.kind ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
            {t.label} <span className="ml-1 text-ink-3">{mine.filter((c) => c.data.kind === t.kind).map((c) => c.key).filter((k, i, a) => a.indexOf(k) === i).length}</span>
          </button>
        ))}
      </div>
      <ConfigSection key={kind} kind={kind} title={TABS.find((t) => t.kind === kind)!.label} />
    </div>
  );
}
