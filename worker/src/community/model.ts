/**
 * The review agent's two model calls, provider-neutral like the pipeline's `Llm`
 * (pipeline/src/llm/llm.ts): structured JSON output from Anthropic's Messages API or OpenAI's
 * Responses API over plain fetch (no SDK in the Worker), or a deterministic mock for local dev
 * and tests. Every real call reports its token usage so the caller can write the ledger.
 */
import type { Ingredient } from "../../../pipeline/src/types.ts";

export type ModelProvider = "anthropic" | "openai" | "mock";

export type ModelRequest = {
  purpose: "community_menu" | "community_recipes";
  system: string;
  text: string;
  image?: { mediaType: string; base64: string };
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type ModelUsage = { model: string; status: number; inputTokens: number; outputTokens: number; cacheReadTokens: number };

export type ModelResult<T> = { data: T; usage: ModelUsage | null };

export interface ReviewModel {
  readonly provider: ModelProvider;
  json<T>(req: ModelRequest): Promise<ModelResult<T>>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly usage: ModelUsage | null,
  ) {
    super(message);
  }
}

export const MODELS = { anthropic: "claude-sonnet-5-5", openai: "gpt-6.2-sol" } as const;

const TIMEOUT_MS = 90_000;

type AnthropicResponse = {
  model: string;
  stop_reason: string;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

export class AnthropicModel implements ReviewModel {
  readonly provider = "anthropic" as const;
  constructor(
    private readonly apiKey: string,
    // A bare `fetch` reference loses its binding in Workers ("Illegal invocation"); call it through a wrapper.
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async json<T>(req: ModelRequest): Promise<ModelResult<T>> {
    const content: unknown[] = [];
    if (req.image) content.push({ type: "image", source: { type: "base64", media_type: req.image.mediaType, data: req.image.base64 } });
    content.push({ type: "text", text: req.text });
    const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELS.anthropic,
        max_tokens: req.maxTokens,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { effort: "low", format: { type: "json_schema", schema: req.schema } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new ModelError(`anthropic ${res.status}`, { model: MODELS.anthropic, status: res.status, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    const msg = (await res.json()) as AnthropicResponse;
    const usage: ModelUsage = {
      model: msg.model,
      status: res.status,
      inputTokens: msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0),
      outputTokens: msg.usage.output_tokens,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
    };
    const text = msg.content.find((b) => b.type === "text")?.text;
    if (msg.stop_reason !== "end_turn" || !text) throw new ModelError(`anthropic stop ${msg.stop_reason}`, usage);
    return { data: JSON.parse(text) as T, usage };
  }
}

type OpenAiResponse = {
  status: string;
  model: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } };
};

export class OpenAiModel implements ReviewModel {
  readonly provider = "openai" as const;
  constructor(
    private readonly apiKey: string,
    // A bare `fetch` reference loses its binding in Workers ("Illegal invocation"); call it through a wrapper.
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async json<T>(req: ModelRequest): Promise<ModelResult<T>> {
    const content: unknown[] = [{ type: "input_text", text: req.text }];
    if (req.image) content.push({ type: "input_image", image_url: `data:${req.image.mediaType};base64,${req.image.base64}` });
    const res = await this.fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELS.openai,
        instructions: req.system,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "result", strict: true, schema: req.schema } },
        reasoning: { effort: "low" },
        max_output_tokens: req.maxTokens,
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new ModelError(`openai ${res.status}`, { model: MODELS.openai, status: res.status, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    const body = (await res.json()) as OpenAiResponse;
    const cached = body.usage?.input_tokens_details?.cached_tokens ?? 0;
    const usage: ModelUsage = {
      model: body.model,
      status: res.status,
      inputTokens: (body.usage?.input_tokens ?? 0) - cached,
      outputTokens: body.usage?.output_tokens ?? 0,
      cacheReadTokens: cached,
    };
    const text = (body.output ?? [])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((p) => p.type === "output_text")
      .map((p) => p.text ?? "")
      .join("");
    if (body.status !== "completed" || !text) throw new ModelError(`openai status ${body.status}`, usage);
    return { data: JSON.parse(text) as T, usage };
  }
}

const mockDish = (n: string, d: string, section: string, category: string, price: number) => ({
    name: n,
    description: d,
    section,
    description_de: d,
    section_de: section,
    category,
    price_eur: price,
    printed_kcal: null,
    printed_protein_g: null,
    printed_carbs_g: null,
    printed_fat_g: null,
  });

/**
 * Local dev and tests without keys: reads every photo as the same small, plausible menu of the
 * restaurant named in the request, so the whole flow (rules, nutrition, publish) runs offline.
 */
export class MockModel implements ReviewModel {
  readonly provider = "mock" as const;

  async json<T>(req: ModelRequest): Promise<ModelResult<T>> {
    if (req.purpose === "community_menu") {
      const name = /Restaurant: (.+)/.exec(req.text)?.[1]?.trim() ?? null;
      return {
        data: {
          is_menu: true,
          reason: "Mock: Speisekarte erkannt",
          menu_language: "de",
          notes: "",
          restaurant_name_on_menu: name,
          cuisine: null,
          faces: false,
          inappropriate: false,
          legibility: "high",
          dishes: [
            mockDish("Hähnchen-Bowl", "Reis, gegrilltes Hähnchen, Edamame, Gurke, Sesam-Dressing", "Bowls", "bowl", 11.9),
            mockDish("Falafel-Teller", "Falafel, Hummus, Salat, Pita", "Hauptgerichte", "main", 9.5),
            mockDish("Rote Linsensuppe", "Linsen, Karotte, Zitrone", "Suppen", "soup", 6.5),
            mockDish("Lachs-Poke", "Sushi-Reis, Lachs, Avocado, Mango, Sojasauce", "Bowls", "bowl", 13.9),
          ],
        } as T,
        usage: null,
      };
    }
    const recipes: Ingredient[][] = [
      [
        { food: "rice_white_cooked", grams: 200 },
        { food: "chicken_breast_cooked", grams: 110 },
        { food: "edamame", grams: 50 },
        { food: "cucumber", grams: 50 },
        { food: "sesame_oil", grams: 8 },
        { food: "soy_sauce", grams: 15 },
      ],
      [
        { food: "falafel", grams: 150 },
        { food: "hummus", grams: 80 },
        { food: "lettuce_romaine", grams: 60 },
        { food: "tomato", grams: 50 },
        { food: "bread_pita", grams: 60 },
      ],
      [
        { food: "lentils_cooked", grams: 180 },
        { food: "carrot", grams: 60 },
        { food: "onion", grams: 30 },
        { food: "olive_oil", grams: 8 },
        { food: "broth_soup", grams: 150 },
      ],
      [
        { food: "rice_sushi_cooked", grams: 180 },
        { food: "salmon_raw", grams: 100 },
        { food: "avocado", grams: 50 },
        { food: "mango", grams: 40 },
        { food: "soy_sauce", grams: 15 },
      ],
    ];
    const count = (req.text.match(/^\d+\. /gm) ?? []).length;
    return {
      data: {
        dishes: Array.from({ length: count }, (_, index) => ({
          index,
          ingredients: (recipes[index % recipes.length] ?? []).map((i) => ({ ...i, note: "" })),
          recipe_confidence: "medium",
          portion_note: "",
        })),
      } as T,
      usage: null,
    };
  }
}
