import { describe, expect, it } from "vitest";
import { api, ipOf } from "./fixtures";

const signup = (email: string, ip: string, extra: Record<string, unknown> = {}) =>
  api("/api/waitlist", { method: "POST", ip: ipOf(ip), body: { email, consent: true, website: "", ...extra } });
const exportCsv = (token?: string) => api("/api/admin/waitlist.csv", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe("Premium waitlist", () => {
  it("issues one durable, random coupon per normalized email even across concurrent signups", async () => {
    const [first, retry] = await Promise.all([
      signup("  WAITLIST-A@example.com ", "waitlist-idempotency-a"),
      signup("waitlist-a@example.com", "waitlist-idempotency-b"),
    ]);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ code: expect.stringMatching(/^DISHFIT-[A-Z2-9]{16}$/), offer: "premium_month" });
    expect(retry.body).toEqual(first.body);
    expect((await signup("waitlist-b@example.com", "waitlist-idempotency-c")).body.code).not.toBe(first.body.code);

    const csv = (await exportCsv("test-admin-token")).body as string;
    expect(csv.match(/"waitlist-a@example\.com"/g)).toHaveLength(1);
    expect(csv).toContain(`"waitlist-a@example.com","${first.body.code}","premium_month"`);
  });

  it("requires email and consent, and rejects honeypot submissions without writing", async () => {
    for (const email of ["x", "a..b@example.com", "user@-example.com", "user@example..com"]) {
      expect((await signup(email, "waitlist-invalid")).status).toBe(400);
    }
    expect((await signup("no-consent@example.com", "waitlist-invalid", { consent: "true" })).status).toBe(400);
    expect((await signup("trap@example.com", "waitlist-invalid", { website: "https://example.com" })).status).toBe(400);
    const csv = (await exportCsv("test-admin-token")).body as string;
    expect(csv).not.toContain("trap@example.com");
    expect(csv).not.toContain("no-consent@example.com");
  });

  it("limits attempts from the same IP without limiting a different IP", async () => {
    for (let i = 0; i < 6; i++) {
      expect((await signup("invalid", "waitlist-rate-limit")).status).toBe(400);
    }
    expect((await signup("waitlist-rate@example.com", "waitlist-rate-limit")).status).toBe(429);
    expect((await signup("waitlist-rate@example.com", "waitlist-rate-other")).status).toBe(200);
  });

  it("secures the download and escapes spreadsheet formulas in email cells", async () => {
    expect((await exportCsv()).status).toBe(403);
    expect((await exportCsv("wrong-token")).status).toBe(403);
    expect((await signup("+formula@example.com", "waitlist-csv")).status).toBe(200);
    const csv = await exportCsv("test-admin-token");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    expect(csv.headers.get("cache-control")).toBe("no-store");
    expect(csv.body).toContain("email,code,offer,consent_at\r\n");
    expect(csv.body).toContain(`"'+formula@example.com"`);
  });
});
