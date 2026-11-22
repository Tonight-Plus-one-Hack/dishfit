import { apiError } from "./http";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function enforceTransport(request: Request, env: Pick<Env, "APP_ENV">, url: URL, redirectHost?: string): Response | null {
  const secure = url.protocol === "https:";
  if ((secure && !redirectHost) || (env.APP_ENV === "dev" && LOOPBACK.has(url.hostname))) return null;
  if (!secure && request.method !== "GET" && request.method !== "HEAD") {
    return apiError("forbidden", "HTTPS is required.", 403);
  }
  const target = new URL(url);
  target.protocol = "https:";
  if (redirectHost) {
    target.hostname = redirectHost;
    target.port = "";
  }
  return Response.redirect(target.href, 301);
}

const BASE_CSP = "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
const MAPS = "https://maps.googleapis.com https://maps.gstatic.com";
const TURNSTILE = "https://challenges.cloudflare.com";
const APP_CSP = [
  BASE_CSP,
  "default-src 'self'",
  `script-src 'self' ${MAPS} ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://tiles.openfreemap.org ${MAPS} https://*.googleusercontent.com https://*.ggpht.com`,
  `connect-src 'self' https://tiles.openfreemap.org ${MAPS} https://places.googleapis.com ${TURNSTILE}`,
  `frame-src https://www.google.com ${TURNSTILE}`,
  "worker-src 'self' blob:",
].join("; ");

export function secureResponse(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  if (url.protocol === "https:") headers.set("strict-transport-security", "max-age=15552000");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()");
  if (!headers.has("content-security-policy")) {
    headers.set("content-security-policy", BASE_CSP);
    if (headers.get("content-type")?.startsWith("text/html")) {
      // Observe resource restrictions as Places UI Kit and browser behavior evolve.
      headers.set("content-security-policy-report-only", APP_CSP);
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
