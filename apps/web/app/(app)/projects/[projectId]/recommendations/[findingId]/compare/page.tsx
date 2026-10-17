"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { NotFoundPanel } from "@/components/not-found-panel";
import { Banner } from "@/components/nora/banner";
import { CompareTable } from "@/components/project/compare-table";
import { RecTabs } from "@/components/project/rec-tabs";
import { useProject } from "@/components/project/use-project";
import { evaluateFinding } from "@/lib/mock/reducer";

function Compare() {
  const ctx = useProject();
  const { findingId } = useParams<{ findingId: string }>();
  const params = useSearchParams();
  if (!ctx) return null;
  const ev = evaluateFinding(ctx.state, findingId);
  if (!ev || ev.finding.projectId !== ctx.project.id) return <NotFoundPanel />;
  const href = `/projects/${ctx.project.id}/recommendations/${findingId}`;
  const ids = [...new Set((params.get("ids") ?? "").split(",").filter(Boolean))];
  const all = [...ev.ranked, ...ev.unranked];
  const items = ids.flatMap((id) => all.find((e) => e.c.id === id) ?? []);
  const message =
    ids.length < 2 || ids.length > 4 ? "Pilih 2 sampai 4 kandidat untuk dibandingkan."
    : items.length !== ids.length ? "Ada kandidat yang tidak ditemukan pada temuan ini."
    : null;
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations" />
      <div>
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink"><ArrowLeft size={14} aria-hidden />Kembali ke temuan</Link>
        <h2 className="mt-1 text-[20px] leading-7 font-semibold tracking-[-0.02em]">Perbandingan kandidat</h2>
        <p className="text-sm text-ink-2">{ev.finding.title}</p>
      </div>
      {message ? <Banner tone="warning">{message} <Link href={href} className="underline">Kembali ke temuan</Link></Banner> : <CompareTable items={items} finding={ev.finding} findingHref={href} />}
    </div>
  );
}

export default function ComparePage() {
  return <Suspense><Compare /></Suspense>;
}
