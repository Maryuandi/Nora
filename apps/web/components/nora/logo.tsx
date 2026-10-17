export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink">
      <span aria-hidden className="rounded-[5px] bg-accent" style={{ width: size, height: size }} />
      Nora
    </span>
  );
}
