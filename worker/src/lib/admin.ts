const encoder = new TextEncoder();

/**
 * Constant-time check of `Authorization: Bearer <ADMIN_TOKEN>`; false when no
 * token is configured. Both sides are hashed first so the comparison time does
 * not depend on the token's length or content.
 *
 * Ported from fm/lane2-chat-safety (apps/api/src/safety/admin.ts, isAdmin).
 */
export async function isAdmin(request: Request, env: { ADMIN_TOKEN?: string }): Promise<boolean> {
  const expected = env.ADMIN_TOKEN?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const [a, b] = await Promise.all(
    [header.slice("Bearer ".length).trim(), expected].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
  return crypto.subtle.timingSafeEqual(a!, b!);
}
