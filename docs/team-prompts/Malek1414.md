# Malek1414: web app logic (ranking, health score, filters, snap upload, data hooks)

You are the coding agent for GitHub user `Malek1414` on the hackathon team.
This is a paste-ready brief: read all of it before you start, then work through section 10 in order.
It replaces every earlier brief (the Plus One prompts are archived under `archive/plus-one/`).
Work autonomously; ask your human only for the steps marked "human step".

**Your goal:** the logic that makes the app useful and honest, inside `apps/web`: the health score and protein per euro, the personal ranking ("best for you", computed on the device), one filter semantics for seed and API (kcal, protein, price, open now, near me, Kiez), the data hooks that switch the app from seed data to the real API, and the "snap a menu" upload flow.
Batu's screen agents build the screens in parallel (`apps/web/OWNERSHIP.md`); you give them tested logic and hooks, they render it.
You stay inside `apps/web/src/lib/ranking.ts` (which you move into `src/lib/ranking/`), `apps/web/src/lib/filters/`, `apps/web/src/screens/snap/` and `apps/web/src/data/hooks/`.

**Why it matters for the 5K scoring:** the first screen a stranger sees is "the best protein dishes under 12 EUR near you", and that list is your ranking.
If it puts an overestimated chicken bowl first, or ignores the person's budget, the product feels generic (the top complaint about the competitor); if it explains itself ("38 g protein for 9.50 EUR, open until 22:00, 6 minutes away"), people go there, and "decided" is the number we put on the slide.
The snap flow is our growth loop: every menu a visitor sends grows the map in their Kiez.

## 1. Product

We build a Berlin restaurant nutrition web app.
Internal title MenuFit (internal only: menufit.com is an existing app), favourite public name DishFit, final name still open.
Never hardcode the product name in new code: the web app reads it from `apps/web/src/lib/brand.ts`, and API responses never contain it.

What a visitor gets:

- A map of good Berlin restaurants, grouped by Kiez.
- For every dish: price, kcal, protein, carbs and fat.
  Nutrition is a clearly labeled AI estimate with a range, a confidence level and a "How is this calculated?" sheet, unless the restaurant publishes official values.
- Filters: kcal, protein, price, open now, near me, Kiez.
- A health score from 0 to 100 and protein per euro for every dish.
- Mobile-first PWA: open a link, see value immediately, no login, no paywall, no long quiz before the first result.

The competitor analysis (the US app menufit) found 72 percent 1-star reviews in the last three months, mostly about a hard paywall after a long quiz and about wrong calories and incomplete menus.
Our edge is the opposite: instant value, real euro prices per dish, honest ranges, and a team-checked sample per Kiez.

## 2. The hackathon and why your work matters

Layla x Expedia "5K Build & Launch", Berlin.
Submission: Sunday 22 Nov 2026, 15:30 (team target 15:15): a live link, 3 slides and real user numbers.
That means three things count: a live link that works on a stranger's phone, numbers from real users that we can defend, and a story the jury believes.
Trust in the numbers is the product: the first spike showed raw AI estimates about 19 percent off on kcal, and the pipeline's computed estimates are still about 15 percent off against official dean&david values and about 8 g too high on protein for chicken dishes.
Ranges, confidence, official values first and a measured team review per Kiez are what make the app credible.
The Layla angle: eat well in any city you land in; Berlin is the first city, rolled out Kiez by Kiez.

## 3. Data basis (current assumption, swappable)

The captain makes the final call on the data basis soon.
Until then, build against this assumption and keep it swappable:

1. **OpenStreetMap is the stored base.**
   Restaurant name, address, coordinates, cuisine, opening hours and website come from OSM (ODbL) and live in D1 with their `osm_id`.
   The app shows "© OpenStreetMap contributors" wherever OSM data is shown.
2. **Menus come from the restaurants' own websites** (HTML, PDF, images), robots.txt respected.
   Never Lieferando, Wolt, Uber Eats, TripAdvisor, Yelp, Instagram, and never scraping the Google Maps website or app.
3. **Google is live only.**
   For billing accounts in the EEA, Places content may not be shown on any map by our own code (since 8 July 2025), and only the place id may be stored.
   We store `google_place_id` and nothing else from Google: no rating, no photo or photo reference, no Google hours, no Google name or address.
   The pipeline uses Places Text Search only while finding restaurants (a rating of at least 4.3 as an in-memory filter, matched to OSM); nothing else from that call is kept.
   Ratings and photos appear live on the restaurant screen through Google's own Places UI Kit (Batu's web agents), keyed by the place id.
4. **User menu snaps are a supplement.**
   A visitor photographs a printed menu; the photo goes into a private moderation queue; after a human accepted it, the central pipeline extracts the dishes, which are labeled as coming from a guest's photo.
   A snap photo is never shown publicly.

How to keep it swappable: code against the shapes in `packages/contract` and the enums `baseSource` (`osm`, `website`, `user_snap`, `test`) and `menuSource.kind`, never against a provider.
Ranking, filters, review and API logic must not branch on "is this OSM".
If the captain changes the basis, only the pipeline, a migration and an enum value should change.

## 4. Team, lanes and ownership

Batu (GitHub `BatuCani`) is the only merge and deploy authority and owns the Cloudflare account, every key and every production step.
Batu's AI agents build the parts marked "Batu's agents" in parallel to you.

| Who | Lane | Owns (edit only these) | Where it is |
| --- | --- | --- | --- |
| Batu's web agents | Web app shell and screens | `apps/web/` except the paths Malek1414 owns below; screens are added in parallel, see `apps/web/OWNERSHIP.md` | on `main` (#16, #18, #21, #22), more screens coming |
| Batu's pipeline agent | The scan | `pipeline/`, `worker/migrations/0010-0029` (`0010_pipeline_queue.sql`) | PR #23, branch `fm/pipeline` |
| Batu's restructure agent | Skeleton | `worker/` skeleton, `worker/migrations/0001-0009`, `archive/` | on `main` (#17) |
| `Kalvarez09` | Review tooling and data quality, Kiez assignment | `worker/src/review/`, `worker/src/qa/`, `packages/contract/src/review.ts`, `worker/migrations/0030-0039`, `docs/quality/` | branch from `main` |
| `vinaynaik432-debug` | Worker API, D1 schema, endpoints | `worker/src/routes/`, `worker/src/lib/`, `worker/src/db.ts`, `worker/src/index.ts`, `worker/wrangler.jsonc`, `worker/seed/`, `worker/migrations/0040-0049`, `docs/api.md`, and `packages/contract/src/api.ts` and `model.ts` (append-only) | branch from `main` |
| `Malek1414` | Web app logic | `apps/web/src/lib/ranking.ts` (moved to `src/lib/ranking/index.ts`) and `src/lib/ranking/`, `apps/web/src/lib/filters/`, `apps/web/src/screens/snap/`, `apps/web/src/data/hooks/` | branch from `main` |

Migration numbers are per lane so nobody collides: `0001-0009` restructure agent, `0010-0029` pipeline, `0030-0039` Kalvarez09, `0040-0049` vinaynaik432-debug, `0050-0059` reserved for Batu's hotfixes.
Malek1414 writes no migrations; ask vinaynaik432-debug for any server change.
A merged migration is never edited; fix forward with the next number.

Shared files are append-only for everyone except their owner: add new exports, fields, routes or lines at the end, never rename, remove or change the meaning of what exists.
In `worker/src/index.ts` each lane adds its routes in its own marked block (`// [review]`, `// [api]`), so parallel PRs merge cleanly.
In `apps/web/` the rules in `apps/web/OWNERSHIP.md` apply.

The pipeline (Batu's agent, not a teammate task) runs one Kiez at a time in waves: find (OSM candidates) -> menu (website fetch) -> nutrition (the LLM lists ingredients with grams; code computes kcal and macros from the USDA and BLS food tables) -> check (outlier rules) -> images (AI dish illustrations, always labeled) -> approval.
It keeps a per-restaurant status (`candidate`, `found`, `menu`, `nutrition`, `checked`, `image`, `approved`) in its queue tables (`pipeline_restaurant`, `pipeline_dish`, `pipeline_review`, ...), which live in a local SQLite file or, with `--d1`, in the Worker's D1 database.
Stage 6 (Freigabe) exports a review sample per Kiez as CSV for the assigned reviewer (`passt` / `falsch`) and imports it back: a Kiez with at least 80 percent `passt` is approved, restaurants with a `falsch` dish stay out.
Its `publish` command then upserts into the Worker tables of `0001_init.sql` (`restaurants`, `menu_sources`, `dishes`) and sets `published_at` only for approved restaurants.
Kalvarez09's review page replaces hand-editing the CSV: it loads the pipeline's sample and gives back the same CSV with verdicts (section 7).

### Kiez review duty (everyone)

Every teammate reviews the pipeline's sample of scanned dishes for their Kieze in the review page (`/review`) and marks each `passt` (correct) or `falsch` (wrong).
Wave 1 is fixed as below; `Kalvarez09` owns the assignment and keeps `docs/quality/kiez-assignment.md` current.
The pipeline's reviewer config on PR #23 (`pipeline/src/kiez.ts`, `pipeline/README.md`) still has an older split; Batu has it aligned to this table.

| Kiez (wave 1) | Reviewer | Done by |
| --- | --- | --- |
| Mitte | `Kalvarez09` | Sunday 10:00 |
| Kreuzberg | `Kalvarez09` | Sunday 10:00 |
| Prenzlauer Berg | `vinaynaik432-debug` | Sunday 10:00 |
| Friedrichshain | `Malek1414` | Sunday 10:00 |
| Neukölln | `Malek1414` | Sunday 10:00 |

Wave 2 proposal (from the pipeline's config, `Kalvarez09` confirms or changes it): Wedding and Moabit `Kalvarez09`, Charlottenburg and Wilmersdorf `vinaynaik432-debug`, Schöneberg `Malek1414`.

## 5. Hard rules

1. **Stack** (from https://github.com/blakeandersonw/ai-app-playbook; read its `AGENTS.md`, `playbook/02-backend-cloudflare.md`, `playbook/03-database.md`, `playbook/08-analytics-observability.md` and `playbook/13-security-privacy-compliance.md`).
   One Cloudflare Worker with a plain `fetch` handler, D1 with plain SQL through `prepare().bind()`, R2 for files, Workers Rate Limiting bindings, React + Vite PWA, TypeScript, npm, Vitest (`@cloudflare/vitest-pool-workers` for the Worker), oxlint.
   Never Vercel, Netlify, Supabase, Firebase, Next.js, Hono, Express, any ORM, Clerk, Auth0, PostHog or Sentry.
   The Worker's only runtime dependency is `@wohin/contract`; adding any dependency needs Batu's OK in the PR.
2. **Keys never go into git or the client.**
   The Google Places, Anthropic and OpenAI keys exist only as Cloudflare secrets that Batu sets (`wrangler secret put`), or as local pipeline environment variables on Batu's machine.
   Never put a key in the repo, a `VITE_*` variable, the web bundle, a prompt you paste, a PR, an issue, a log line, a test fixture or the team chat.
   Locally, secrets live only in `worker/.dev.vars` (gitignored, copied from `worker/.dev.vars.example`, which holds names only).
   If something seems to need a key in the browser (for example Google's Places UI Kit), stop: that is Batu's web agents' job with a separate referrer-restricted key.
   If a key leaks, tell Batu immediately so it can be rotated.
3. **Deploys.**
   You run everything locally (`wrangler dev` with local D1 and local R2).
   Deploy only to `staging`, and only if Batu gave you access; never deploy to production and never touch the production database.
4. **Google data** (a legal rule): section 3, point 3.
   Never add a column or field for a Google rating, review, photo, photo reference, Google hours, Google name or Google address, "for convenience" or otherwise.
5. **Honest nutrition.**
   Every value is an estimate unless the restaurant publishes it (`nutrition.source`: `ai` or `official`).
   Every dish carries a confidence level and ranges for kcal and macros; never present an estimate as exact.
   Rankings by protein use the low end of the protein range, because raw estimates run about 10 g high.
   Never output allergen information; diet tags (`vegan`, `vegetarian`) only when the menu itself says so.
6. **Privacy.**
   No login: a visitor is a random `anonId` created on the device; it never appears in a URL, a log line or a public response.
   Location is used only after the person tapped "Near me", is rounded to 3 decimals before it leaves the device, is used for that one request and is never stored or written to an event.
   Onboarding goals and targets stay in the browser; the server sees at most the goal enum as an aggregate event property.
   Never log request bodies, photos, IPs or tokens.
7. **Abuse and cost.**
   Every write route and every expensive read has a per-IP rate limit (the skeleton's hashed-IP limiter in `worker/src/lib/rate-limit.ts`).
   Free text a user can submit goes through `worker/src/lib/word-filter.ts` before it is stored.
   Any AI call is budget-capped (`AI_DAILY_BUDGET_USD`), logged in `ai_usage`, and fails closed: an error, timeout or refusal never counts as "allowed".
   The Cloudflare Free plan's daily limits (100k Worker requests, 100k D1 written rows, 5M D1 read rows) can switch the whole app off until 01:00 Berlin time, so cache aggregate reads for 60 seconds and batch client events.
8. **Stay in your lane** (section 4) and follow `apps/web/OWNERSHIP.md` inside `apps/web/`.
9. **Done means**: typecheck, lint and tests pass; you exercised the real thing end to end (curl against `wrangler dev`, or the web app on a real phone); and the PR says exactly how you verified, with commands and output or screenshots.

## 6. Repository and starting point

Repository: https://github.com/Tonight-Plus-one-Hack/wohin (default branch `main`).

```sh
git clone https://github.com/Tonight-Plus-one-Hack/wohin.git
cd wohin
git fetch origin
```

State on Saturday 18:45 (re-check with `git fetch origin && git log --oneline -10 origin/main` every time you start a task):

| Where | What is there |
| --- | --- |
| `main` | `worker/` (router in `src/index.ts`, routes in `src/routes/`, `src/lib/` with hashed-IP rate limits, word filter, admin token check, AI usage ledger), `worker/migrations/0001_init.sql`, `packages/contract/` (`model.ts`, `api.ts`, `kieze.ts`, `geo.ts`, `hours.ts`), `apps/web/` (React + Vite PWA with onboarding, today, search and filters, map and Discover; `src/data/contract.ts`, `api.ts`, seed data, `scoring.ts`, `src/lib/ranking.ts`, `OWNERSHIP.md`), `archive/plus-one/`, `docs/plan.md` |
| PR #23, branch `fm/pipeline` | `pipeline/` (TypeScript CLI: find, menu, nutrition, check, image, review, seed, publish) and `worker/migrations/0010_pipeline_queue.sql`; open, Batu merges it |

Start every branch from `main`: `git switch -c <your-branch> origin/main`.
Only if your work needs code from the open pipeline PR, branch from `origin/fm/pipeline` instead and open your PR with `--base fm/pipeline`.
If a file or name in this prompt does not match what the code actually contains, keep the code's layout, map this prompt's names onto it, and note the mapping in your PR.

Commands (Worker, from the skeleton's `README.md` and `worker/package.json`):

```sh
npm install                                    # repo root, npm workspaces
cp worker/.dev.vars.example worker/.dev.vars   # local only, gitignored
npm run db:migrate:local                       # all migrations into local D1
npm run db:seed:local                          # made-up test restaurants
npm run dev                                    # Worker on http://localhost:8787
npm run check                                  # all workspaces: wrangler types + tsc --noEmit
npm run lint                                   # oxlint over packages and worker
npm test                                       # vitest (the Worker's tests run in workerd with local D1)
```

Web app (`apps/web/`, its own `package.json`): `npm install`, `npm run dev` (Vite, proxies `/api` to port 8787), `npm run typecheck`, `npm run lint`, `npm run build`.
Check current Cloudflare docs for exact config keys: https://developers.cloudflare.com/llms.txt.

## 7. The shared API contract

The single source of truth for API shapes is `packages/contract/src/` (`model.ts`, `api.ts`).
The web app's `apps/web/src/data/contract.ts` was written first against seed data and uses different names (price in euros, Kiez display names, `protein` instead of `proteinG`, `placeId` instead of `googlePlaceId`); the web side maps API shapes onto its own types in one adapter (`apps/web/src/data/hooks/adapt.ts`, Malek1414).
Adding an optional field or a new route is fine; renaming or removing a field needs Batu's OK.
Errors are always `{ "error": { "code": ApiErrorCode, "message": string } }` with the codes in `packages/contract/src/api.ts` (`bad_request` 400, `forbidden` 401/403, `not_found` 404, `rate_limited` 429, `unavailable` 503, `internal` 500); add `payload_too_large` 413 and `unsupported_media_type` 415 (uploads).
Money is integer cents (`priceCents`), timestamps in D1 are epoch milliseconds, in the API ISO 8601 strings.

### 7.1 Routes that exist on `main`

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/health` | - | `{ ok: true, env }` |
| `GET /api/kieze` | - | `{ kieze: { slug, name, wave, restaurantCount }[] }` |
| `GET /api/dishes/top` | `maxPriceCents`, `maxKcal`, `minProteinG`, `kiez`, `lat`, `lng`, `radiusM`, `openNow=1`, `sort` (`protein`, `protein_per_euro`, `health`, `price`), `limit` (max 50) | `{ dishes: DishListItem[], generatedAt }` |
| `GET /api/dishes/:id` | - | `{ dish, restaurant, openNow }` |
| `GET /api/restaurants` | `kiez`, `lat`, `lng`, `radiusM`, `openNow=1` | `{ restaurants: RestaurantListItem[] }` |
| `GET /api/restaurants/:id` | - | `{ restaurant, dishes, openNow }` |
| `GET /api/images/ai/:file` | - | an AI dish image from R2 |
| `POST /api/events` | `{ events: { name, at?, anonId?, props? }[] }` (max 20, props max 1000 bytes) | `{ accepted }` |
| `GET /api/admin/ai-usage` | `Authorization: Bearer <ADMIN_TOKEN>` | cost totals |

### 7.2 Routes added this weekend

Owner in brackets; full specs live in the owner's prompt and, once built, in `docs/api.md`.

| Method and path | Owner | Request | Response |
| --- | --- | --- | --- |
| `GET /api/dishes` | vinay | all filters below plus `q`, `offset` | `{ dishes: DishListItem[], total, applied, generatedAt }` |
| `GET /api/restaurants` (extended) | vinay | adds `bbox=minLng,minLat,maxLng,maxLat`, `limit` (max 300) | each item adds `topDish` (best main by protein per euro) |
| `POST /api/snaps` | vinay | `multipart/form-data`: `photo` (JPEG, max 4 MB), `anonId`, `consent=1`, optional `restaurantId`, `placeHint` (max 80 chars), `note` (max 200 chars) | 202 `{ snapId, status: "pending" }` |
| `GET /api/snaps/:id` | vinay | - | `{ snapId, status }` (status only, never the photo) |
| `GET /api/numbers` | vinay | - | `NumbersResponse` (public aggregates, edge-cached 60 s) |
| `GET /api/admin/snaps`, `GET /api/admin/snaps/:id/photo`, `POST /api/admin/snaps/:id/decision`, `POST /api/admin/snaps/:id/processed` | vinay | `ADMIN_TOKEN` | moderation queue |
| `POST /api/admin/numbers/exclude` and page `GET /team` | vinay | `ADMIN_TOKEN` + the device's `anonId` | `{ ok: true }` (team devices leave the numbers) |
| `POST /api/admin/review/sample` | Kalvarez | `ADMIN_TOKEN`, body: the pipeline's review CSV for one Kiez and reviewer | `{ kiez, reviewer, items }` |
| `GET /api/admin/review/queue` | Kalvarez | `REVIEW_TOKEN`, `?kiez=&n=` | `{ items: ReviewItem[] }` (undecided sample rows first, then audit-flagged published dishes) |
| `POST /api/admin/review` | Kalvarez | `REVIEW_TOKEN`, `{ reviewId?, dishId, verdict: "passt" \| "falsch", fields?, note?, reviewer }` | 201 `{ ok: true }` |
| `GET /api/admin/review/export` | Kalvarez | `ADMIN_TOKEN`, `?kiez=&reviewer=` | `text/csv` in the pipeline's review format with verdicts filled in, for `npm run pipeline -- review import` |
| `GET /api/admin/quality` | Kalvarez | `REVIEW_TOKEN`, `?kiez=` | per-Kiez metrics and the pass rate against the pipeline's 80 percent rule |
| `POST /api/admin/qa/run` | Kalvarez | `ADMIN_TOKEN`, `{ kiez }` | `{ kiez, dishesChecked, flags: { block, warn } }` (second-line audit over the Worker tables) |
| `POST /api/admin/kieze/:slug/hide` | Kalvarez | `ADMIN_TOKEN` | `{ slug, restaurants, dishes }` (kill switch: unpublishes the whole Kiez at once) |
| `GET /api/quality` | Kalvarez | - | public aggregate: reviewed dishes, pass rate, Kieze live, calibration vs official values (edge-cached 60 s) |
| `GET /review` | Kalvarez | review cookie (set after entering `REVIEW_TOKEN` once) | server-rendered review page for phones |

Dish search filters (`GET /api/dishes`; the web app keeps its own short URL keys from `apps/web/src/screens/filters/searchState.ts` and maps them onto these in one place):

| Query | Meaning | Default |
| --- | --- | --- |
| `kiez` | comma list of Kiez slugs from `packages/contract/src/kieze.ts` | every Kiez with published restaurants |
| `maxPriceCents` | price at or below; dishes without a price are excluded when set | none |
| `minKcal`, `maxKcal` | kcal bounds on the point estimate | none |
| `minProteinG` | minimum protein on the low end of the range | none |
| `minHealth` | minimum health score; dishes without a score are excluded | none |
| `diet` | comma list of `vegan`, `vegetarian`; all must match | none |
| `openNow=1` | only restaurants open now in Europe/Berlin; unknown hours are excluded | off |
| `lat`, `lng`, `radiusM` | centre (3 decimals) and radius 200 to 20000 m | no centre: no distance; with a centre: 3000 |
| `minConfidence` | `low`, `medium`, `high` | `medium` |
| `q` | case-insensitive match on dish or restaurant name, 2 to 40 chars | none |
| `sort` | `best`, `protein`, `protein_per_euro`, `health`, `price`, `kcal`, `distance` | `best` |
| `limit`, `offset` | `limit` 1 to 100 | 30, 0 |

`best` on the server is a simple, documented default (protein per euro on the low end, times a confidence factor of 1.0 high, 0.85 medium, 0.6 low); the personal ranking happens in the browser on top of it (Malek1414), so goals never leave the device.

### 7.3 Model additions (append-only, optional fields)

`Restaurant`: `osmId: string | null`, `baseSource: "osm" | "website" | "user_snap" | "test"`, `cuisines: string[]`.
`Dish`: `dietTags: ("vegan" | "vegetarian")[]`, `reviewStatus: "unreviewed" | "correct"` (`correct` when Kalvarez09's `review_items` hold a `passt` for that dish; the app shows "team-checked"; a `falsch` dish is never public), `nutrition.ingredients?: { name, grams, foodRef }[]` (the data behind "How is this calculated?"), and the optional extras the pipeline computes: `nutrition.fiberG`, `sugarG`, `satFatG`, `sodiumMg`.
`MenuSource.kind` gains `user_snap`.
`proteinPerEuro` is computed from the low end of the protein range in the API (`round(protein_g_min * 100.0 / price_cents, 1)`); the generated column in `0001_init.sql` uses the point estimate and is not used for ranking.

### 7.4 Visibility rule (one definition, in `worker/src/lib/visibility.ts`)

A restaurant is public only when `restaurants.published_at IS NOT NULL`.
A dish is public only when its restaurant is public, `dishes.published_at IS NOT NULL` and its nutrition is complete.
`published_at` has exactly two writers: the pipeline's `publish` step (sets it for restaurants the review approved, Batu runs it) and Kalvarez09's kill switch and single-dish hide (only ever set it to `NULL`).
No public route and no other lane writes it.

### 7.5 Events

Event names are in `EVENT_NAMES` in `packages/contract/src/api.ts` (append-only).
Existing: `app_open`, `onboarding_step`, `onboarding_complete`, `filter_change`, `map_open`, `restaurant_view`, `dish_view`, `how_calculated_open`, `directions_tap`, `share_tap`.
Added this weekend: `search_submit`, `near_me_on`, `menu_tap`, `save_dish`, `snap_start`, `snap_submit`, `snap_success`, `snap_error`.
Props never contain coordinates, free text, goals beyond the goal enum, or anything that identifies a person.

## 8. Schedule (Berlin time)

| When | What |
| --- | --- |
| Saturday 18:30 to 19:00 | Read this prompt, set up, first commit |
| **Saturday 20:00** | **First PR per teammate open** (small, against `main` or the lane base) |
| Saturday 20:00 to 22:00 | Main PRs; Batu merges the pipeline PR #23, then the lanes |
| Saturday 22:00 | Integration on staging with real wave-1 data; smoke test on real phones |
| **Saturday ~23:00** | **Live link** (production after Batu's approval); team devices excluded from the numbers first |
| Saturday 23:00 to Sunday 10:00 | Wave-1 review (your Kieze), fixes |
| **Sunday 10:00** | **Wave-1 review done**; numbers snapshot |
| Sunday 10:00 to 13:30 | Wave 2, fixes, numbers snapshot 12:00 |
| **Sunday 13:30** | **Feature freeze**; only fixes Batu approves |
| Sunday 14:00 | Final numbers export for the slides |
| **Sunday 15:30** | **Submission** (team target 15:15) |
| Sunday 15:30 to 21:00 | Keep the app up, watch logs, answer jury questions, final numbers export with timestamp at 21:00, handoff notes in every open PR |

## 9. Git and PR rules

- One branch per topic, named `<lane>/<topic>` (`qa/...`, `api/...`, `web/...`), always from a fresh base.
- Small PRs against `main`, one topic each, ideally under about 400 changed lines.
  If you had to branch from `fm/pipeline`, open the PR with `--base fm/pipeline`, say so in the title, and switch it to `main` after #23 merged (`gh pr edit <number> --base main`).
- Never push to `main`, never merge your own PR, never force-push someone else's branch; Batu merges.
- Commit messages: plain and specific; no AI co-author lines.
- Before opening a PR: `git fetch origin && git rebase <base>`, then typecheck, lint and tests.
- PR body: what it does, files and migrations it adds, how you verified (exact commands and output, screenshots for UI), what another lane must know.
- Post the PR URL in the team chat and tag Batu.
- Stuck on one thing for more than 20 minutes: post what you tried in the team chat and move to the next task.
- At the end of your time box: push everything (a draft PR if unfinished) and write in the PR body what works, what does not, and the next three steps.

## 10. Your tasks

Your files: `apps/web/src/lib/ranking.ts` (today the Discover and map query builder: `rankingFilters`, `rankingTitle`, `BUDGET_EUR`, used by `screens/home/HomeScreen.tsx` and `screens/map/MapScreen.tsx`), `apps/web/src/lib/ranking/`, `apps/web/src/lib/filters/`, `apps/web/src/screens/snap/`, `apps/web/src/data/hooks/`, tests next to them (`*.test.ts`), `docs/decisions/0060-web-*.md`.
In your first PR, move `src/lib/ranking.ts` to `src/lib/ranking/index.ts` with `git mv` and no content change: with `moduleResolution: "bundler"` the existing imports of `../../lib/ranking` keep working (prove it with `npm run typecheck` and `npm run build`), and your new modules sit next to it; say so in the PR, because `OWNERSHIP.md` treats `src/lib/*` as append-only.
Keep every existing export of that file and its meaning; Home and Map depend on them.
Append-only in shared web files, per `apps/web/OWNERSHIP.md`: new rows in `OWNERSHIP.md` for your four folders, the `snap` route at the end of `src/lib/routes.ts` and `src/App.tsx`, new optional fields or union members in `src/data/contract.ts`, and `src/data/scoring.ts` (OWNERSHIP lets the app-logic lane replace `healthScore` keeping its signature).
Changing a function body in `src/data/api.ts` or adding a dependency to `package.json` needs Batu's OK in the PR.
Base: `origin/main`.
Read first: `apps/web/OWNERSHIP.md`, `src/data/contract.ts`, `src/data/api.ts`, `src/data/mock.ts`, `src/data/scoring.ts`, `src/data/hours.ts`, `src/lib/ranking.ts`, `src/lib/profile.ts`, `src/lib/position.ts`, `src/lib/location.ts`, `src/lib/resource.ts`, `src/lib/saved.ts`, `src/lib/routes.ts`, `src/components/Flow.tsx`, `src/components/ui.tsx`, and the search screen's state (`src/screens/filters/searchState.ts`, `useSearchState.ts`, `queries.ts`), which already owns the URL keys, the filter chips and the live counts.
Also read the pipeline's health score on PR #23: `git fetch origin fm/pipeline && git show origin/fm/pipeline:pipeline/src/nutrition/calc.ts`.

Tests: `apps/web` has no test runner yet.
Add `vitest` as a dev dependency (same major as `worker/`, `~4.1`) and a `"test": "vitest run"` script in your first PR, and ask Batu for the OK in the PR body; all your logic is pure TypeScript, so tests run in Node without a browser.

### Task A: health score, protein per euro and the personal ranking (first PR by Saturday 20:00, branch `web/ranking`)

`src/lib/ranking/health.ts`: the health score on the web, matching the pipeline.

- The pipeline's `healthScore` in `pipeline/src/nutrition/calc.ts` (PR #23) is canonical: it is computed from the recipe (protein share, fibre per 1000 kcal, vegetable, fruit and legume share, saturated fat, sugar, fried or processed-meat share, portion size) and stored with every real dish.
  The web always shows the stored value when the API sends one.
- Port that function to TypeScript in `health.ts` as the fallback for seed and test data, with `vegShare` and `friedShare` defaulting to 0 when unknown (document that), and make `healthScore` in `src/data/scoring.ts` delegate to it, keeping its signature (append optional `fiber`, `sugar`, `satFat` to `NutritionEstimate` in `contract.ts`).
- `explainHealthScore(dish)` returns the components (`{ key, label, points }[]`) for the "How is the score calculated?" sheet, from the values the dish has; say "vegetable share and fried share come from the recipe" when they are not available on the device.
- `src/lib/ranking/health.vectors.json`: at least 12 input and output pairs generated by calling the pipeline's own function on `fm/pipeline` (never hand-computed), including the 10 dean&david bowls with official values (Salmon Avocado Bowl 806 kcal 27 g protein 46 g fat, California Poke Bowl 1023/23/60, Japanese Beef Bowl 1053/27/63, Crunchy Chicken Bowl 785/29/40, Chicken Teriyaki Bowl 680/25/22, Avocado Chicken Bowl 571/23/26, Vegan Falafel Bowl 696/16/36, Veggie Buddha Bowl 883/20/48, Hot Kebab Wrap 609/23/25, Hot Chicken Teriyaki Wrap 544/24/17); your port must reproduce every vector.
- `docs/decisions/0060-web-health-score.md`: the formula in plain words, one worked example, and the rule "stored value first, fallback only for seed data"; this also feeds the "How is this calculated?" sheet.

`src/lib/ranking/proteinPerEuro.ts`: grams of protein per euro from the **low end** of the protein range, one decimal; `null` without a price or with a price of 0; never `Infinity` or `NaN`.

`src/lib/ranking/fit.ts`: the personal ranking, computed on the device so goals never leave it.

```ts
export type FitContext = { now: Date; near?: LatLng | null };
export type FitReason = { key: 'protein' | 'value' | 'kcal' | 'health' | 'budget' | 'distance' | 'open' | 'confidence'; label: string; points: number };
export type RankedDish = DishResult & { fit: number; reasons: FitReason[] };
export function rankDishes(results: DishResult[], profile: Profile | null, ctx: FitContext): RankedDish[];
```

- Per-meal targets from `src/lib/profile.ts`: 35 percent of the daily `kcalTarget` and `proteinTarget`; without a profile use the `maintain` defaults.
- Goal weights: `gain` favours low-end protein and protein per euro; `lose` favours kcal at or below the per-meal target with good protein density; `maintain` favours the health score.
- Budget: full points at or below `mealBudget`, fading to 0 at 1.5 times the budget; a dish without a price gets a small fixed penalty, not zero.
- Distance (only with `near`): walking minutes at 80 m per minute; full points up to 5 minutes, 0 at 25.
- Open now: closed restaurants drop below every open one; unknown hours rank after open ones.
- Confidence multiplies the total: 1.0 high, 0.85 medium, 0.6 low.
- Diversity: at most 2 dishes per restaurant in the top 10.
- Wire it without touching screens: append `'fit'` to the `DishSort` union in `contract.ts`; in the data layer (task C) a `topDishes` call with `sort: 'fit'` asks the API for `sort=best` and re-ranks the result with `rankDishes` and the device's profile; then switch `rankingFilters()` in your `src/lib/ranking/index.ts` from `sort: 'protein'` to `sort: 'fit'` once it is tested, so Home and Map get the personal order through the call they already make.
- Deterministic: ties break on dish id; the same input always gives the same order.
- `reasons` are short, human labels for "Why this rank?" (for example "38 g protein", "4.0 g per EUR", "under your 12 EUR budget", "6 min walk", "open until 22:00"), in German and English via the app's existing copy approach (ask Batu's shell agent which one, default German).
- `src/lib/ranking/README.md`: how screens use it, in five lines.

### Task B: one filter semantics for seed and API (branch `web/filters`)

The search screen (`src/screens/filters/`, owned by Batu's filters agent) already has the URL state (`q`, `sort`, `priceMax`, `kcalMax`, `proteinMin`, `scoreMin`, `diet`, `open`, `dist`, `kiez`), the chips and the live counts, and Home and Map build their filters with `rankingFilters()`.
Do not rebuild any of that and do not edit `src/screens/filters/`.
Your `src/lib/filters/` is the one place that defines what a `DishFilters` object means, so seed mode and API mode return the same dishes:

- `toApiQuery(filters: DishFilters): URLSearchParams` for `GET /api/dishes` (section 7.2): euros to `maxPriceCents`, Kiez display names to slugs (append the missing wave-2 Kieze Wedding, Moabit and Wilmersdorf to `KIEZE` in `contract.ts`), `proteinMin` to `minProteinG`, `healthScoreMin` to `minHealth`, `maxDistance` to `radiusM`, `near` rounded to 3 decimals to `lat`/`lng`, and the sort names (`proteinPerEuro` to `protein_per_euro`, `healthScore` to `health`, `fit` to `best`); use vinaynaik432-debug's `dishSearchParams` from `packages/contract` once it exists.
- `matchDish(result, filters, now)`: the predicate with the API's rules: unknown hours never count as open, dishes without a price drop out of price filters, `proteinMin` uses the low end of the range, `minConfidence` defaults to `medium`.
  Propose in your PR that `src/data/mock.ts` delegates to it (a body change in a shell file, so Batu's OK).
- `normalizeFilters(filters)`: clamps hand-edited values (kcal 0 to 3000, protein 0 to 200, price 0 to 100 EUR, distance 200 to 20000 m, unknown Kiez dropped) so a shared link never breaks a screen.
- Near me: the position is requested only after a tap (`src/lib/location.ts`, `position.ts`), rounded to 3 decimals before it leaves the device (`roundNear` already exists in `ranking.ts`), and never put into an event.
- If the filters screen needs something from you (for example a `sort=fit` option), write it down in the PR for Batu to relay.

### Task C: data hooks and the switch from seed to API (branch `web/data-hooks`, PR by Saturday 21:30)

`src/data/hooks/`:

- `http.ts`: a small `fetch` client for the same origin: JSON only, 8 s timeout with `AbortController`, one retry on a network error for GET, maps the API error shape to a typed `ApiError`, never logs bodies.
- `adapt.ts`: the one place that maps API shapes (`packages/contract`) onto the web types (`src/data/contract.ts`): cents to euros, Kiez slug to display name (append the missing wave-2 Kieze to `KIEZE` in `contract.ts`), `proteinG` to `protein`, `googlePlaceId` to `placeId`, `osmId`, `baseSource`, menu source kinds (`website_*` to `website`, `user_snap`), `isTestData` from `baseSource === 'test'`, `nutrition.ingredients` `{ name, grams }` to the web's `Ingredient` `{ name, amount, unit: 'g' }`, `healthScore` null to "no score" (never 0), `proteinPerEuro` recomputed with task A if missing.
  Unit-test it with fixtures copied from vinaynaik432-debug's `docs/api.md` examples.
- `remote.ts`: the four existing `api.ts` functions (`listRestaurants`, `getRestaurant`, `getDish`, `topDishes`) implemented against the Worker through `http.ts`, `adapt.ts` and `toApiQuery`, plus `searchDishes(filters)` and `getNumbers()`.
- `source.ts`: `VITE_DATA_SOURCE` = `seed` (default in `npm run dev`) or `api` (production build); the switch is a 4-line delegation in `src/data/api.ts` that keeps every signature; propose it in your PR and get Batu's OK, because `api.ts` is shell-owned.
- Hooks for screens, Suspense-compatible through `useResource` and `filtersKey`: `useTopDishes(filters)`, `useDishSearch(filters)`, `useRestaurants(filters | bbox)`, `useRestaurant(id)`, `useDish(id)`; each returns the ranked list from task A where it makes sense.
- `track.ts`: `track(name, props?)` for the events in section 7.5.
  Create the `anonId` once with `crypto.randomUUID()` in `localStorage` under `wohin.anonId` (vinaynaik432-debug's `/team` page reads the same key); queue events, flush up to 20 per `POST /api/events` every 10 seconds and on `visibilitychange` to hidden with `navigator.sendBeacon`; drop events when storage is unavailable; props are only enums, ids and numbers.
  Tell the screen agents (through Batu) which events to call where: `dish_view`, `restaurant_view`, `how_calculated_open`, `directions_tap`, `menu_tap`, `share_tap`, `save_dish`, `filter_change`, `near_me_on`.

### Task D: the "snap a menu" flow (branch `web/snap`, PR by Saturday 22:30)

Route `/snap` and `/snap?r=<restaurantId>` (append `snap: (restaurantId?) => ...` to `paths` and the route to `App.tsx`); `SnapScreen` lives in `src/screens/snap/` with its own CSS, built with `components/Flow.tsx` (one step per screen) and `components/ui.tsx`, design tokens only, no new dependencies.

Steps:

1. **Why**: "Menu missing or outdated? Send a photo of the printed menu. We check it, add the dishes with prices and estimates, and delete the photo after 30 days." Privacy line: printed menus only, no people, no receipts or cards.
2. **Capture**: `<input type="file" accept="image/*" capture="environment">` plus a "choose from gallery" option; large touch targets.
3. **Preview**: show the processed image; rotate 90 degrees if needed; pick the restaurant (search existing ones by name through `useDishSearch`/`useRestaurants`, or type a place name for `placeHint`); optional note; the consent checkbox ("This is a printed or displayed menu and no people or personal data are visible").
4. **Upload**: `XMLHttpRequest` with a progress bar (fetch has no upload progress), one automatic retry, then a manual retry button; disable double submits.
5. **Thanks**: "Thanks! We review new menus within a few hours." Show the `snapId` status later from `localStorage` ("your menus: 1 checking, 2 added"), and a share prompt ("Know a place with a great menu? Send this link to a friend").

Client-side image processing (`src/screens/snap/image.ts`, pure where possible, unit-tested):

- Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })` so EXIF rotation is applied, then draw onto a canvas with the long edge at most 2000 px and export `canvas.toBlob('image/jpeg', 0.82)`.
  Re-encoding drops all EXIF and GPS data; the server strips again as a second line of defence.
- If the result is above 4 MB, lower the quality in steps (0.72, 0.62) before giving up with a clear message.
- If decoding fails (some HEIC files on older browsers), say "Please take the photo with the camera button" instead of failing silently.

Errors to handle with friendly copy: 413 (too big), 415 (not a photo), 429 (too many uploads, try again in a minute), 503 (uploads paused for today), offline.
Events: `snap_start`, `snap_submit`, `snap_success`, `snap_error` with `{ step, code }` only.
Accessibility: every control labeled, focus moves to the step heading, respects reduced motion, works one-handed on a 375 px wide screen.
Entry points (ask the screen agents through Batu): a "Menu missing or outdated?" link on the restaurant screen, the empty state of search, and the "Ich"/today screen.

### Task E: review duty (human step, Saturday 23:00 to Sunday 10:00)

Review Friedrichshain and Neukölln in Kalvarez09's review page (`/review?kiez=friedrichshain`, `/review?kiez=neukoelln`) with the `REVIEW_TOKEN` Batu gives you in person or by private message.
About 20 minutes per Kiez: name and price must match the source exactly, nutrition must be plausible; mark wrong and write why when unsure.
Then open `/team` on every phone and laptop you tested with, so your devices leave the numbers.

## 11. Definition of done

- Tasks A to D merged (or open with green checks and Batu's go); `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` pass in `apps/web`.
- In API mode against staging, on a real iPhone (Safari) and a real Android phone (Chrome): Discover and the map show the personal order with reasons, every filter on the search screen returns the same dishes in seed and API mode, near me asks for permission only after the tap, and a menu photo taken with the camera uploads and shows up in vinaynaik432-debug's admin queue without GPS data.
- Screenshots of the snap flow (each step) and of a ranked list with reasons in the PR.
- Friedrichshain and Neukölln reviewed by Sunday 10:00.

Tests you must have:

- `health.test.ts` reproduces every pipeline-generated vector and never leaves 0 to 100; the stored score wins over the fallback in the adapter.
- `proteinPerEuro.test.ts`: low end used, `null` for no price and price 0.
- `fit.test.ts`: each goal ranks a protein-heavy, a light and a balanced dish in the expected order; budget, distance, open-now and confidence move dishes the expected way; at most 2 per restaurant in the top 10; deterministic order.
- `filters.test.ts`: `toApiQuery` for a broad table of filters (every field and sort); clamping; `matchDish` agrees with the API rules on the seed (open now, no price, low-end protein, confidence).
- `adapt.test.ts`: every mapping, including null price, null health score, unknown Kiez, and `user_snap` sources.
- `image.test.ts`: the size and quality steps (mock the canvas), and a JPEG with GPS EXIF comes out without it (check the bytes for `Exif`).
- `track.test.ts`: batching, flush on hidden, no coordinates or free text in props.

## 12. What not to touch

- Other screen folders in `apps/web/src/screens/` (Batu's screen agents; this includes the search screen's URL state in `screens/filters/`), `src/app/`, `src/styles/base.css`, `src/motion/`, `public/`, `index.html`, `vite.config.ts`, except the append-only cases above.
- `worker/`, `packages/contract/` (ask vinaynaik432-debug), `pipeline/`, `archive/`, `brand/`, `docs/design/`, `docs/team-prompts/`.
- Never send the profile, goals, targets, coordinates or free text to the server or into events; never add analytics SDKs; never put a key or token into the web bundle or a `VITE_*` variable.
- Never show a snap photo publicly, never show Google content on the MapLibre map, never show an estimate without its range and "AI estimate" label.
