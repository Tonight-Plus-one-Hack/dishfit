import { createExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { menuFrom, nutrientsOf, scanModel } from "../src/scans/estimate";
import { postScan, SCAN_LIMITS, scanBudgetUsd } from "../src/routes/scans";
import { ipOf } from "./fixtures";
import { jpegWithExif } from "./community-fixtures";

async function scan(kind: string, opts: { ip?: string; cookie?: string; photo?: Uint8Array; bindings?: Env } = {}) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("photo", new File([opts.photo ?? jpegWithExif()], "x.jpg", { type: "image/jpeg" }));
  const headers: Record<string, string> = { "cf-connecting-ip": opts.ip ?? ipOf("scan") };
  if (opts.cookie) headers.cookie = opts.cookie;
  const url = new URL("https://app.test/api/scans");
  const request = new Request(url, { method: "POST", body: form, headers });
  const res = opts.bindings
    ? await postScan({ request, env: opts.bindings, url, params: {}, ctx: createExecutionContext() })
    : await exports.default.fetch(request);
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}

const get = async (path: string, cookie?: string, method = "GET") => {
  const res = await exports.default.fetch(new Request(`https://app.test${path}`, { method, headers: cookie ? { cookie } : {} }));
  return { status: res.status, body: (await res.json()) as any };
};

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM scans").run();
});

const RANGES = { kcal_low: 400, kcal_high: 600, protein_low: 20, protein_high: 30, carbs_low: 40, carbs_high: 60, fat_low: 10, fat_high: 20 };
const PLATE_FIXTURE = { is_food: true, reason: "", name: "Gebratener Reis", items: ["Reis (ca. 200 g)"], confidence: "medium", note: "", ...RANGES };
const MENU_FIXTURE = {
  is_menu: true,
  reason: "",
  restaurant_name: "Bistro",
  dishes: [{ name: "Falafel", description: null, price_eur: 9.5, ...RANGES }],
};

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

/** The JSON Schema subset the scan schemas use (type, enum, required, additionalProperties, properties, items); returns the violations. */
function violations(schema: JsonSchema, value: unknown, path = "$"): string[] {
  const kinds = [schema.type].flat().filter((t): t is string => !!t);
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? "number" : typeof value;
  if (kinds.length && !kinds.includes(kind)) return [`${path}: ${kind} is not ${kinds.join("|")}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: not in enum`];
  const out: string[] = [];
  if (kind === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) out.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (sub) out.push(...violations(sub, v, `${path}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: not allowed`);
    }
  }
  if (kind === "array" && schema.items) (value as unknown[]).forEach((v, n) => out.push(...violations(schema.items!, v, `${path}[${n}]`)));
  return out;
}

/** OpenAI strict structured outputs: every object forbids extra fields and requires exactly its declared properties. */
function strictViolations(schema: JsonSchema, path = "$"): string[] {
  const out: string[] = [];
  if (path === "$" && schema.type !== "object") out.push("$: root is not an object");
  if (schema.properties) {
    if (schema.type !== "object") out.push(`${path}: type is not object`);
    if (schema.additionalProperties !== false) out.push(`${path}: additionalProperties is not false`);
    const declared = Object.keys(schema.properties).toSorted();
    if (JSON.stringify([...(schema.required ?? [])].toSorted()) !== JSON.stringify(declared)) out.push(`${path}: required differs from properties`);
    for (const [k, v] of Object.entries(schema.properties)) out.push(...strictViolations(v, `${path}.${k}`));
  }
  if (schema.items) {
    if (schema.type !== "array") out.push(`${path}: type is not array`);
    out.push(...strictViolations(schema.items, `${path}[]`));
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

function productionBindings(openAiKey = "test-openai-key"): Env {
  return { ...env, SCAN_AI_MODE: "openai", APP_ENV: "production", OPENAI_API_KEY: openAiKey, ANTHROPIC_API_KEY: "expired-anthropic-key" };
}

describe("POST /api/scans", () => {
  it("estimates a plate with ranges in mock mode and sets the device cookie", async () => {
    const res = await scan("plate");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^wohin_device=[\w-]+\.[\w-]{43}; Path=\/api/);
    const { plate } = res.body.scan;
    expect(res.body.scan).toMatchObject({ kind: "plate", mode: "mock", costUsd: 0 });
    expect(plate.nutrients.kcal.low).toBeLessThan(plate.nutrients.kcal.high);
    expect(plate.nutrients.kcal.value).toBe(Math.round((plate.nutrients.kcal.low + plate.nutrients.kcal.high) / 2));
  });

  it("reads a menu, lists it for the same device only, and deletes it", async () => {
    const first = await scan("menu", { ip: ipOf("menu") });
    const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
    expect(first.body.scan.menu.dishes.length).toBeGreaterThan(0);
    const mine = await get("/api/scans?kind=menu", cookie);
    expect(mine.body.scans.map((s: { id: string }) => s.id)).toEqual([first.body.scan.id]);
    expect((await get("/api/scans?kind=menu", "wohin_device=someone-else-1234")).body.scans).toEqual([]);
    expect((await get(`/api/scans/${first.body.scan.id}`, "wohin_device=someone-else-1234", "DELETE")).status).toBe(404);
    expect((await get(`/api/scans/${first.body.scan.id}`, cookie, "DELETE")).status).toBe(200);
    expect((await get("/api/scans?kind=menu", cookie)).body.scans).toEqual([]);
  });

  it("rejects bad input: kind, non-image bytes", async () => {
    expect((await scan("dessert")).status).toBe(400);
    expect((await scan("plate", { photo: new TextEncoder().encode("not an image") })).status).toBe(415);
  });

  it("limits scans per device per hour", async () => {
    const cookie = "wohin_device=limit-device-1";
    for (let i = 0; i < SCAN_LIMITS.perHour; i++) expect((await scan("plate", { cookie, ip: ipOf(`l${i}`) })).status).toBe(200);
    const over = await scan("plate", { cookie, ip: ipOf("l-over") });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("rate_limited");
  });

  it.each([
    ["plate", PLATE_FIXTURE, MENU_FIXTURE, { plate: { name: "Gebratener Reis", nutrients: { kcal: { value: 500 } } } }],
    ["menu", MENU_FIXTURE, PLATE_FIXTURE, { menu: { restaurantName: "Bistro", dishes: [{ name: "Falafel", priceEur: 9.5 }] } }],
  ])("reads a %s through OpenAI with both keys set and no R2 bindings", async (kind, own, other, expected) => {
    let accepted: [string[], string[], string[]] | null = null;
    const fetchProvider = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      const { schema } = JSON.parse(init?.body as string).text.format;
      accepted = [violations(schema, own), violations(schema, other), strictViolations(schema)];
      return Response.json({
        model: "gpt-6.2-sol",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(own) }] }],
        usage: { input_tokens: 500, output_tokens: 100 },
      });
    });
    const res = await scan(kind, { bindings: productionBindings() });
    expect(accepted![0]).toEqual([]);
    expect(accepted![1]).not.toEqual([]);
    expect(accepted![2]).toEqual([]);
    expect(res.status).toBe(200);
    expect(res.body.scan).toMatchObject({ kind, mode: "openai", ...expected });
    const [url, init] = fetchProvider.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-openai-key");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      store: false,
      input: [{ content: [{ type: "input_text" }, { type: "input_image", image_url: expect.stringMatching(/^data:image\/jpeg;base64,/) }] }],
      text: { format: { type: "json_schema", strict: true } },
    });
  });

  it("keeps Anthropic first in auto mode", () => {
    expect(scanModel({ APP_ENV: "production", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })?.provider).toBe("anthropic");
    expect(scanModel({ APP_ENV: "production", OPENAI_API_KEY: "o" })?.provider).toBe("openai");
    expect(scanModel({ APP_ENV: "production", SCAN_AI_MODE: "openai", ANTHROPIC_API_KEY: "a" })).toBeNull();
  });

  it("reports a temporary outage and saves no reading when the provider hits its quota", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }));
    const res = await scan("plate", { bindings: productionBindings() });
    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({ code: "unavailable", message: "Der Foto-Scan ist gerade nicht verfügbar. Versuch es später noch einmal." });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    expect((await get("/api/scans", cookie)).body.scans).toEqual([]);
  });

  it("returns unavailable without contacting Anthropic when production is missing its OpenAI key", async () => {
    const fetchProvider = vi.spyOn(globalThis, "fetch");
    const res = await scan("menu", { bindings: productionBindings("") });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("unavailable");
    expect(fetchProvider).not.toHaveBeenCalled();
  });
});

describe("scan helpers", () => {
  it("orders and clamps ranges", () => {
    expect(nutrientsOf({ kcal_low: 700, kcal_high: 500, protein_low: -4, protein_high: 30 })).toMatchObject({
      kcal: { low: 500, high: 700, value: 600 },
      protein: { low: 0, high: 30, value: 15 },
      fat: { low: 0, high: 0, value: 0 },
    });
  });

  it("drops nameless dishes and implausible prices", () => {
    const menu = menuFrom({
      is_menu: true,
      reason: "",
      restaurant_name: " ",
      dishes: [
        { name: "", description: null, price_eur: 9, kcal_low: 1, kcal_high: 2, protein_low: 0, protein_high: 0, carbs_low: 0, carbs_high: 0, fat_low: 0, fat_high: 0 },
        { name: "Bowl", description: "", price_eur: 9999, kcal_low: 1, kcal_high: 2, protein_low: 0, protein_high: 0, carbs_low: 0, carbs_high: 0, fat_low: 0, fat_high: 0 },
      ],
    });
    expect(menu).toMatchObject({ restaurantName: null, dishes: [{ name: "Bowl", description: null, priceEur: null }] });
  });

  it("picks mock in dev, nothing without keys elsewhere, and parses the budget", () => {
    expect(scanModel({ APP_ENV: "dev" })?.provider).toBe("mock");
    expect(scanModel({ APP_ENV: "production" })).toBeNull();
    expect(scanModel({ APP_ENV: "production", ANTHROPIC_API_KEY: "k" })?.provider).toBe("anthropic");
    expect(scanModel({ APP_ENV: "dev", SCAN_AI_MODE: "off" })).toBeNull();
    expect(scanBudgetUsd(undefined)).toBe(1);
    expect(scanBudgetUsd("0.5")).toBe(0.5);
    expect(scanBudgetUsd("nope")).toBe(1);
  });
});
