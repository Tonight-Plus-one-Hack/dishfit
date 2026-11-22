// List prices used for the cost ledger. Keep in sync with the providers' pricing pages.

/** USD per 1M tokens: input, output, cache write (5 min), cache read. Same table as data/key-spend/spend.py. */
export const ANTHROPIC_PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.1],
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
  'claude-fable-5-2': [8, 40, 10, 0.2],
  'claude-opus-5': [5, 25, 6.25, 0.5],
  'claude-opus-4-8': [5, 25, 6.25, 0.5],
  'claude-sonnet-5': [2, 10, 2.5, 0.2],
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function anthropicUsd(model: string, u: TokenUsage): number {
  const p = ANTHROPIC_PRICES[model] ?? ANTHROPIC_PRICES['claude-opus-5-5']!;
  const usd = (u.input_tokens * p[0] + u.output_tokens * p[1] + (u.cache_creation_input_tokens ?? 0) * p[2] + (u.cache_read_input_tokens ?? 0) * p[3]) / 1e6;
  return round6(usd);
}

/** Rough upper estimate before a call, used by the budget guard. */
export function anthropicEstimate(model: string, inputTokens: number, outputTokens: number): number {
  return anthropicUsd(model, { input_tokens: inputTokens, output_tokens: outputTokens });
}

/** OpenAI text models, USD per 1M tokens: input, cached input, output (reasoning tokens bill as output). */
export const OPENAI_TEXT_PRICES: Record<string, [number, number, number]> = {
  'gpt-6.2-astra': [8, 0.4, 40],
  'gpt-6.2-sol': [2, 0.1, 10],
  'gpt-6.1-sol': [2, 0.1, 10],
  'gpt-6.1-terra': [1, 0.05, 5],
  'gpt-6-luna': [0.1, 0.01, 0.5],
  'gpt-5.6-sol': [4, 0.4, 20],
  'gpt-5.4-mini': [0.75, 0.075, 4.5],
};

function openaiPrice(model: string): [number, number, number] {
  const key = Object.keys(OPENAI_TEXT_PRICES).filter((k) => model === k || model.startsWith(`${k}-`)).toSorted((a, b) => b.length - a.length)[0];
  return OPENAI_TEXT_PRICES[key ?? 'gpt-6.2-sol']!;
}

export function openaiTextUsd(model: string, inputTokens: number, cachedTokens: number, outputTokens: number): number {
  const p = openaiPrice(model);
  return round6(((inputTokens - cachedTokens) * p[0] + cachedTokens * p[1] + outputTokens * p[2]) / 1e6);
}

export function openaiTextEstimate(model: string, inputTokens: number, outputTokens: number): number {
  return openaiTextUsd(model, inputTokens, 0, outputTokens);
}

/** OpenAI gpt-image-2.6 (sunburst and flare share rates): USD per 1M tokens. */
export const OPENAI_IMAGE_PRICES = { textInput: 5, imageInput: 8, imageOutput: 30 };

export function openaiImageUsd(u: { textInputTokens: number; imageInputTokens: number; outputTokens: number }): number {
  return round6((u.textInputTokens * OPENAI_IMAGE_PRICES.textInput + u.imageInputTokens * OPENAI_IMAGE_PRICES.imageInput + u.outputTokens * OPENAI_IMAGE_PRICES.imageOutput) / 1e6);
}

/**
 * Google Places API (New) list prices per request, USD, first paid tier (0-100k/month).
 * Monthly free caps per SKU are noted; the ledger logs list price (conservative) with estimated=true.
 */
export const PLACES_SKUS = {
  'text-search-ids-only': { usd: 0, freePerMonth: Infinity },
  'text-search-pro': { usd: 0.032, freePerMonth: 5000 },
  'text-search-enterprise': { usd: 0.035, freePerMonth: 1000 },
  'place-details-enterprise': { usd: 0.02, freePerMonth: 1000 },
} as const;
export type PlacesSku = keyof typeof PLACES_SKUS;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
