/**
 * The anonymous device profile's cookie: `wohin_device=<id>.<signature>`, where the signature is an
 * HMAC-SHA-256 of the id with DEVICE_COOKIE_SECRET. A client can drop the cookie and get a new
 * profile, but it cannot claim another profile's id (its contributions, badges or votes).
 *
 * Without a secret (staging or production before `wrangler secret put DEVICE_COOKIE_SECRET`) no
 * cookie is read or set: uploads still work, profile features answer 503. Local dev and tests use a
 * fixed dev secret.
 */

export const DEVICE_COOKIE = "wohin_device";
const DEV_SECRET = "wohin-dev-device-cookie-secret";
const ONE_YEAR_S = 31536000;

const encoder = new TextEncoder();
let cached: { secret: string; key: CryptoKey } | null = null;

type DeviceEnv = { APP_ENV?: string; DEVICE_COOKIE_SECRET?: string };

export function deviceSecret(env: DeviceEnv): string | null {
  const secret = env.DEVICE_COOKIE_SECRET?.trim();
  if (secret) return secret;
  return env.APP_ENV === "dev" ? DEV_SECRET : null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cached?.secret === secret) return cached.key;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  cached = { secret, key };
  return key;
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The cookie value for a profile id. */
export async function signDevice(secret: string, id: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`v1:${id}`));
  return `${id}.${b64url(sig)}`;
}

/** The profile id from a correctly signed cookie, else null (missing, unsigned, forged). */
export async function readDevice(request: Request, env: DeviceEnv): Promise<string | null> {
  const secret = deviceSecret(env);
  if (!secret) return null;
  const cookie = request.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([A-Za-z0-9-]{8,64})\\.([A-Za-z0-9_-]{43})(?:;|$)`).exec(cookie);
  if (!m) return null;
  const sig = fromB64url(m[2]!);
  if (!sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(`v1:${m[1]}`));
  return ok ? m[1]! : null;
}

/**
 * The id in the device cookie: verified when signed, or a legacy unsigned id (cookies set before
 * signing, e.g. by the first camera scans) with signed=false. A signed value with a wrong signature is null.
 * Use this only where the id is a bearer key for the device's own private rows (camera scans); profile
 * features use readDevice(), and ensureProfile() upgrades a legacy id to a signed cookie.
 */
export async function readDeviceCookie(request: Request, env: DeviceEnv): Promise<{ id: string; signed: boolean } | null> {
  const cookie = request.headers.get("cookie") ?? "";
  if (new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=[A-Za-z0-9-]{8,64}\\.`).test(cookie)) {
    const id = await readDevice(request, env);
    return id ? { id, signed: true } : null;
  }
  const legacy = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([A-Za-z0-9-]{8,64})(?:;|$)`).exec(cookie);
  return legacy ? { id: legacy[1]!, signed: false } : null;
}

/** Set-Cookie for a new device id: signed when a secret is configured, else the legacy unsigned form. */
export async function newDeviceCookieHeader(env: DeviceEnv, id: string, url: URL): Promise<string> {
  const secret = deviceSecret(env);
  const value = secret ? await signDevice(secret, id) : id;
  return cookieHeader(value, url, env);
}

function cookieHeader(value: string, url: URL, env: DeviceEnv): string {
  const secure = env.APP_ENV === "production" || url.protocol === "https:";
  return `${DEVICE_COOKIE}=${value}; Path=/api; Max-Age=${ONE_YEAR_S}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
