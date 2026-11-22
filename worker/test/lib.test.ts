/**
 * The generic security building blocks in src/lib, ported from
 * fm/lane2-chat-safety with their tests: word filter, IP keys and hashes,
 * per-IP rate limits, admin token check, and AI usage cost math.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { isAdmin } from "../src/lib/admin";
import {
  AI_PRICES,
  budgetCostUsd,
  budgetExhausted,
  costMicros,
  costUsd,
  dailyBudgetUsd,
  priceFor,
  recordUsage,
  resetBudgetCache,
  startOfUtcDay,
} from "../src/lib/ai-usage";
import { ipHash, ipKey, resetIpSaltCache } from "../src/lib/ip";
import { ipLimited } from "../src/lib/rate-limit";
import { checkText, tokenize } from "../src/lib/word-filter";

const HOUR = 60 * 60 * 1000;
const withIp = (ip: string) => new Request("https://example.com/", { headers: { "cf-connecting-ip": ip } });
const req = (authorization?: string) => new Request("https://example.com/", { headers: authorization ? { authorization } : {} });

describe("word filter", () => {
  it.each([
    "du Hurensohn",
    "HURENSÖHNE alle",
    "drecksfotze",
    "f.u.c.k y.o.u",
    "fuuuck you",
    "n1gger",
    "Fick dich",
    "ich bring dich um",
    "send nudes pls",
    "kill yourself",
    "i know where you live",
    "va te faire foutre",
    "fils de pute",
    "hijo de puta",
    "te voy a matar",
    "vaffanculo",
    "ti ammazzo",
    "orospu çocuğu",
    "amına koyayım",
    "k y s",
    "$lut",
    // Security audit H6: trailing punctuation and letters written apart.
    "fuck you",
    "fuck you!",
    "kill yourself!",
    "send nudes!",
    "kys!",
    "ich bring dich um!",
    "i know where you live!",
    "f u c k y o u",
    "fuckyou",
    "killyourself",
    "Fick dich!!!",
    "sh!thead... du hurensohn!",
    // N2: look-alike letters and zero-width characters.
    "fu\u0441k you",
    "\u0445\u0443\u0439 hurens\u043Ehn",
    "kill\u200Byourself",
    "hurens\u200Bohn",
    "f\u200Bu\u200Bc\u200Bk y\u200Bo\u200Bu",
    "\u03BAill yourself",
  ])("blocks %j", (text) => {
    expect(checkText(text).ok).toBe(false);
  });

  it.each([
    "Bin um 21 Uhr da, rote Jacke!",
    "Scheiße, die Bahn hat Verspätung",
    "fuck yeah, see you there",
    "Wer will noch ein Bier?",
    "Ich bin der Kai, Platz 4",
    "Gibt es da Pizza? Spicy please",
    "Schickt mir ein Pic vom Eingang",
    "musique transe ce soir",
    "fromage râpé",
    "Ele pede uma cerveja",
    "Mongolisch essen danach?",
    "21:00 am Eingang",
    "hi, red jacket at the bar",
    // Security audit H6: false alarms and ordinary punctuation.
    "je suis en retard",
    "désolé, 10 minutes de retard",
    "that is subnormal",
    "Prost!!!",
    "I'm in!",
    "1 Bier bitte",
    "Tisch 11!",
    "grape young wine",
    "Wow! Bis gleich!",
    "\u041F\u0440\u0438\u0432\u0435\u0442, \u044F \u0443 \u0431\u0430\u0440\u0430",
    "see\u200Byou soon",
  ])("allows %j", (text) => {
    expect(checkText(text).ok).toBe(true);
  });

  it("joins spaced-out letters into one word", () => {
    expect(tokenize("f u c k off")).toEqual(["fuck", "off"]);
  });

  it("undoes leetspeak and letter runs", () => {
    expect(tokenize("h4ck3r")).toEqual(["hacker"]);
    expect(checkText("w1chs3r").ok).toBe(false);
    expect(checkText("schlaaaampe").ok).toBe(false);
  });
});

describe("IP keys (audit K1, K2)", () => {
  it.each([
    ["203.0.113.9", "203.0.113.9"],
    [" 203.0.113.9 ", "203.0.113.9"],
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["2001:db8:1:2::1", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:ffff:0:0:9", "2001:db8:1:2::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["64:ff9b::203.0.113.9", "64:ff9b:0:0::/64"],
  ])("%j -> %j", (raw, key) => {
    expect(ipKey(raw)).toBe(key);
  });

  it.each(["", "not an ip", "999.1.1.1", "1.2.3", "2001:db8::1::2", "2001:db8:1:2:3:4:5:6:7", "12345::"])("rejects %j", (raw) => {
    expect(ipKey(raw)).toBeNull();
  });
});

describe("IP hashes", () => {
  it("hash IPs with a salt that changes every day, IPv6 by its /64, and keep only today's salt", async () => {
    resetIpSaltCache();
    const day = Date.UTC(2026, 10, 21, 12);
    const a = await ipHash(env.DB, withIp("203.0.113.9"), day);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await ipHash(env.DB, withIp("203.0.113.9"), day)).toBe(a);
    expect(await ipHash(env.DB, withIp("203.0.113.10"), day)).not.toBe(a);
    expect(await ipHash(env.DB, withIp("2001:db8:1:2::1"), day)).toBe(await ipHash(env.DB, withIp("2001:db8:1:2:ffff::9"), day));
    expect(await ipHash(env.DB, withIp("2001:db8:1:3::1"), day)).not.toBe(await ipHash(env.DB, withIp("2001:db8:1:2::1"), day));
    expect(await ipHash(env.DB, new Request("https://example.com/"), day)).toBeNull();
    expect(await ipHash(env.DB, withIp("not an ip"), day)).toBeNull();

    const next = await ipHash(env.DB, withIp("203.0.113.9"), day + 24 * HOUR);
    expect(next).not.toBe(a);
    const salts = await env.DB.prepare("SELECT day FROM ip_salts").all<{ day: string }>();
    expect(salts.results.map((r) => r.day)).toEqual(["2026-11-22"]);
    resetIpSaltCache();
  });
});

describe("per-IP rate limits", () => {
  it("stand aside without a binding, without an IP hash, and when the limiter fails", async () => {
    expect(await ipLimited({}, "LIMIT_READ", "hash")).toBe(false);
    expect(await ipLimited(env, "LIMIT_READ", null)).toBe(false);
    const broken = { LIMIT_READ: { limit: () => Promise.reject(new Error("down")) } };
    expect(await ipLimited(broken, "LIMIT_READ", "hash")).toBe(false);
    const full = { LIMIT_READ: { limit: () => Promise.resolve({ success: false }) } };
    expect(await ipLimited(full, "LIMIT_READ", "hash")).toBe(true);
  });
});

describe("admin token", () => {
  it("accepts only the exact bearer token, and nothing without a configured token", async () => {
    const config = { ADMIN_TOKEN: "s3cret-token" };
    expect(await isAdmin(req("Bearer s3cret-token"), config)).toBe(true);
    expect(await isAdmin(req("Bearer  s3cret-token "), config)).toBe(true);
    expect(await isAdmin(req("Bearer s3cret-toke"), config)).toBe(false);
    expect(await isAdmin(req("s3cret-token"), config)).toBe(false);
    expect(await isAdmin(req(), config)).toBe(false);
    expect(await isAdmin(req("Bearer "), { ADMIN_TOKEN: "" })).toBe(false);
    expect(await isAdmin(req("Bearer anything"), {})).toBe(false);
  });
});

describe("AI usage cost", () => {
  it("prices tokens at list prices per million, also for dated snapshots", () => {
    const price = priceFor("claude-sonnet-5-5")!;
    expect(price).toEqual(AI_PRICES["claude-sonnet-5-5"]);
    expect(costUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 }, price)).toBe(14.6);
    expect(costUsd({ inputTokens: 412, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }, price)).toBe(0.000844);
    expect(priceFor("claude-sonnet-5-5-20261101")).toEqual(price);
    expect(priceFor("gpt-6.2-sol-2026-10-14")).toEqual(AI_PRICES["gpt-6.2-sol"]);
    expect(priceFor("claude-sonnet-5-5x")).toBeNull();
    expect(priceFor("gpt-6.2-sol-mini")).toBeNull();
  });

  it("costs a record in micro-USD from tokens or from a known per-request price", () => {
    expect(costMicros({ purpose: "nutrition", provider: "anthropic", model: "claude-sonnet-5-5", status: 200, inputTokens: 412, outputTokens: 2 })).toBe(844);
    expect(costMicros({ purpose: "places_photo", provider: "google_places", model: "place_photo", status: 200, units: 1, usd: 0.007 })).toBe(7000);
    expect(costMicros({ purpose: "x", provider: "openai", model: "unknown", status: 200, inputTokens: 5 })).toBeNull();
    expect(costMicros({ purpose: "x", provider: "openai", model: "unknown", status: 200, usd: -1 })).toBeNull();
  });

  it("counts unpriced tokens at the highest listed rates in the budget", () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(budgetCostUsd({ knownMicros: 12_000_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(12);
    // Highest input $4 (Opus 5.5) + highest output $20 (Opus 5.5).
    expect(budgetCostUsd({ knownMicros: 0, ...tokens })).toBe(24);
  });

  it("reads AI_DAILY_BUDGET_USD with a 5 USD default; days start at 00:00 UTC", () => {
    expect(dailyBudgetUsd(undefined)).toBe(5);
    expect(dailyBudgetUsd("")).toBe(5);
    expect(dailyBudgetUsd("abc")).toBe(5);
    expect(dailyBudgetUsd("-1")).toBe(5);
    expect(dailyBudgetUsd("12.5")).toBe(12.5);
    expect(dailyBudgetUsd("0")).toBe(0);
    expect(new Date(startOfUtcDay(Date.UTC(2026, 10, 21, 23, 59))).toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });

  it("stops paid calls once today's spend reaches the budget", async () => {
    await env.DB.prepare("DELETE FROM ai_usage").run();
    resetBudgetCache();
    const now = Date.now();
    expect(await budgetExhausted(env.DB, 1, now)).toBe(false);
    expect(await budgetExhausted(env.DB, 0, now)).toBe(true);
    await recordUsage(env.DB, [{ purpose: "image_generate", provider: "openai", model: "gpt-image-2.6", status: 200, units: 1, usd: 1 }], now);
    // The cache adds what this isolate recorded, and a fresh read agrees.
    expect(await budgetExhausted(env.DB, 1, now)).toBe(true);
    resetBudgetCache();
    expect(await budgetExhausted(env.DB, 1, now)).toBe(true);
    expect(await budgetExhausted(env.DB, 2, now)).toBe(false);
    resetBudgetCache();
  });
});
