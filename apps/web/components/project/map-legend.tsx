import { PERF_GRADIENT, FREQ_GRADIENT } from "@/components/project/process-map-colors";

/** Always-visible key for the process map: color scale, width scale and what the numbers mean. */
export function MapLegend({ mode, hasStartTime }: { mode: "frekuensi" | "performa"; hasStartTime: boolean }) {
  const freq = mode === "frekuensi";
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-4 py-2 text-xs text-ink-2" aria-label="Legenda peta">
      <span className="flex items-center gap-2">
        {freq ? "Jarang" : "Cepat"}
        <span aria-hidden className="h-2 w-24 rounded-full" style={{ background: freq ? FREQ_GRADIENT : PERF_GRADIENT }} />
        {freq ? "Sering" : "Lambat"}
      </span>
      <span className="flex items-center gap-2">
        Tebal garis
        <svg width="56" height="10" aria-hidden><polygon points="0,4 56,0 56,10 0,6" className="fill-ink-3" /></svg>
        sebanding dengan {freq ? "jumlah kasus" : "median jeda"}
      </span>
      {freq ? (
        <span>Angka pada aktivitas dan garis: jumlah kasus.</span>
      ) : (
        <span>
          Angka pada aktivitas: jumlah kasus. Angka pada garis: median jeda antar-event.
          {!hasStartTime && " Jeda antar-event selesai, bukan durasi aktivitas."}
        </span>
      )}
    </div>
  );
}
