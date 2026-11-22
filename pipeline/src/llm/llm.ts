// Structured-output LLM calls. The pipeline only talks to the `Llm` interface, so tests run with a
// deterministic fake and production runs on Anthropic (Messages API) or OpenAI (Responses API).
import Anthropic from '@anthropic-ai/sdk';
import type { CostLedger, Stage } from '../ledger.ts';
import { anthropicEstimate, anthropicUsd, openaiTextEstimate, openaiTextUsd } from '../pricing.ts';
import { HttpError, type Limiter, withRetry } from '../util/limiter.ts';

/** Provider-neutral request content. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'pdf'; data: string; title?: string } // base64
  | { type: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }; // base64

export interface LlmRequest {
  stage: Stage;
  purpose: string;
  kiez?: string | null;
  restaurantId?: string | null;
  model: string;
  /** Stable instructions; cached across calls. */
  system: string;
  content: ContentBlock[];
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  /** Token estimate for the budget guard (input, output). */
  estimate: { inputTokens: number; outputTokens: number };
}

export interface LlmResult<T> { data: T; model: string; usd: number }

export interface Llm {
  readonly provider: 'anthropic' | 'openai' | 'fake';
  json<T>(req: LlmRequest): Promise<LlmResult<T>>;
}

export class LlmError extends Error {}

function toAnthropic(blocks: ContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  return blocks.map((b): Anthropic.Beta.BetaContentBlockParam => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'pdf') return { type: 'document', ...(b.title ? { title: b.title } : {}), source: { type: 'base64', media_type: 'application/pdf', data: b.data } };
    return { type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.data } };
  });
}

export class AnthropicLlm implements Llm {
  readonly provider = 'anthropic' as const;
  private readonly client: Anthropic;
  private readonly ledger: CostLedger;
  private readonly limiter: Limiter;

  constructor(apiKey: string, ledger: CostLedger, limiter: Limiter) {
    this.ledger = ledger;
    this.limiter = limiter;
    this.client = new Anthropic({ apiKey, maxRetries: 4, timeout: 15 * 60 * 1000 });
  }

  async json<T>(req: LlmRequest): Promise<LlmResult<T>> {
    const reservation = this.ledger.reserve(anthropicEstimate(req.model, req.estimate.inputTokens, req.estimate.outputTokens));
    try {
      const msg = await this.limiter.run(() => {
        const params: Anthropic.Beta.MessageCreateParamsStreaming | Anthropic.Beta.MessageCreateParamsNonStreaming = {
          model: req.model,
          max_tokens: req.maxTokens ?? 32000,
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: toAnthropic(req.content) }],
          output_config: { effort: req.effort ?? 'medium', format: { type: 'json_schema', schema: req.schema } },
        };
        // Server-side refusal fallback (Opus/Sonnet 5.x); Haiku has none.
        if (!req.model.includes('haiku')) {
          Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
        }
        return this.client.beta.messages.stream(params).finalMessage();
      });
      const usd = anthropicUsd(msg.model, msg.usage);
      await this.ledger.record({
        stage: req.stage, provider: 'anthropic', model: msg.model, usd, kiez: req.kiez ?? null, restaurantId: req.restaurantId ?? null,
        inputTokens: msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0),
        outputTokens: msg.usage.output_tokens, purpose: req.purpose,
      });
      if (msg.stop_reason === 'refusal') throw new LlmError(`${req.purpose}: model refused`);
      if (msg.stop_reason === 'max_tokens') throw new LlmError(`${req.purpose}: output truncated at max_tokens`);
      const text = msg.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') throw new LlmError(`${req.purpose}: no text block in response`);
      return { data: JSON.parse(text.text) as T, model: msg.model, usd };
    } finally {
      reservation.release();
    }
  }
}

interface OpenAiResponse {
  status: 'completed' | 'incomplete' | 'failed' | string;
  model: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } };
}

/** OpenAI Responses API with strict JSON-schema output (plain fetch, no SDK dependency). */
export class OpenAiLlm implements Llm {
  readonly provider = 'openai' as const;
  private readonly apiKey: string;
  private readonly ledger: CostLedger;
  private readonly limiter: Limiter;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, ledger: CostLedger, limiter: Limiter, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.ledger = ledger;
    this.limiter = limiter;
    this.fetchImpl = fetchImpl;
  }

  static content(blocks: ContentBlock[]): Record<string, unknown>[] {
    return blocks.map((b, i) => {
      if (b.type === 'text') return { type: 'input_text', text: b.text };
      if (b.type === 'pdf') return { type: 'input_file', filename: `menu-${i}.pdf`, file_data: `data:application/pdf;base64,${b.data}` };
      return { type: 'input_image', image_url: `data:${b.mediaType};base64,${b.data}` };
    });
  }

  async json<T>(req: LlmRequest): Promise<LlmResult<T>> {
    const reservation = this.ledger.reserve(openaiTextEstimate(req.model, req.estimate.inputTokens, req.estimate.outputTokens));
    try {
      const body = {
        model: req.model,
        instructions: req.system,
        input: [{ role: 'user', content: OpenAiLlm.content(req.content) }],
        text: { format: { type: 'json_schema', name: 'result', strict: true, schema: req.schema } },
        reasoning: { effort: req.effort ?? 'medium' },
        max_output_tokens: req.maxTokens ?? 32000,
        store: false,
      };
      const res = await this.limiter.run(() => withRetry(async () => {
        const r = await this.fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15 * 60 * 1000),
        });
        if (!r.ok) throw new HttpError(r.status, `OpenAI responses ${r.status}: ${(await r.text()).slice(0, 400)}`);
        return (await r.json()) as OpenAiResponse;
      }));
      const u = res.usage ?? { input_tokens: 0, output_tokens: 0 };
      const usd = openaiTextUsd(res.model, u.input_tokens, u.input_tokens_details?.cached_tokens ?? 0, u.output_tokens);
      await this.ledger.record({ stage: req.stage, provider: 'openai', model: res.model, usd, kiez: req.kiez ?? null, restaurantId: req.restaurantId ?? null, inputTokens: u.input_tokens, outputTokens: u.output_tokens, purpose: req.purpose });
      const parts = (res.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
      const refusal = parts.find((p) => p.type === 'refusal');
      if (refusal) throw new LlmError(`${req.purpose}: model refused (${refusal.refusal ?? ''})`);
      if (res.status !== 'completed') throw new LlmError(`${req.purpose}: response ${res.status} (${res.incomplete_details?.reason ?? 'unknown'})`);
      const text = parts.filter((p) => p.type === 'output_text').map((p) => p.text ?? '').join('');
      if (!text) throw new LlmError(`${req.purpose}: no output text`);
      return { data: JSON.parse(text) as T, model: res.model, usd };
    } finally {
      reservation.release();
    }
  }
}

/** Deterministic stand-in for tests and dry runs. */
export class FakeLlm implements Llm {
  readonly provider = 'fake' as const;
  readonly calls: LlmRequest[] = [];
  private readonly handler: (req: LlmRequest) => unknown;
  private readonly ledger: CostLedger | undefined;

  constructor(handler: (req: LlmRequest) => unknown, ledger?: CostLedger) {
    this.handler = handler;
    this.ledger = ledger;
  }

  async json<T>(req: LlmRequest): Promise<LlmResult<T>> {
    this.calls.push(req);
    const data = this.handler(req) as T;
    if (this.ledger) await this.ledger.record({ stage: req.stage, provider: 'anthropic', model: `fake:${req.model}`, usd: 0, kiez: req.kiez ?? null, restaurantId: req.restaurantId ?? null, purpose: req.purpose });
    return { data, model: `fake:${req.model}`, usd: 0 };
  }
}
