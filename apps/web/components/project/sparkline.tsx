export function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? 64 / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${values.length > 1 ? i * step : 32},${(18 - (v / max) * 16).toFixed(1)}`).join(" ");
  return (
    <svg width={64} height={20} viewBox="0 0 64 20" aria-hidden className="text-accent">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
