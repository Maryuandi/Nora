"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Buildings, FolderSimple, MagnifyingGlass, Plus, SidebarSimple, SignOut } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useSidebarTabs } from "@/components/shell/sidebar-tabs";
import { cx } from "@/utils/cx";
import { useTRPC } from "@/lib/trpc/client";

const TILES = ["bg-[#ece6fb] text-[#7a5bd6]", "bg-[#fde6ee] text-[#d6527f]", "bg-[#e3f5e8] text-[#2f9e57]", "bg-[#fdf3d4] text-[#b8870f]"];
const ROW = "flex h-8 w-full items-center gap-2 rounded-lg border border-transparent px-2 text-[14px] font-medium tracking-[-0.01em] transition-colors";
const LIFT = "border-line bg-white shadow-[0_1px_2px_rgb(20_18_15/0.06)]";
const HOVER = "hover:border-line hover:bg-white hover:shadow-[0_1px_2px_rgb(20_18_15/0.06)]";

function RailLink({ href, label, icon: I, active }: { href: string; label: string; icon: Icon; active?: boolean }) {
  return (
    <Link href={href} title={label} aria-label={label} aria-current={active ? "page" : undefined} className={cx("flex size-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-2 transition-colors hover:text-ink", active ? cx(LIFT, "text-accent") : HOVER)}>
      <I size={20} weight={active ? "fill" : "regular"} aria-hidden />
    </Link>
  );
}

export function LiteSidebar({ projects, viewer }: { projects: { id: string; name: string }[]; viewer: { name: string; email: string; isAdmin: boolean } }) {
  const path = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const allTabs = useSidebarTabs();
  const logoutMutation = useMutation(useTRPC().auth.logout.mutationOptions());
  const currentId = path.match(/^\/lite\/projects\/([0-9a-f-]{36})/)?.[1];
  const current = projects.find((p) => p.id === currentId);
  const q = query.trim().toLowerCase();
  const tabs = current ? allTabs.filter((t) => t.label.toLowerCase().includes(q)) : [];
  const list = projects.filter((p) => p.name.toLowerCase().includes(q));

  async function logout() {
    await logoutMutation.mutateAsync().catch(() => {});
    router.push("/lite/login");
    router.refresh();
  }

  return (
    <div className="sticky top-0 flex h-dvh shrink-0">
      <div className={cx("flex w-16 flex-col items-center gap-2 overflow-y-auto bg-sidebar py-4", open && "border-r border-line")}>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? "Tutup sidebar" : "Buka sidebar"} aria-label={open ? "Tutup sidebar" : "Buka sidebar"} className={cx("mb-2 flex size-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-2 transition-colors hover:text-ink", HOVER)}>
          <SidebarSimple size={20} aria-hidden />
        </button>
        {viewer.isAdmin && (
          <Link href="/lite/projects/new" title="Buat proyek" aria-label="Buat proyek" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_1px_2px_rgb(20_18_15/0.2)]">
            <Plus size={20} weight="bold" aria-hidden />
          </Link>
        )}
        <RailLink href="/lite" label="Semua proyek" icon={FolderSimple} active={path === "/lite"} />
        <div aria-hidden className="my-1 h-px w-8 bg-line" />
        {projects.map((p, i) => (
          <Link key={p.id} href={`/lite/projects/${p.id}`} title={p.name} aria-label={p.name} aria-current={p.id === currentId ? "page" : undefined} className={cx("flex size-10 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors", p.id === currentId ? LIFT : HOVER)}>
            <span aria-hidden className={cx("flex size-7 items-center justify-center rounded-md text-[13px] font-medium", TILES[i % TILES.length])}>{p.name[0]}</span>
          </Link>
        ))}
        <div className="mt-auto flex flex-col items-center gap-2">
          {viewer.isAdmin && <RailLink href="/lite/clients/new" label="Tambah klien" icon={Buildings} active={path === "/lite/clients/new"} />}
          <button type="button" onClick={logout} title="Keluar" aria-label="Keluar" className={cx("flex size-10 items-center justify-center rounded-lg border border-transparent text-ink-2 transition-colors hover:text-ink", HOVER)}>
            <SignOut size={20} aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <aside className="flex w-[240px] flex-col gap-4 overflow-y-auto bg-sidebar px-3 py-4">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[14px] text-ink-3">
            <MagnifyingGlass size={16} className="shrink-0 text-ink-2" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={current ? "Cari menu" : "Cari proyek"} aria-label="Cari" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3" />
          </label>
          <nav aria-label={current ? "Menu proyek" : "Daftar proyek"} className="flex flex-col gap-[3px]">
            <span className="truncate px-1 pb-1.5 text-[12px] font-medium text-ink-3">{current ? current.name : "Proyek"}</span>
            {current
              ? tabs.map((t) => (
                  <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={cx(ROW, "gap-2.5", t.active ? LIFT : HOVER)}>
                    <t.icon size={16} weight={t.active ? "fill" : "regular"} className={cx("shrink-0", t.active ? "text-accent" : "text-ink-2")} aria-hidden />
                    <span className="flex-1 truncate">{t.label}</span>
                    {t.count !== undefined && <span className="rounded-full bg-white px-1.5 text-xs text-ink-2">{t.count}</span>}
                  </Link>
                ))
              : list.map((p) => (
                  <Link key={p.id} href={`/lite/projects/${p.id}`} className={cx(ROW, "gap-2.5", HOVER)}>
                    <FolderSimple size={16} className="shrink-0 text-ink-2" aria-hidden />
                    <span className="flex-1 truncate">{p.name}</span>
                  </Link>
                ))}
            {(current ? tabs : list).length === 0 && <span className="px-1 py-1.5 text-[13px] text-ink-3">{projects.length === 0 ? "Belum ada proyek" : "Tidak ditemukan"}</span>}
          </nav>
          <div className="mt-auto rounded-lg border border-line bg-white px-3 py-2">
            <p className="truncate text-[13px] font-medium text-ink">{viewer.name}</p>
            <p className="truncate text-xs text-ink-3">{viewer.email}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
