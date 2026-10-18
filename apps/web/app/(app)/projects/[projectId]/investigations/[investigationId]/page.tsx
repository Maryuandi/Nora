"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { NotFoundPanel } from "@/components/not-found-panel";
import { DecisionsTab } from "@/components/project/decisions-tab";
import { DiscussionTab } from "@/components/project/discussion-tab";
import { InvestigationHeader } from "@/components/project/investigation-header";
import { LinksTab } from "@/components/project/links-tab";
import { ModelReviewTab } from "@/components/project/model-review-tab";
import { NotesTab } from "@/components/project/notes-tab";
import { useProject } from "@/components/project/use-project";
import { cx } from "@/utils/cx";

type TabKey = "tertaut" | "catatan" | "diskusi" | "model" | "keputusan";
const TABS: { key: TabKey; label: string }[] = [
  { key: "tertaut", label: "Objek tertaut" },
  { key: "catatan", label: "Catatan" },
  { key: "diskusi", label: "Diskusi" },
  { key: "model", label: "Tinjauan model" },
  { key: "keputusan", label: "Keputusan" },
];

export default function InvestigationDetailPage() {
  const { investigationId } = useParams<{ investigationId: string }>();
  const ctx = useProject();
  const [tab, setTab] = useState<TabKey>("tertaut");
  const inv = ctx?.state.investigations.find((i) => i.id === investigationId && i.projectId === ctx.project.id);
  if (!ctx || !inv) return <NotFoundPanel />;
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${ctx.project.id}/investigations`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Investigasi
      </Link>
      <InvestigationHeader investigationId={inv.id} />
      <div className="flex self-start flex-wrap rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Bagian workspace">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cx("rounded-md px-3 py-1 text-sm", tab === t.key ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tertaut" && <LinksTab investigationId={inv.id} />}
      {tab === "catatan" && <NotesTab investigationId={inv.id} />}
      {tab === "diskusi" && <DiscussionTab investigationId={inv.id} />}
      {tab === "model" && <ModelReviewTab investigationId={inv.id} />}
      {tab === "keputusan" && <DecisionsTab investigationId={inv.id} />}
    </div>
  );
}
