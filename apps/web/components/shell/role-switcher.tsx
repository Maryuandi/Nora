"use client";

import { useMock } from "@/lib/mock/store";
import { ROLE_LABEL } from "@/components/nora/badges";
import { UserAvatar } from "@/components/nora/avatar";
import { cx } from "@/utils/cx";

const PERSONAS = [
  { persona: "rina", role: "administrator" },
  { persona: "dimas", role: "analis" },
  { persona: "sari", role: "pemilik_proses" },
] as const;

export function RoleSwitcher() {
  const { state, viewer, dispatch } = useMock();
  return (
    <div className="rounded-lg border border-dashed border-[#d9d6d1] bg-white/60 p-2">
      <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3">Mode pratinjau</p>
      <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Lihat sebagai">
        {PERSONAS.map(({ persona, role }) => {
          const user = state.users.find((u) => u.persona === persona)!;
          const active = viewer.id === user.id;
          return (
            <button
              key={persona}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => dispatch({ type: "setViewer", userId: user.id })}
              className={cx(
                "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs",
                active ? "bg-white text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-white/70",
              )}
            >
              <UserAvatar name={user.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.name.split(" ")[0]}</span>
                <span className="block truncate text-ink-3">{ROLE_LABEL[role]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
