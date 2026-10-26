import { cx } from "@/utils/cx";

export type StepState = "done" | "current" | "todo";

/** Wizard progress; state is derived from stored records, so a reload lands on the right step. */
export function Stepper({ steps }: { steps: { label: string; state: StepState; href?: string }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]" aria-label="Langkah persiapan">
      {steps.map((s, i) => {
        const body = (
          <>
            <span aria-hidden className={cx("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
              s.state === "done" ? "bg-status-active text-white" : s.state === "current" ? "bg-accent text-white" : "bg-sidebar text-ink-3 ring-1 ring-line")}>
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className={cx("font-medium", s.state === "todo" ? "text-ink-3" : "text-ink")}>{s.label}</span>
          </>
        );
        return (
          <li key={s.label} className="flex items-center gap-2" aria-current={s.state === "current" ? "step" : undefined}>
            {s.href ? <a href={s.href} className="flex items-center gap-2 hover:underline">{body}</a> : <span className="flex items-center gap-2">{body}</span>}
            {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
