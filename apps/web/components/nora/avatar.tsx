import { cx } from "@/utils/cx";

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// Small initials circle (Oneleet style); Untitled UI's Avatar is square-ish at this size.
export function UserAvatar({ name, size = "xs" }: { name: string; size?: "xs" | "sm" }) {
  return (
    <span
      title={name}
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-[#f3f1ee] font-medium text-ink-2",
        size === "xs" ? "size-6 text-[10px]" : "size-8 text-xs",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((n) => (
        <span key={n} className="rounded-full ring-2 ring-white">
          <UserAvatar name={n} />
        </span>
      ))}
      {rest > 0 && (
        <span className="z-10 inline-flex size-6 items-center justify-center rounded-full border border-line bg-sidebar text-[10px] font-medium text-ink-2 ring-2 ring-white">
          +{rest}
        </span>
      )}
    </span>
  );
}
