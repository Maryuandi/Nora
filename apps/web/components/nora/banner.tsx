import { Info, Warning } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/utils/cx";

export function Banner({ tone = "info", children, action }: { tone?: "info" | "warning"; children: React.ReactNode; action?: React.ReactNode }) {
  const Icon = tone === "info" ? Info : Warning;
  return (
    <div
      role="status"
      className={cx(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "info" ? "border-brand-200 bg-accent-soft text-ink" : "border-[#f3d48a] bg-[#fdf6e3] text-ink",
      )}
    >
      <Icon size={18} weight="fill" className={tone === "info" ? "text-accent" : "text-status-suspended"} aria-hidden />
      <span>{children}</span>
      {action && <span className="ml-1 font-medium text-accent">{action}</span>}
    </div>
  );
}
