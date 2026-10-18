import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { ChoiceResult, NoulResult, ScoreResult, type DecisionModelAdapter, type DecisionRequest } from "@nora/contracts";

/**
 * Jev over HTTP. The provider contract is configured server-side; the request below is the one this prototype
 * expects (POST {JEV_API_URL}/v1/decisions). Adjust here only — callers depend on the typed results.
 */
class JevAdapter implements DecisionModelAdapter {
  readonly name = "jev";
  constructor(private url: string, private key: string, private model: string) {}

  private async call(type: "noul" | "choice" | "score", req: DecisionRequest, extra: Record<string, unknown>) {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.url.replace(/\/$/, "")}/v1/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.key}`, "idempotency-key": req.idempotencyKey },
        body: JSON.stringify({ type, model: this.model, question: req.question, context: req.context, ...extra }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw ApplicationFailure.retryable(`Jev tidak dapat dihubungi: ${(err as Error).message}`, "ProviderUnavailable");
    }
    if (res.status >= 500 || res.status === 429) throw ApplicationFailure.retryable(`Jev HTTP ${res.status}`, "ProviderUnavailable");
    if (!res.ok) throw ApplicationFailure.nonRetryable(`Jev menolak permintaan (HTTP ${res.status})`, "ProviderRejected");
    const raw = (await res.json()) as Record<string, any>;
    const meta = { requestId: String(raw.id ?? raw.request_id ?? ""), model: String(raw.model ?? this.model), modelVersion: String(raw.model_version ?? raw.version ?? "unknown"), latencyMs: Date.now() - started, cost: typeof raw.cost === "number" ? raw.cost : null };
    return { raw, meta };
  }

  async noul(req: DecisionRequest) {
    const { raw, meta } = await this.call("noul", req, {});
    return { result: NoulResult.parse({ ...meta, probabilityYes: raw.probability_yes ?? raw.probability }), raw };
  }
  async choice(req: DecisionRequest & { options: string[] }) {
    const { raw, meta } = await this.call("choice", req, { options: req.options });
    return { result: ChoiceResult.parse({ ...meta, distribution: (raw.distribution ?? []).map((d: any) => ({ option: d.option ?? d.value, probability: d.probability })) }), raw };
  }
  async score(req: DecisionRequest & { scale: number[] }) {
    const { raw, meta } = await this.call("score", req, { scale: req.scale });
    return { result: ScoreResult.parse({ ...meta, score: raw.score, distribution: (raw.distribution ?? []).map((d: any) => ({ value: d.value, probability: d.probability })) }), raw };
  }
}

/**
 * Deterministic stand-in for automated tests and explicitly enabled demos only (JEV_MODE=fixture).
 * It scores structural overlap between candidate and finding; it is never used as a silent fallback.
 */
class FixtureAdapter implements DecisionModelAdapter {
  readonly name = "fixture";
  private meta(req: DecisionRequest) {
    return { requestId: `fixture-${createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 16)}`, model: "fixture-decision", modelVersion: "1", latencyMs: 0, cost: 0 };
  }
  private points(ctx: Record<string, any>): number {
    const c = ctx.candidate ?? {};
    const f = ctx.finding ?? {};
    let p = 0;
    if ((c.findingTypes ?? []).includes(f.findingType)) p += 1;
    const acts: string[] = f.activities ?? [];
    if ((c.activities ?? []).some((a: string) => acts.includes(a))) p += 2;
    if ((c.addressedHypotheses ?? []).length) p += 1;
    return p;
  }
  async noul(req: DecisionRequest) {
    const enough = (req.context.evidence as unknown[] | undefined)?.length ? 0.85 : 0.3;
    return { result: NoulResult.parse({ ...this.meta(req), probabilityYes: enough }), raw: { fixture: true } };
  }
  async choice(req: DecisionRequest & { options: string[] }) {
    const p = this.points(req.context);
    const pick = p >= 3 ? ["relevant", 0.78] : p === 2 ? ["partly_relevant", 0.66] : p === 1 ? ["partly_relevant", 0.52] : ["not_relevant", 0.8];
    const rest = (1 - (pick[1] as number)) / (req.options.length - 1);
    const distribution = req.options.map((o) => ({ option: o, probability: o === pick[0] ? (pick[1] as number) : rest }));
    return { result: ChoiceResult.parse({ ...this.meta(req), distribution }), raw: { fixture: true, points: p } };
  }
  async score(req: DecisionRequest & { scale: number[] }) {
    const lo = Math.min(...req.scale), hi = Math.max(...req.scale);
    const target = lo + Math.round((Math.min(4, this.points(req.context)) / 4) * (hi - lo));
    const s = req.scale.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), req.scale[0]!);
    const rest = 0.3 / Math.max(1, req.scale.length - 1);
    const distribution = req.scale.map((v) => ({ value: v, probability: v === s ? 0.7 : rest }));
    return { result: ScoreResult.parse({ ...this.meta(req), score: s, distribution }), raw: { fixture: true } };
  }
}

export function decisionAdapter(): DecisionModelAdapter {
  const mode = process.env.JEV_MODE ?? "jev";
  if (mode === "fixture") return new FixtureAdapter();
  const url = process.env.JEV_API_URL, key = process.env.JEV_API_KEY, model = process.env.JEV_MODEL;
  if (!url || !key || !model) throw ApplicationFailure.nonRetryable("Penyedia Jev belum dikonfigurasi (JEV_API_URL, JEV_API_KEY, JEV_MODEL). Penilaian tidak dialihkan ke LLM.", "JevNotConfigured");
  return new JevAdapter(url, key, model);
}
