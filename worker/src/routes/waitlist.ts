import { WAITLIST_OFFER, type WaitlistCoupon, type WaitlistOffer } from "@wohin/contract";
import { DurableObject } from "cloudflare:workers";
import { isAdmin } from "../lib/admin";
import { apiError, badRequest, json, readJson, type RouteContext } from "../lib/http";
import { ipKey } from "../lib/ip";

// Use dot-atom addresses and conventional domain labels, including punycode.
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  const [local, domain, extra] = email.split("@");
  if (!local || !domain || extra !== undefined || email.length > 254 || local.length > 64) return null;
  if (!LOCAL_PART.test(local) || !domain.includes(".") || !domain.split(".").every((label) => DOMAIN_LABEL.test(label))) return null;
  return email;
}

function waitlist(env: Env) {
  return env.WAITLIST.getByName("premium");
}

export async function postWaitlist({ request, env }: RouteContext): Promise<Response> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return badRequest("Expected a JSON signup.");
  }
  // This endpoint stays independent of D1, including abuse checks. Cloudflare sets the client IP.
  const key = ipKey(request.headers.get("cf-connecting-ip") ?? "") ?? "unknown";
  const { success } = await env.LIMIT_WAITLIST.limit({ key });
  if (!success) return apiError("rate_limited", "Too many requests, try again in a moment.", 429);

  const body = await readJson(request, 2_048);
  if (!body || typeof body !== "object") return badRequest("Invalid signup.");
  const { email: input, consent, website } = body as Record<string, unknown>;
  const email = normalizeEmail(input);
  if ((website !== "" && website !== undefined) || !email || consent !== true) return badRequest("Invalid signup.");

  return json(await waitlist(env).signup(email));
}

export async function exportWaitlist({ request, env }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return apiError("forbidden", "Admin token required.", 403);
  return waitlist(env).csv();
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CSV_PAGE_SIZE = 250;
type WaitlistRow = { email: string; code: string; offer: WaitlistOffer; consent_at: string };

function csvCell(value: string): string {
  const safe = /^[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export class Waitlist extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS signups (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        offer TEXT NOT NULL,
        consent_at TEXT NOT NULL
      ) WITHOUT ROWID
    `);
  }

  async signup(email: string): Promise<WaitlistCoupon> {
    // The lookup and insert are synchronous on one object. Concurrent requests cannot mint twice.
    const existing = this.sql.exec<WaitlistCoupon>("SELECT code, offer FROM signups WHERE email = ?", email).toArray()[0];
    if (existing) return existing;
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => CODE_ALPHABET[byte & 31]).join("");
    const code = `DISHFIT-${suffix}`;
    const offer = WAITLIST_OFFER;
    this.sql.exec("INSERT INTO signups (email, code, offer, consent_at) VALUES (?, ?, ?, ?)", email, code, offer, new Date().toISOString());
    return { code, offer };
  }

  async csv(): Promise<Response> {
    let after = "";
    const sql = this.sql;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("email,code,offer,consent_at\r\n"));
      },
      pull(controller) {
        const rows = sql.exec<WaitlistRow>(
          "SELECT email, code, offer, consent_at FROM signups WHERE email > ? ORDER BY email LIMIT ?",
          after,
          CSV_PAGE_SIZE,
        ).toArray();
        if (rows.length) {
          after = rows[rows.length - 1]!.email;
          const page = rows.map(({ email, code, offer, consent_at }) => [email, code, offer, consent_at].map(csvCell).join(",")).join("\r\n");
          controller.enqueue(encoder.encode(page + "\r\n"));
        }
        if (rows.length < CSV_PAGE_SIZE) controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="dishfit-waitlist.csv"',
      },
    });
  }
}
