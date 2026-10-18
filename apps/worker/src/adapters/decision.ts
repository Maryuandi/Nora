import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { ChoiceResult, DEFAULT_QUESTION_SPECS, NoulResult, ScoreResult, type DecisionModelAdapter, type DecisionRequest } from "@nora/contracts";

/** Option definitions sent as Jev choice criteria; an option without one is sent as null. */
const OPTION_DEFINITIONS: Record<string, string> = Object.fromEntries(DEFAULT_QUESTION_SPECS.flatMap((s) => s.options.map((o) => [o.value, o.definition])));

/**
 * Jev over TypeSafe's System One API (POST {JEV_API_URL}/v1/systemone, https://docs.typesafe.ai/api).
 * Each call asks one question under the id "q"; the typed answer is mapped to the adapter results callers depend on.
 */
class JevAdapter implements DecisionModelAdapter {
  readonly name = "jev";
  constructor(private url: string, private key: string, private model: string) {}

  private async call(req: DecisionRequest, question: Record<string, unknown>) {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.url.replace(/\/$/, "")}/v1/systemone`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
        body: JSON.stringify({ state: req.context, model: this.model, questions: { q: { ...question, instructions: req.question } } }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw ApplicationFailure.retryable(`Jev tidak dapat dihubungi: ${(err as Error).message}`, "ProviderUnavailable");
    }
    if (res.status >= 500 || res.status === 429) throw ApplicationFailure.retryable(`Jev HTTP ${res.status}`, "ProviderUnavailable");
    if (!res.ok) throw ApplicationFailure.nonRetryable(`Jev menolak permintaan (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`, "ProviderRejected");
    const raw = (await res.json()) as Record<string, any>;
    const answer = raw.answers?.q;
    if (!answer) throw ApplicationFailure.nonRetryable("Respons Jev tidak memuat jawaban", "ProviderInvalidResponse");
    // The API documents no request id; fall back to a stable id derived from the idempotency key.
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? `jev-${createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 16)}`;
    const meta = { requestId, model: this.model, modelVersion: String(raw.model ?? "unknown"), latencyMs: Date.now() - started, cost: null };
    return { raw, answer, meta };
  }

  async noul(req: DecisionRequest) {
    const { raw, answer, meta } = await this.call(req, { type: "noul" });
    return { result: NoulResult.parse({ ...meta, probabilityYes: answer.noul }), raw };
  }
  async choice(req: DecisionRequest & { options: string[] }) {
    const criteria = Object.fromEntries(req.options.map((o) => [o, OPTION_DEFINITIONS[o] ?? null]));
    const { raw, answer, meta } = await this.call(req, { type: "choice", criteria });
    const probs = (answer.probabilities ?? {}) as Record<string, number>;
    return { result: ChoiceResult.parse({ ...meta, distribution: req.options.map((o) => ({ option: o, probability: probs[o] ?? 0 })) }), raw };
  }
  async score(req: DecisionRequest & { scale: number[] }) {
    if (req.scale.length < 2 || req.scale.length > 10) throw ApplicationFailure.nonRetryable(`Jev score butuh 2–10 level; rubrik memiliki ${req.scale.length}`, "UnsupportedScale");
    // Jev levels are positional; send each scale value with its rubric label and definition when the criterion carries them.
    const rows = ((req.context.criterion as { scale?: { value: number; label?: string; definition?: string }[] } | undefined)?.scale ?? []);
    const criteria = req.scale.map((v) => {
      const r = rows.find((x) => x.value === v);
      return r ? `${v} — ${r.label ?? ""}${r.definition ? `: ${r.definition}` : ""}` : String(v);
    });
    const { raw, answer, meta } = await this.call(req, { type: "score", criteria });
    const probs = (answer.probabilities ?? {}) as Record<string, number>;
    const distribution = req.scale.map((v, i) => ({ value: v, probability: probs[String(i)] ?? 0 }));
    const top = distribution.reduce((best, d) => (d.probability > best.probability ? d : best), distribution[0]!);
    return { result: ScoreResult.parse({ ...meta, score: top.value, distribution }), raw };
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
  const url = process.env.JEV_API_URL ?? "https://api.typesafe.ai", key = process.env.JEV_API_KEY, model = process.env.JEV_MODEL ?? "jev-latest";
  if (!key) throw ApplicationFailure.nonRetryable("Penyedia Jev belum dikonfigurasi (JEV_API_KEY). Penilaian tidak dialihkan ke LLM.", "JevNotConfigured");
  return new JevAdapter(url, key, model);
}
