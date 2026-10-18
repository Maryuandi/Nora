"use client";

import { Bell } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger } from "react-aria-components";
import { Popover } from "@/components/base/select/popover";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { notificationsFor } from "@/lib/mock/reducer";
import { cx } from "@/utils/cx";

export function NotificationBell() {
  const ctx = useProject();
  const router = useRouter();
  if (!ctx) return null;
  const { project, state, viewer, dispatch } = ctx;
  const items = notificationsFor(state, viewer.id, project.id).map((n, i) => ({ n, i })).sort((a, b) => b.n.at.localeCompare(a.n.at) || b.i - a.i).map(({ n }) => n);
  const unread = items.filter((n) => !n.read).length;

  return (
    <AriaDialogTrigger>
      <AriaButton
        aria-label={`Notifikasi, ${unread} belum dibaca`}
        className="relative flex size-7 items-center justify-center rounded-lg text-ink-2 outline-focus-ring transition-colors hover:bg-white/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-white">{unread}</span>
        )}
      </AriaButton>
      <Popover size="lg" placement="bottom start" className="w-80">
        <AriaDialog aria-label="Notifikasi" className="outline-hidden">
          {({ close }) => items.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-ink-3">Belum ada notifikasi</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => { dispatch({ type: "markNotificationsRead", projectId: project.id }); close(); router.push(n.href); }}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-sidebar"
                  >
                    <span className={cx("break-words text-[13px]", n.read ? "text-ink-2" : "font-semibold text-ink")}>{n.text}</span>
                    <span className="text-xs text-ink-3">{formatDateTime(n.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AriaDialog>
      </Popover>
    </AriaDialogTrigger>
  );
}
