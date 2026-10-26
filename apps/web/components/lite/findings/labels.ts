export const TYPE_LABEL: Record<string, string> = {
  bottleneck_indication: "Bottleneck", high_rework: "Rework", rule_non_compliance: "Aturan", bpmn_deviation: "Deviasi BPMN", aging_backlog: "Backlog", worsening_trend: "Tren",
};

export const SEV_TONE = { tinggi: "error", sedang: "warning", rendah: "neutral" } as const;
