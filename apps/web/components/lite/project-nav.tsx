"use client";

import { usePathname } from "next/navigation";
import { SquaresFour } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { PublishTabs } from "@/components/shell/sidebar-tabs";

interface NavItem {
  label: string;
  icon: Icon;
  /** relative to the project base; "" is the summary */
  path: string;
}

/** Main analysis flow only; utilities live in the overflow menu, not in the sidebar. */
const FLOW: NavItem[] = [{ label: "Ringkasan", icon: SquaresFour, path: "" }];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/lite/projects/${projectId}`;
  const tabs = FLOW.map((t) => {
    const href = t.path ? `${base}/${t.path}` : base;
    return { label: t.label, icon: t.icon, href, active: t.path ? pathname.startsWith(href) : pathname === base };
  });
  return <PublishTabs tabs={tabs} />;
}

export function ProjectUtilities({ projectId, items }: { projectId: string; items: { members: boolean; audit: boolean; settings: boolean; system: boolean } }) {
  const base = `/lite/projects/${projectId}`;
  const links = [
    items.members && { id: "members", label: "Anggota", href: `${base}/members` },
    items.audit && { id: "audit", label: "Audit log", href: `${base}/audit` },
    items.settings && { id: "settings", label: "Pengaturan proyek", href: `${base}/settings` },
    items.system && { id: "system", label: "Status sistem proyek", href: `${base}/system` },
  ].filter(Boolean) as { id: string; label: string; href: string }[];
  if (!links.length) return null;
  return (
    <Dropdown.Root>
      <Dropdown.DotsButton aria-label="Utilitas proyek" className="rounded-lg p-1.5 ring-1 ring-line" />
      <Dropdown.Popover className="w-56">
        <Dropdown.Menu aria-label="Utilitas proyek" items={links}>
          {(l) => <Dropdown.Item id={l.id} href={l.href} label={l.label} selectionIndicator="none" />}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  );
}
