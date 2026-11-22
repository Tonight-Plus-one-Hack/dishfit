// AI dish images ("KI-Bild") via OpenAI gpt-image-2.6. Real restaurant photos are never copied; the
// app shows Google's photos only live through the Places UI Kit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CostLedger } from '../ledger.ts';
import { openaiImageUsd } from '../pricing.ts';
import { HttpError, type Limiter, withRetry } from '../util/limiter.ts';

export interface ImageRequest { key: string; prompt: string; kiez?: string | null; restaurantId?: string | null }
export interface ImageResult { ref: string; model: string; usd: number }

export interface ImageGenerator {
  readonly model: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}

// Reservation per image for the budget guard (1024x1024; measured: low 0.025 USD, medium 0.044 USD).
const RESERVE_USD = { low: 0.03, medium: 0.05, high: 0.2 } as const;

export class OpenAiImages implements ImageGenerator {
  readonly model: string;
  private readonly apiKey: string;
  private readonly outDir: string;
  private readonly ledger: CostLedger;
  private readonly limiter: Limiter;
  private readonly quality: 'low' | 'medium' | 'high';

  constructor(apiKey: string, outDir: string, ledger: CostLedger, limiter: Limiter, model = 'gpt-image-2.6-flare', quality: 'low' | 'medium' | 'high' = 'low') {
    this.apiKey = apiKey;
    this.outDir = outDir;
    this.ledger = ledger;
    this.limiter = limiter;
    this.model = model;
    this.quality = quality;
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const reservation = this.ledger.reserve(RESERVE_USD[this.quality]);
    try {
      const json = await this.limiter.run(() => withRetry(async () => {
        const res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: req.prompt, size: '1024x1024', quality: this.quality, output_format: 'webp', output_compression: 60, n: 1 }),
        });
        if (!res.ok) throw new HttpError(res.status, `OpenAI images ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as {
          data: { b64_json: string }[];
          usage?: { input_tokens_details?: { text_tokens?: number; image_tokens?: number }; output_tokens?: number; input_tokens?: number };
        };
      }, { retries: 2 }));
      const u = json.usage ?? {};
      const usd = openaiImageUsd({
        textInputTokens: u.input_tokens_details?.text_tokens ?? u.input_tokens ?? 0,
        imageInputTokens: u.input_tokens_details?.image_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
      });
      await this.ledger.record({ stage: 'image', provider: 'openai', model: this.model, usd, kiez: req.kiez ?? null, restaurantId: req.restaurantId ?? null, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, purpose: `ki-bild:${req.key}` });
      const b64 = json.data[0]?.b64_json;
      if (!b64) throw new Error('OpenAI images: no image in response');
      mkdirSync(join(this.outDir, 'ai'), { recursive: true });
      const ref = `ai/${req.key}.webp`;
      writeFileSync(join(this.outDir, ref), Buffer.from(b64, 'base64'));
      return { ref, model: this.model, usd };
    } finally {
      reservation.release();
    }
  }
}

export class FakeImages implements ImageGenerator {
  readonly model = 'fake-image';
  readonly calls: ImageRequest[] = [];
  async generate(req: ImageRequest): Promise<ImageResult> {
    this.calls.push(req);
    return { ref: `ai/${req.key}.webp`, model: this.model, usd: 0 };
  }
}
