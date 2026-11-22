// The Worker serves the API and app documents, including dish previews.
import { apiError, json, route, type Route } from "./lib/http";
import { limitByIp, type LimiterName } from "./lib/rate-limit";
import { enforceTransport, secureResponse } from "./lib/security";
import { getAiUsage, getStorageUsage } from "./routes/admin";
import { getDish, getRestaurant, listKieze, listRestaurants, topDishes } from "./routes/catalog";
import { postEvents } from "./routes/events";
import { excludeDevice, getNumbers } from "./routes/numbers";
import { teamPage } from "./routes/team";
import { queuePage } from "./community/queue-page";
import { aiImage } from "./routes/media";
import { deleteScan, deleteScanPhoto, listScans, postScan, scanPhoto } from "./routes/scans";
import { badgesSeen, getConfirmations, getMe, leaderboard, listConfirmations, patchMe, postConfirmation } from "./routes/community";
import {
  communityDishes,
  decideSubmission,
  getSubmission,
  listSubmissions,
  postSubmission,
  submissionConfig,
  submissionPhoto,
  submissionPublicPhoto,
} from "./routes/submissions";
import { exportWaitlist, postWaitlist } from "./routes/waitlist";
import { postShare, shareCard, shareNumbers } from "./share/routes";
import { webResponse } from "./web";

export { Waitlist } from "./routes/waitlist";

type LimitedRoute = Route & { limit: LimiterName | null };

const limited = (limit: LimiterName | null, r: Route): LimitedRoute => ({ ...r, limit });

export const routes: LimitedRoute[] = [
  limited(null, route("GET", "/api/health", ({ env }) => json({ ok: true, env: env.APP_ENV }))),
  limited("LIMIT_READ", route("GET", "/api/kieze", listKieze)),
  limited("LIMIT_READ", route("GET", "/api/dishes/top", topDishes)),
  limited("LIMIT_READ", route("GET", "/api/dishes/:id", getDish)),
  limited("LIMIT_READ", route("GET", "/api/restaurants", listRestaurants)),
  limited("LIMIT_READ", route("GET", "/api/restaurants/:id", getRestaurant)),
  limited("LIMIT_READ", route("GET", "/api/images/ai/:file", aiImage)),
  limited("LIMIT_EVENTS", route("POST", "/api/events", postEvents)),
  limited("LIMIT_READ", route("GET", "/api/numbers", getNumbers)),
  limited("LIMIT_EVENTS", route("POST", "/api/admin/numbers/exclude", excludeDevice)),
  limited(null, route("GET", "/api/team", teamPage)),
  limited("LIMIT_READ", route("GET", "/api/admin/ai-usage", getAiUsage)),
  limited("LIMIT_READ", route("GET", "/api/admin/storage-usage", getStorageUsage)),
  limited(null, route("POST", "/api/waitlist", postWaitlist)),
  limited(null, route("GET", "/api/admin/waitlist.csv", exportWaitlist)),
  // Private camera scans (menu or plate); their own per-device and per-IP limits sit in the handler.
  limited("LIMIT_EVENTS", route("POST", "/api/scans", postScan)),
  limited("LIMIT_READ", route("GET", "/api/scans", listScans)),
  limited("LIMIT_READ", route("DELETE", "/api/scans/:id", deleteScan)),
  limited("LIMIT_READ", route("GET", "/api/scans/:id/photo", scanPhoto)),
  limited("LIMIT_EVENTS", route("DELETE", "/api/scans/:id/photo", deleteScanPhoto)),
  // Community menu scans (src/community): uploads have their own hourly and daily limits on top.
  limited("LIMIT_READ", route("GET", "/api/submissions/config", submissionConfig)),
  limited("LIMIT_EVENTS", route("POST", "/api/submissions", postSubmission)),
  limited("LIMIT_READ", route("GET", "/api/submissions/:id", getSubmission)),
  limited("LIMIT_READ", route("GET", "/api/submissions/:id/photo", submissionPublicPhoto)),
  limited("LIMIT_READ", route("GET", "/api/community/dishes", communityDishes)),
  limited("LIMIT_READ", route("GET", "/api/admin/submissions", listSubmissions)),
  limited("LIMIT_READ", route("GET", "/api/admin/submissions/:id/photo", submissionPhoto)),
  limited("LIMIT_EVENTS", route("POST", "/api/admin/submissions/:id/decision", decideSubmission)),
  limited("LIMIT_READ", route("GET", "/api/admin/queue", queuePage)),
  // Community profiles (src/community/profiles.ts): device profile, confirmations, badges, Kiez leaderboard.
  limited("LIMIT_READ", route("GET", "/api/me", getMe)),
  limited("LIMIT_EVENTS", route("PATCH", "/api/me", patchMe)),
  limited("LIMIT_EVENTS", route("POST", "/api/me/badges/seen", badgesSeen)),
  limited("LIMIT_READ", route("GET", "/api/dishes/:id/confirmations", getConfirmations)),
  limited("LIMIT_EVENTS", route("POST", "/api/dishes/:id/confirmations", postConfirmation)),
  limited("LIMIT_READ", route("GET", "/api/leaderboard", leaderboard)),
  limited("LIMIT_READ", route("GET", "/api/admin/confirmations", listConfirmations)),
  limited("LIMIT_READ", route("GET", "/api/share/:id/:file", shareCard)),
  limited("LIMIT_EVENTS", route("POST", "/api/shares", postShare)),
  limited("LIMIT_READ", route("GET", "/api/admin/share-numbers", shareNumbers)),
];

async function serve(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  try {
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return await webResponse(request, env, ctx, url);
    let methodMismatch = false;
    for (const r of routes) {
      const match = r.pattern.exec({ pathname: url.pathname });
      if (!match) continue;
      if (r.method !== request.method) {
        methodMismatch = true;
        continue;
      }
      if (r.limit) {
        const limitedResponse = await limitByIp(env, request, r.limit);
        if (limitedResponse) return limitedResponse;
      }
      return await r.handler({ request, env, ctx, url, params: match.pathname.groups });
    }
    return methodMismatch ? apiError("bad_request", "Method not allowed", 405) : apiError("not_found", "Not found", 404);
  } catch (error) {
    console.error("[worker] unhandled", url.pathname, error instanceof Error ? error.message : "error");
    return apiError("internal", "Something went wrong", 500);
  }
}

const APEX_HOST = "dishfit.de";
const ALIAS_HOSTS = new Set(["www.dishfit.de", "dishfit.caniberk.dev"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const redirectToApex = env.APP_ENV === "production" && (
      (String(env.DISHFIT_REDIRECT_ALIASES) === "true" && ALIAS_HOSTS.has(url.hostname)) ||
      (url.hostname === APEX_HOST && url.protocol !== "https:")
    );
    const transportResponse = enforceTransport(request, env, url, redirectToApex ? APEX_HOST : undefined);
    return secureResponse(transportResponse ?? await serve(request, env, ctx, url), url);
  },
} satisfies ExportedHandler<Env>;
