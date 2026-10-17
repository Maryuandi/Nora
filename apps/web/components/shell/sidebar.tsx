"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CaretDown, FolderSimple, ListChecks, Buildings, ShieldCheck, SquaresFour, UsersThree, SidebarSimple } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Logo } from "@/components/nora/logo";
import { useMock } from "@/lib/mock/store";
import { projectsForViewer } from "@/lib/mock/reducer";
import { RoleSwitcher } from "./role-switcher";
import { cx } from "@/utils/cx";

function NavItem({ href, label, icon: I, active, sub }: { href: string; label: string; icon?: Icon; active: boolean; sub?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
        active ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-[#3a3836] hover:bg-white/60",
        sub && "pl-2.5",
      )}
    >
      {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent" />}
      {I && <I size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-ink-3"} aria-hidden />}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Group({ label, icon: I, children }: { label: string; icon: Icon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3 hover:text-ink-2"
      >
        <I size={16} aria-hidden />
        {label}
        <CaretDown size={10} weight="fill" className={cx("transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      {open && <div className="ml-[17px] flex flex-col gap-0.5 border-l border-[#e0ddd9] pl-2">{children}</div>}
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  const mock = useMock();
  const first = projectsForViewer(mock.state)[0];

  return (
    <aside className="sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col bg-sidebar px-3 py-4">
      <div className="mb-4 flex items-center justify-between px-2">
        <span className="flex items-center gap-1">
          <Logo />
          <CaretDown size={12} className="text-ink-3" aria-hidden />
        </span>
        <SidebarSimple size={18} className="text-ink-3" aria-hidden />
      </div>

      <nav className="flex flex-col gap-0.5" aria-label="Navigasi utama">
        <NavItem href="/" label="Proyek" icon={FolderSimple} active={path === "/"} />
        <NavItem href="/modules" label="Modul" icon={SquaresFour} active={path.startsWith("/modules") || /^\/m\d{2}$/.test(path)} />

        <Group label="Akses" icon={ShieldCheck}>
          {first ? (
            <>
              <NavItem sub href={`/projects/${first.id}/members`} label="Anggota" active={path.endsWith("/members")} />
              <NavItem sub href={`/projects/${first.id}/audit`} label="Audit log" active={path.endsWith("/audit")} />
            </>
          ) : (
            <span className="px-2.5 py-1.5 text-sm text-ink-3">Belum ada proyek</span>
          )}
        </Group>

        {mock.can("client.create") && (
          <Group label="Klien" icon={Buildings}>
            <NavItem sub href="/clients/new" label="Tambah klien" active={path === "/clients/new"} />
            <NavItem sub href="/projects/new" label="Buat proyek" active={path === "/projects/new"} />
          </Group>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-2 text-[13px] text-ink-2">
          <Link href="/health" className="flex items-center gap-2 hover:text-ink"><ListChecks size={16} aria-hidden />Status sistem</Link>
          <Link href="/login" className="flex items-center gap-2 hover:text-ink"><UsersThree size={16} aria-hidden />Keluar</Link>
        </div>
        <RoleSwitcher />
      </div>
    </aside>
  );
}

