import { parseAppRoute } from "@wohin/contract";
import { limitByIp } from "./lib/rate-limit";
import { findShareDish } from "./share/dishes";
import { dishPage } from "./share/routes";

export async function webResponse(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (url.pathname === "/" || (request.method !== "GET" && request.method !== "HEAD")) {
    return env.ASSETS.fetch(request);
  }

  const page = parseAppRoute(url.pathname);
  if (page.name === "notFound") {
    const asset = await env.ASSETS.fetch(request);
    const destination = request.headers.get("sec-fetch-dest");
    const acceptsDocument =
      !destination || ["document", "iframe", "frame"].includes(destination) || request.headers.get("accept")?.includes("text/html");
    if (asset.status !== 404 || !acceptsDocument) return asset;
  }

  const shell = await env.ASSETS.fetch(new Request(new URL("/", url), { method: request.method }));
  if (!shell.ok) return shell;
  const missing = () => new Response(shell.body, { status: 404, headers: shell.headers });
  if (page.name === "notFound") return missing();
  try {
    if (page.name === "dish") {
      const dish = await findShareDish(env, page.id);
      if (!dish) return missing();
      return request.method === "GET" ? await dishPage(request, env, ctx, url, page.id, dish, shell) : shell;
    }
    if (page.name === "restaurant") return (await restaurantExists(env, page.id)) ? shell : missing();
    if (page.name === "snapStatus") {
      if (await limitByIp(env, request, "LIMIT_READ")) return shell;
      const row = await env.DB.prepare("SELECT 1 FROM submissions WHERE id = ?").bind(page.id).first();
      return row ? shell : missing();
    }
  } catch (error) {
    console.error("[web] record lookup failed", page.name, error instanceof Error ? error.message : "error");
  }
  return shell;
}

const RECORD_ID = /^[\w.-]{1,128}$/;

async function restaurantExists(env: Env, id: string): Promise<boolean> {
  if (!RECORD_ID.test(id)) return false;
  const response = await env.ASSETS.fetch(new Request(`https://assets.local/share/restaurants/${id}.json`));
  if (!response.ok && response.status !== 404) throw new Error(`restaurant asset ${response.status}`);
  return response.ok && (response.headers.get("content-type") ?? "").includes("json");
}
