import type { ApiError, ApiErrorCode } from "@wohin/contract";

const encoder = new TextEncoder();

export type Handler = (c: RouteContext) => Promise<Response> | Response;

export type RouteContext = {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string | undefined>;
};

export type Route = { method: string; pattern: URLPattern; handler: Handler };

export function route(method: string, pathname: string, handler: Handler): Route {
  return { method, pattern: new URLPattern({ pathname }), handler };
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function apiError(code: ApiErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } } satisfies ApiError, status);
}

export const notFound = (what = "Not found") => apiError("not_found", what, 404);
export const badRequest = (message: string) => apiError("bad_request", message, 400);

/** Reads a JSON body up to maxBytes; null when it is missing, too big or not JSON. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) return null;
  const text = await request.text();
  if (encoder.encode(text).length > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
