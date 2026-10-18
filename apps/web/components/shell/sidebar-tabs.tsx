"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { HeaderTab } from "@/components/shell/page-header";

const Ctx = createContext<{ tabs: HeaderTab[]; setTabs: (t: HeaderTab[]) => void }>({ tabs: [], setTabs: () => {} });

export function SidebarTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<HeaderTab[]>([]);
  return <Ctx.Provider value={{ tabs, setTabs }}>{children}</Ctx.Provider>;
}

export const useSidebarTabs = () => useContext(Ctx).tabs;

/** Project layouts declare their menu here; the sidebar renders it. */
export function PublishTabs({ tabs }: { tabs: HeaderTab[] }) {
  const { setTabs } = useContext(Ctx);
  const sig = tabs.map((t) => `${t.href}|${t.label}|${t.count ?? ""}|${t.active ? 1 : 0}`).join(";");
  // tabs is rebuilt every render; sig changes only when something visible does
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTabs(tabs); return () => setTabs([]); }, [sig, setTabs]);
  return null;
}
