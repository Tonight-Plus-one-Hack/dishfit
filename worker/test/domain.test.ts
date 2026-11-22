import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import worker from "../src/index";

function productionRequest(url: string, options: { aliases?: "true" | "false"; headers?: HeadersInit } = {}) {
  return worker.fetch(new Request(url, { headers: options.headers }), {
    ...env,
    APP_ENV: "production",
    DISHFIT_REDIRECT_ALIASES: options.aliases ?? "true",
    ASSETS: {
      fetch: async () => new Response("asset", { headers: { "content-type": "text/plain", etag: '"v1"' } }),
      connect() { throw new Error("Static assets do not open sockets"); },
    },
  } as Env, createExecutionContext());
}

it.each([
  "https://www.dishfit.de",
  "https://dishfit.caniberk.dev",
  "http://dishfit.de",
])("redirects %s to the HTTPS apex and preserves the path and query", async (origin) => {
  const path = "/map?ref=one%20two";
  const response = await productionRequest(origin + path);
  expect(response.status).toBe(301);
  expect(response.headers.get("location")).toBe("https://dishfit.de" + path);
  expect(response.headers.has("strict-transport-security")).toBe(origin.startsWith("https:"));
});

it("serves both alias domains before cutover and keeps the Workers fallback available", async () => {
  const legacy = await productionRequest("https://dishfit.caniberk.dev/api/health", { aliases: "false" });
  expect(legacy.status).toBe(200);
  const www = await productionRequest("https://www.dishfit.de/assets/logo.webp", { aliases: "false" });
  expect(www.status).toBe(200);
  expect(www.headers.has("location")).toBe(false);
  const fallback = await productionRequest("https://wohin.batubln.workers.dev/api/health", {
    headers: { "x-forwarded-host": "www.dishfit.de" },
  });
  expect(fallback.status).toBe(200);
  expect(fallback.headers.has("location")).toBe(false);
});

it("adds HSTS to apex app and API responses and keeps their content and headers", async () => {
  const asset = await productionRequest("https://dishfit.de/");
  expect(await asset.text()).toBe("asset");
  expect(asset.headers.get("etag")).toBe('"v1"');
  expect(asset.headers.get("strict-transport-security")).toBe("max-age=15552000");
  const api = await productionRequest("https://dishfit.de/api/health");
  expect(await api.json()).toEqual({ ok: true, env: "production" });
  expect(api.headers.get("strict-transport-security")).toBe("max-age=15552000");
});
