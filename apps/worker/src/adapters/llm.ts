import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApplicationFailure } from "@temporalio/activity";
import { z } from "zod";
import { formatMetric, LlmInterpretation, type CheckContext, type InterpretationTarget } from "@nora/contracts";

export interface LlmRequest {
  system: string;
  prompt: string;
  idempotencyKey: string;
  /** the structured data the prompt was built from; only the fixture reads it */
  data: CheckContext & { audience: string; fixtureDirective?: string; attempt: number };
}
export interface LlmMeta {
  provider: string;
  model: string;
  modelVersion: string;
  requestId: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  finishReason: string | null;
  parameters: Record<string, unknown>;
}
export interface LlmResponse { output: unknown; text: string; meta: LlmMeta; raw: unknown }

/** Provider-neutral: one structured generation. Callers validate the output themselves (the checker). */
export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;
  generateStructured(req: LlmRequest): Promise<LlmResponse>;
}

/** USD per million tokens; override with LLM_PRICE_INPUT / LLM_PRICE_OUTPUT for other models. */
const PRICES: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20] };

class AnthropicAdapter implements LlmAdapter {
  readonly provider = "anthropic";
  private client: Anthropic;
  constructor(readonly model: string, apiKey: string, private effort: "low" | "medium" | "high") {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async generateStructured(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const parameters = { max_tokens: 16000, effort: this.effort, fallbacks: "default" };
    let msg: Anthropic.Beta.BetaMessage;
    try {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 16000,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
        output_config: { effort: this.effort, format: betaZodOutputFormat(LlmInterpretation) },
        // A policy decline re-runs on Anthropic's recommended fallback model inside the same call; the served model is recorded.
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01"],
      });
      msg = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError && err.status && err.status < 500 && err.status !== 429 && err.status !== 408) {
        throw ApplicationFailure.nonRetryable(`Penyedia LLM menolak permintaan (HTTP ${err.status}): ${err.message}`, "ProviderRejected");
      }
      throw ApplicationFailure.retryable(`Penyedia LLM tidak tersedia: ${(err as Error).message}`, "ProviderUnavailable");
    }
    if (msg.stop_reason === "refusal") throw ApplicationFailure.nonRetryable("Model menolak menyusun interpretasi untuk bukti ini", "ProviderRefused");
    const text = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    let output: unknown = null;
    try {
      output = JSON.parse(text);
    } catch {
      output = { invalid_json: text.slice(0, 2000) };
    }
    const price = PRICES[msg.model] ?? (process.env.LLM_PRICE_INPUT ? [Number(process.env.LLM_PRICE_INPUT), Number(process.env.LLM_PRICE_OUTPUT ?? 0)] as [number, number] : null);
    const inTok = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    return {
      output, text, raw: msg,
      meta: {
        provider: this.provider, model: this.model, modelVersion: msg.model, requestId: msg.id, latencyMs: Date.now() - started,
        inputTokens: inTok, outputTokens: msg.usage.output_tokens, finishReason: msg.stop_reason,
        cost: price ? (inTok * price[0] + msg.usage.output_tokens * price[1]) / 1_000_000 : null, parameters,
      },
    };
  }
}

/**
 * DeepSeek over its OpenAI-compatible chat API (LLM_MODE=deepseek). JSON mode does not enforce a schema,
 * so the schema goes into the system prompt; the checker still validates every draft.
 */
class DeepSeekAdapter implements LlmAdapter {
  readonly provider = "deepseek";
  constructor(readonly model: string, private apiKey: string, private baseUrl: string) {}

  async generateStructured(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const parameters = { max_tokens: 8000, response_format: "json_object" };
    const schema = JSON.stringify(z.toJSONSchema(LlmInterpretation));
    // DeepSeek tends to copy digits from the evidence (versions, hashes, codes); the checker rejects any bare digit.
    const digits = [
      "ATURAN ANGKA (WAJIB, diperiksa otomatis):",
      "- Jangan menulis digit 0-9 sama sekali di text_template, assumptions, uncertainties, dan follow_up_questions.",
      "- Nilai terukur hanya boleh muncul sebagai placeholder metrik persis seperti {{M1}}, dan ref itu wajib dicantumkan di metric_placeholders.",
      "- Sebut dataset, konteks, versi, hash, kode fitur, atau tanggal tanpa angka: tulis \"dataset terbit\", \"paket konteks aktif\", bukan \"v1\", \"F03\", atau \"sha256\".",
      "- Jika sebuah kalimat butuh angka yang tidak ada placeholder-nya, hilangkan angkanya atau hilangkan kalimatnya.",
      "- metric_placeholders sebuah klaim berisi tepat ref yang muncul sebagai {{...}} di text_template klaim itu: jangan mencantumkan ref yang tidak ditulis di teks; isi [] bila tidak ada.",
      "- Pakai type \"measured_fact\" hanya untuk kalimat yang memuat placeholder metrik. Kalimat tentang konteks, mapping, ketersediaan analisis, atau keterbatasan data memakai type \"interpretation\".",
    ].join("\n");
    const system = `${req.system}\n\n${digits}\n\nKeluarkan satu objek JSON valid saja, tanpa teks lain, yang sesuai JSON Schema berikut:\n${schema}`;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8000,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: req.prompt }],
        }),
        signal: AbortSignal.timeout(300_000),
      });
    } catch (err) {
      throw ApplicationFailure.retryable(`Penyedia LLM tidak tersedia: ${(err as Error).message}`, "ProviderUnavailable");
    }
    if (res.status >= 500 || res.status === 429 || res.status === 408) throw ApplicationFailure.retryable(`Penyedia LLM tidak tersedia (HTTP ${res.status})`, "ProviderUnavailable");
    if (!res.ok) throw ApplicationFailure.nonRetryable(`Penyedia LLM menolak permintaan (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`, "ProviderRejected");
    const raw = (await res.json()) as Record<string, any>;
    const choice = raw.choices?.[0];
    const text = String(choice?.message?.content ?? "");
    let output: unknown = null;
    try {
      output = JSON.parse(text);
    } catch {
      output = { invalid_json: text.slice(0, 2000) };
    }
    const inTok = raw.usage?.prompt_tokens ?? null, outTok = raw.usage?.completion_tokens ?? null;
    const price = process.env.LLM_PRICE_INPUT ? [Number(process.env.LLM_PRICE_INPUT), Number(process.env.LLM_PRICE_OUTPUT ?? 0)] : null;
    return {
      output, text, raw,
      meta: {
        provider: this.provider, model: this.model, modelVersion: String(raw.model ?? this.model), requestId: String(raw.id ?? ""), latencyMs: Date.now() - started,
        inputTokens: inTok, outputTokens: outTok, finishReason: choice?.finish_reason ?? null,
        cost: price && inTok != null && outTok != null ? (inTok * price[0]! + outTok * price[1]!) / 1_000_000 : null, parameters,
      },
    };
  }
}

/**
 * Deterministic stand-in for automated tests and explicit demo mode only (LLM_MODE=fixture). It writes a draft
 * from the structured data so the checker, renderer and repair loop can be exercised. Never a silent fallback.
 * LLM_FIXTURE_FAULT=first_attempt makes attempt 1 type a raw number; a template example containing
 * "fixture:invalid" makes every attempt invalid.
 */
class FixtureAdapter implements LlmAdapter {
  readonly provider = "fixture";
  readonly model = "fixture-llm";

  async generateStructured(req: LlmRequest): Promise<LlmResponse> {
    const d = req.data;
    const firstFact = d.metrics[0];
    const anchor = d.items[0]!.ref;
    const claim = (text: string, type: LlmInterpretation["sections"][number]["claims"][number]["type"], citations: string[], ph: string[] = [], candidate: string | null = null) =>
      ({ text_template: text, type, citations, metric_placeholders: ph, candidate_id: candidate });
    const hyp = d.items.find((i) => i.itemType === "hypothesis");
    const broken = d.fixtureDirective === "invalid" || (process.env.LLM_FIXTURE_FAULT === "first_attempt" && d.attempt === 1);
    const facts = d.metrics.slice(0, 3).map((m) => claim(`Nilai ${m.metric} tercatat {{${m.ref}}}.`, "measured_fact", [m.evidenceRef], [m.ref]));
    if (broken && firstFact) facts[0] = claim(`Nilai ${firstFact.metric} tercatat ${formatMetric(firstFact)}.`, "measured_fact", [firstFact.evidenceRef]);
    const who = d.audience === "process_owner" ? "Bagi pemilik proses, " : "";
    const sections: LlmInterpretation["sections"] = [
      { key: "summary", claims: [claim(`${who}bukti menunjukkan pola yang perlu ditinjau pada ${label(d.target)} ini.`, "interpretation", [anchor])] },
      { key: "measured_facts", claims: facts.length ? facts : [claim("Tidak ada nilai terukur pada paket bukti.", "interpretation", [anchor])] },
      { key: "evidence_basis", claims: [claim("Penjelasan ini hanya memakai item yang termasuk dalam paket bukti.", "interpretation", d.items.slice(0, 2).map((i) => i.ref))] },
      { key: "interpretation", claims: [claim("Pola tersebut tampak konsisten dengan ukuran yang tercatat, namun belum menjelaskan alasannya.", "interpretation", [anchor])] },
      { key: "open_hypotheses", claims: hyp ? [claim("Salah satu penjelasan yang mungkin adalah hipotesis katalog yang belum terbukti.", "hypothesis", [hyp.ref])] : [] },
      { key: "follow_up", claims: [claim("Pola ini perlu dikonfirmasi bersama pemilik proses.", "interpretation", [anchor])] },
    ];
    if (d.target === "candidate_comparison") {
      sections.push({
        key: "validated_recommendations",
        claims: d.validatedCandidateIds.map((id) => {
          const item = d.items.find((i) => i.itemType === "comparison_candidate" && i.itemId === id);
          return claim(`Kandidat "${String(item?.content.action ?? id)}" berstatus tervalidasi.`, "validated_recommendation", [item?.ref ?? anchor], [], id);
        }),
      });
    }
    const uncertainties = [...d.requiredCaveats.map((c) => `Perlu diperhatikan: ${c.keywords[0]}.`), "Penjelasan tidak membuktikan sebab dari pola yang terlihat."];
    if (d.target === "candidate_comparison" && !d.validatedCandidateIds.length) uncertainties.push("Belum ada kandidat tervalidasi untuk direkomendasikan.");
    const output: LlmInterpretation = { sections, assumptions: ["Data peristiwa mencerminkan urutan kerja yang sebenarnya."], uncertainties, follow_up_questions: ["Apakah ada perubahan kebijakan pada periode data ini?"] };
    const text = JSON.stringify(output);
    return {
      output, text, raw: { fixture: true, output },
      meta: {
        provider: this.provider, model: this.model, modelVersion: "1", requestId: `fixture-${createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 16)}`,
        latencyMs: 0, inputTokens: Math.ceil((req.system.length + req.prompt.length) / 4), outputTokens: Math.ceil(text.length / 4), cost: 0, finishReason: "end_turn", parameters: { fixture: true },
      },
    };
  }
}

const label = (t: InterpretationTarget) => (t === "finding" ? "temuan" : t === "assessment" ? "penilaian" : "perbandingan kandidat");

/** Chosen by server configuration only. No key, no model call: the request fails instead of producing a local draft. */
export function llmAdapter(): LlmAdapter {
  const mode = process.env.LLM_MODE ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "unconfigured");
  if (mode === "fixture") return new FixtureAdapter();
  if (mode === "deepseek") {
    const dsKey = process.env.DEEPSEEK_API_KEY;
    if (!dsKey) throw ApplicationFailure.nonRetryable("Penyedia LLM belum dikonfigurasi (DEEPSEEK_API_KEY). Tidak ada draft lokal yang dibuat.", "LlmNotConfigured");
    return new DeepSeekAdapter(process.env.LLM_MODEL ?? "deepseek-chat", dsKey, process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com");
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (mode !== "anthropic" || !key) throw ApplicationFailure.nonRetryable("Penyedia LLM belum dikonfigurasi (LLM_MODE dan ANTHROPIC_API_KEY). Tidak ada draft lokal yang dibuat.", "LlmNotConfigured");
  const effort = (process.env.LLM_EFFORT ?? "medium") as "low" | "medium" | "high";
  return new AnthropicAdapter(process.env.LLM_MODEL ?? "claude-opus-5-5", key, effort);
}

/** Model identity that goes into the interpretation key; known before any call. */
export function llmModelLabel(): string {
  const mode = process.env.LLM_MODE ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "unconfigured");
  if (mode === "fixture") return "fixture-llm@1";
  return process.env.LLM_MODEL ?? (mode === "deepseek" ? "deepseek-chat" : "claude-opus-5-5");
}
