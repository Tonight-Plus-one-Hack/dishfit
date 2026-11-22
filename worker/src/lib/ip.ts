/**
 * Privacy-preserving IP keys for per-IP rate limits: an HMAC of the client IP
 * with a random salt that changes every UTC day. Only today's salt is kept in
 * D1 (ip_salts), so a stored or logged hash can never be linked back to an IP
 * once the day is over. The IP itself is never stored or logged.
 *
 * IPv6 clients usually own a whole /64, so the hash covers the /64 prefix:
 * rotating addresses inside it does not make a new client.
 *
 * Ported from fm/lane2-chat-safety (apps/api/src/safety/ip.ts).
 */

/** The part of an IP that identifies one network user: the IPv4 address or the IPv6 /64. */
export function ipKey(raw: string): string | null {
  const ip = raw.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").every((o) => Number(o) <= 255) ? ip : null;
  if (!ip.includes(":")) return null;
  let address = ip.split("%")[0]!;
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)?.[1];
  if (v4) {
    if (address.startsWith("::ffff:")) return ipKey(v4);
    const o = v4.split(".").map(Number);
    if (o.some((n) => n > 255)) return null;
    address = `${address.slice(0, -v4.length)}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail] : head;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

let cached: { day: string; key: CryptoKey } | null = null;

/** For tests: forget the cached salt. */
export function resetIpSaltCache(): void {
  cached = null;
}

async function dailyKey(db: D1Database, now: number): Promise<CryptoKey> {
  const day = utcDay(now);
  if (cached?.day === day) return cached.key;
  const [, current] = await db.batch<{ salt: string }>([
    db
      .prepare("INSERT INTO ip_salts (day, salt) VALUES (?, ?) ON CONFLICT (day) DO NOTHING")
      .bind(day, hex(crypto.getRandomValues(new Uint8Array(32)))),
    db.prepare("SELECT salt FROM ip_salts WHERE day = ?").bind(day),
    db.prepare("DELETE FROM ip_salts WHERE day < ?").bind(day),
  ]);
  const salt = current!.results[0]!.salt;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  cached = { day, key };
  return key;
}

/** HMAC of the request's CF-Connecting-IP with today's salt; null when there is no usable IP. */
export async function ipHash(db: D1Database, request: Request | undefined, now = Date.now()): Promise<string | null> {
  const raw = request?.headers.get("cf-connecting-ip");
  const key = raw ? ipKey(raw) : null;
  if (!key) return null;
  const signature = await crypto.subtle.sign("HMAC", await dailyKey(db, now), new TextEncoder().encode(key));
  return hex(signature).slice(0, 32);
}
