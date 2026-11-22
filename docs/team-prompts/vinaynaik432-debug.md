# vinaynaik432-debug: Worker API, D1 schema and endpoints

You are the coding agent for GitHub user `vinaynaik432-debug` on the hackathon team.
This is a paste-ready brief: read all of it before you start, then work through section 10 in order.
It replaces every earlier brief (the Plus One prompts are archived under `archive/plus-one/`).
Work autonomously; ask your human only for the steps marked "human step".

**Your goal:** the web app gets everything it needs from one Cloudflare Worker, fast, safe and within the Free plan: restaurants, dishes, search with every filter, top dishes, the menu snap upload (R2, moderation, rate limits), analytics events and public numbers, and the admin routes.
You build on the restructure agent's `worker/` skeleton (merged to `main` in #17) and own the D1 schema additions in migrations `0040-0049`.

**Why it matters for the 5K scoring:** the live link is the submission.
Every screen the jury opens calls your routes; a slow or failing search, or an app switched off by the Free plan's daily limits, ends the demo.
`GET /api/numbers` is where our "real user numbers" for the slides come from, so it has to be honest (team devices excluded, bots damped) and cheap to read.
The snap upload is the growth loop: visitors add menus we could not fetch, so its safety (no personal photos leak, no abuse, no cost blow-up) is on you.

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

Your files: `worker/src/routes/`, `worker/src/lib/`, `worker/src/db.ts`, `worker/src/index.ts` (the `// [api]` block and the router itself), `worker/wrangler.jsonc`, `worker/.dev.vars.example` (names only), `worker/seed/`, `worker/migrations/0040-0049`, `worker/test/` (your own files), `docs/api.md`, `docs/decisions/0040-*.md`, and `packages/contract/src/api.ts` and `packages/contract/src/model.ts` (append-only: new optional fields, new types, new routes).
Base: `origin/main`.
Read the skeleton first: `worker/src/index.ts` (router and per-route limiter), `worker/src/routes/catalog.ts`, `worker/src/db.ts`, `worker/src/lib/`, `packages/contract/src/`, and on PR #23 (`git fetch origin fm/pipeline`) `pipeline/src/export/publish.ts`, which is what writes your tables.

### Task A: contract alignment and the data-basis columns (first PR by Saturday 20:00, branch `api/contract-align`)

1. Compare `packages/contract/src/model.ts` and `api.ts` with `apps/web/src/data/contract.ts` and `api.ts` (all on `main`); the pipeline's `seed` output follows the web contract and its `publish` follows `0001_init.sql`, so the API is where the two meet.
   Write `docs/api.md` with: every route (section 7), a field mapping table (web name, API name, D1 column, notes) and the list of differences.
   Known differences to cover: price in euros vs `priceCents`; Kiez display names vs slugs; `protein`/`carbs`/`fat` vs `proteinG`/`carbsG`/`fatG`; `placeId` vs `googlePlaceId`; `osmId` and `baseSource` missing in the API; menu source kinds (`website`, `user_snap` vs `website_html`, `website_pdf`, ...); `healthScore` nullable in the API, not in the web; diet tags; `proteinPerEuro` from the point estimate (skeleton) vs the low end (web).
   The API keeps the contract package's names; Malek1414 maps them in the web adapter.
2. Migration `worker/migrations/0040_osm_base.sql` (append-only `ALTER TABLE ... ADD COLUMN`, unique constraints as indexes):
   `restaurants`: `osm_id TEXT` (unique index where not null, for example `node/3036860655`), `base_source TEXT NOT NULL DEFAULT 'osm' CHECK (base_source IN ('osm','website','user_snap','test'))`, `cuisines TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cuisines))`.
   `dishes`: `diet_tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(diet_tags))`, `course TEXT CHECK (course IS NULL OR course IN ('main','starter','side','dessert','drink'))`, and the values the pipeline already computes but `0001` has no column for: `fiber_g REAL`, `sugar_g REAL`, `sat_fat_g REAL`, `sodium_mg REAL`.
   Human step: send Batu the column list so the pipeline agent writes them in `publish` (its restaurant ids are already `osm:node/<id>`, so `osm_id` is easy to fill).
3. Model additions in `packages/contract/src/model.ts` from section 7.3, mapped in `worker/src/db.ts` (`toRestaurant`, `toDish`); `Nutrition.ingredients` comes from the existing `dishes.ingredients` JSON column.
4. `0001_init.sql` is merged, so: add `user_snap` to the `menu_sources.kind` CHECK yourself in `0041_menu_sources_user_snap.sql` (SQLite cannot alter a CHECK: create the new table, copy, drop, rename, recreate the indexes, in one migration, with `PRAGMA foreign_keys` handled as the D1 docs describe), and compute `proteinPerEuro` in SQL as `round(protein_g_min * 100.0 / price_cents, 1)` instead of reading the generated column (which uses the point estimate).
5. Extend `worker/seed/dev.sql` so local dev has 2 Kieze, at least 8 made-up restaurants (`base_source = 'test'`) and 40 dishes covering every filter: with and without price, every confidence, vegan and vegetarian, opening hours that include and exclude "now", one restaurant without coordinates, one dish with an official source.

### Task B: search and the read routes (branch `api/search`, PR by Saturday 21:00)

`GET /api/dishes`: the full search from section 7.2.

- Parser `parseDishSearchQuery(params)` in `packages/contract/src/api.ts`, built like the existing `parseTopDishesQuery` (no zod; the skeleton parses by hand), with a matching `dishSearchParams(query)` serializer so the web builds URLs with the same code; unit tests for every parameter, bounds and error message.
- One SQL query with binds only (never string-concatenate user input): visibility rule from `worker/src/lib/visibility.ts` (create it, section 7.4), Kiez list, price, kcal, protein on `protein_g_min`, health, diet (`json_each` on `diet_tags`), confidence, `q` with `LIKE ? ESCAPE '\'` on dish and restaurant name (escape `%` and `_`), bounding-box prefilter when a centre is set.
  Then in TypeScript: exact distance (`distanceMeters`), radius, `isOpenAt` (it already evaluates in `APP_TIME_ZONE`, Europe/Berlin; keep it that way and cover a past-midnight period in a test), sorting, `offset`/`limit`, `total`.
- `sort=best`: low-end protein per euro times the confidence factor (1.0, 0.85, 0.6); dishes without a price sort last.
  `sort=distance` requires a centre (400 otherwise).
- Response `{ dishes, total, applied, generatedAt }`; `applied` echoes the parsed query so the web renders filter chips from it.
- Keep candidate reads bounded (the skeleton uses 500); add the indexes you need in `0042_search_indexes.sql` and check the plan with `EXPLAIN QUERY PLAN` on the seed.

Also:

- `GET /api/restaurants`: add `bbox=minLng,minLat,maxLng,maxLat` (the map viewport; reject boxes larger than about 20 km), `limit` (default 200, max 300), `cuisines`, `osmId`, `baseSource`, and `topDish` (the best public main by low-end protein per euro, `null` if none).
- `GET /api/dishes/top` keeps working unchanged for the home feed (default `maxPriceCents=1200` is sent by the client, not assumed by the server).
- Every public read: `LIMIT_READ` rate limit, `Cache-Control: public, max-age=60`, and the visibility rule.

### Task C: menu snap upload with R2, moderation and rate limits (branch `api/snaps`, PR by Saturday 22:00)

`POST /api/snaps`, `multipart/form-data`:

| Field | Rule |
| --- | --- |
| `photo` | required; `image/jpeg` only (the client re-encodes every photo to JPEG, which also drops EXIF); at most 4 MB |
| `anonId` | required; same pattern as events (`^[A-Za-z0-9_-]{8,64}$`) |
| `consent` | required, `1`: the person confirmed it is a printed menu and no people or personal data are visible |
| `restaurantId` | optional; must be an existing restaurant id |
| `placeHint` | optional; at most 80 characters, word-filtered (for a place we do not know yet) |
| `note` | optional; at most 200 characters, word-filtered |

Checks, in this order, each with the right error code:

1. Method and `Content-Type: multipart/form-data`, else 415.
2. Rate limits: a new binding `LIMIT_UPLOAD` (3 per 60 s per hashed IP) in `wrangler.jsonc` for every env; a daily cap of 10 snaps per IP hash (count in D1); a global daily cap `SNAPS_DAILY_CAP` (var, default 300) answering 503 `unavailable` with a friendly message.
3. `Content-Length` above 4.5 MB: 413 before reading the body; then read with `request.formData()` and re-check the file size.
4. Magic bytes: the file must start with `FF D8 FF`; anything else is 415, whatever the declared type says.
5. Metadata strip, server side as the second line of defence: walk the JPEG segments and drop every `APP1` to `APP15` segment except `APP2` ICC profiles, and every `COM` segment (`worker/src/lib/jpeg.ts`, pure, unit-tested with a fixture that contains GPS EXIF).
6. SHA-256 of the stripped bytes; a snap with the same hash that is not `deleted` returns its existing `snapId` (idempotent retries).
7. Store in a new private R2 bucket binding `SNAPS` (`wohin-snaps-dev`, `-staging`, prod; never public, never under `/api/images`), key `snaps/<YYYY-MM-DD>/<uuid>.jpg`, with `httpMetadata.contentType = "image/jpeg"`.
8. Insert the `menu_snaps` row (`0043_menu_snaps.sql`) and answer 202 `{ snapId, status: "pending" }`.

```sql
CREATE TABLE menu_snaps (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'processed', 'deleted')),
  r2_key TEXT,                                   -- NULL once the photo is deleted
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,                         -- today's salted hash, for the per-IP daily cap only
  anon_id TEXT NOT NULL,                         -- for "my snaps" counts in numbers; never returned publicly
  restaurant_id TEXT REFERENCES restaurants (id) ON DELETE SET NULL,
  place_hint TEXT, note TEXT,
  moderation TEXT CHECK (moderation IS NULL OR json_valid(moderation)),
  decided_by TEXT, reject_reason TEXT, menu_source_id TEXT,
  created_at INTEGER NOT NULL, decided_at INTEGER, processed_at INTEGER
);
CREATE INDEX menu_snaps_status_idx ON menu_snaps (status, created_at);
CREATE INDEX menu_snaps_ip_idx ON menu_snaps (ip_hash, created_at);
CREATE UNIQUE INDEX menu_snaps_sha_idx ON menu_snaps (sha256) WHERE status <> 'deleted';
```

Moderation, in layers:

1. Deterministic (always on): the checks above, plus the word filter on `placeHint` and `note`.
2. Human (always on): nothing from a snap becomes public until an admin accepted it.
   `GET /api/admin/snaps?status=pending&limit=` lists snaps; `GET /api/admin/snaps/:id/photo` streams the R2 object with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`; `POST /api/admin/snaps/:id/decision` with `{ decision: "accept" | "reject", restaurantId?, reason? }` sets the status, and a reject deletes the R2 object and sets `r2_key = NULL`.
3. The central pipeline (Batu's agent, which holds the AI keys) fetches accepted snaps through `GET /api/admin/snaps?status=accepted`, extracts the dishes into a `menu_sources` row of kind `user_snap`, and calls `POST /api/admin/snaps/:id/processed` with `{ menuSourceId }`.
4. Optional AI pre-check in the Worker, off by default: only if Batu sets the Worker secret `ANTHROPIC_API_KEY` and the var `SNAP_AI_PRECHECK=1`.
   Then, in `ctx.waitUntil` after storing, ask a vision model "is this a printed or displayed restaurant menu; does it show identifiable people, documents, payment cards or screens with personal data" with structured JSON output; only a clear "not a menu" or "unsafe" auto-rejects (and deletes the photo); a refusal, error, timeout or exhausted `AI_DAILY_BUDGET_USD` leaves the snap `pending` for a human (fail closed, never auto-accept).
   Log every call through `worker/src/lib/ai-usage.ts`; build the request body for the configured model so switching models cannot silently break it.

Retention: a scheduled handler (`triggers.crons`, daily) deletes R2 photos of `rejected` snaps older than 1 day and of `processed` snaps older than 30 days, and sets their status to `deleted`.
`GET /api/snaps/:id` returns only `{ snapId, status }` (the id is a random UUID).
Send Batu the privacy facts for the Datenschutz page: what is stored, why, for how long, and that photos are never shown publicly.

### Task D: events and numbers (branch `api/numbers`, PR by Saturday 22:00)

1. Append the new event names from section 7.5 to `EVENT_NAMES`.
2. `0044_numbers.sql`: `numbers_excluded (anon_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)` and an index `events_anon_idx ON events (anon_id, name)`.
3. `GET /api/numbers` (public, `LIMIT_READ`, edge-cached 60 seconds with `caches.default` so the D1 queries run at most once per minute per colo):

```ts
type NumbersResponse = {
  generatedAt: string;
  since: string;                 // the launch time, from the var NUMBERS_SINCE (ISO)
  visitors: number;              // distinct anonId with app_open
  engaged: number;               // distinct anonId with at least one dish_view, restaurant_view or filter_change
  onboarded: number;             // distinct anonId with onboarding_complete
  decided: number;               // distinct anonId with directions_tap or menu_tap: they picked a place
  shared: number;                // distinct anonId with share_tap
  snapsSubmitted: number;        // menu_snaps rows since `since`
  snapsAccepted: number;         // accepted or processed
  events: Record<string, number>;  // totals per event name
  catalogue: { kiezeLive: number; restaurants: number; dishes: number };   // public rows only
};
```

   Every count excludes `numbers_excluded` devices and events without an `anonId`.
   The slides use `engaged` and `decided`, which a script is far less likely to inflate than `visitors`.
4. Team exclusion: `POST /api/admin/numbers/exclude` (`ADMIN_TOKEN`, body `{ anonId }`), and a tiny server-rendered page `GET /team` (add `/team` to `run_worker_first`): a token field, a button, and inline JS that reads the device's anon id from `localStorage` (key agreed with Malek1414, default `wohin.anonId`) and calls the route with the token in the `Authorization` header, never in the URL.
   Human step: every team member opens `/team` on every phone and laptop they test with, before the live link goes out.
5. Keep `POST /api/events` as is (batched, `LIMIT_EVENTS`); Malek1414's client batches up to 20 events per request.

### Task E: admin, security headers and staging (branch `api/ops`)

- `GET /api/admin/overview` (`ADMIN_TOKEN`): per Kiez restaurants, published restaurants, dishes, published dishes, pending snaps; plus today's AI spend from `ai_usage`.
- Security headers on every Worker response (`worker/src/lib/http.ts`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self)`; HTML pages from the Worker (`/team`) also get a CSP and `frame-ancestors 'none'`.
- `wrangler.jsonc`: add the `SNAPS` bucket, the `LIMIT_UPLOAD` binding, the vars `SNAPS_DAILY_CAP`, `SNAP_AI_PRECHECK` (`"0"`), `NUMBERS_SINCE`, the daily cron, and `/team` in `run_worker_first`, for dev, staging and production.
  `worker/.dev.vars.example`: add `REVIEW_TOKEN=` and `ANTHROPIC_API_KEY=` (names only, with a comment that the AI key stays empty locally unless Batu says otherwise).
- Human step for Batu (list it in your PR): create the staging and production D1 databases and R2 buckets, send you the `database_id` values (not secrets), set the secrets `ADMIN_TOKEN` and `REVIEW_TOKEN` (`openssl rand -base64 32` each) and, only if he wants the AI pre-check, `ANTHROPIC_API_KEY`.
- The pipeline's AI dish images are keyed `ai/<slug>-<hash>.webp`, which `GET /api/images/ai/:file` already serves; list the `wrangler r2 object put` commands for uploading them to the `IMAGES` bucket in `docs/api.md` (Batu or the pipeline agent runs them).
- With Batu's access: deploy to staging, apply migrations remotely to staging, load the real wave-1 data the pipeline published, and run your curl checklist (below) against the staging URL by Saturday 22:00.

### Your curl checklist (put it in `docs/api.md` and run it against `wrangler dev` and staging)

```sh
B=http://localhost:8787
curl -s "$B/api/health"
curl -s "$B/api/kieze"
curl -s "$B/api/dishes?kiez=kreuzberg,neukoelln&maxPriceCents=1200&minProteinG=25&openNow=1&sort=best&limit=5"
curl -s "$B/api/dishes?lat=52.499&lng=13.418&radiusM=1500&sort=distance"
curl -s "$B/api/dishes?q=bowl&diet=vegan&minConfidence=high"
curl -s "$B/api/restaurants?bbox=13.38,52.48,13.44,52.51&limit=50"
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/dishes?radiusM=500"           # 400: radius without centre
curl -s -F photo=@test/fixtures/menu-with-gps.jpg -F anonId=devtest1234 -F consent=1 "$B/api/snaps"   # 202
curl -s -o /dev/null -w "%{http_code}\n" -F photo=@test/fixtures/not-a-jpeg.png -F anonId=devtest1234 -F consent=1 "$B/api/snaps"   # 415
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$B/api/admin/snaps?status=pending"
curl -s "$B/api/numbers"
```

## 11. Definition of done

- Tasks A to E merged (or open with green checks and Batu's go), `docs/api.md` complete and matching the code.
- `npm run check`, `npm run lint` and `npm test` pass after rebasing on `origin/main`.
- The curl checklist passes against staging, and the web app (Malek1414's hooks in API mode) loads home, map, search, restaurant and dish from staging on a real phone.
- A snap uploaded from a real phone arrives in the admin queue without EXIF (download it from the admin photo route and check with `exiftool`: no GPS, no camera model).
- `GET /api/numbers` excludes every team device before the live link (about 23:00).

Tests you must have (`worker/test/`, in workerd via `SELF.fetch`, migrations applied, seed loaded):

- Parser tests for every query parameter of `GET /api/dishes`, including bounds and error messages.
- Search: each filter alone and combined; unpublished restaurants and dishes never appear; `openNow` with a fixed clock (pass `now` into the handler so tests can control it); unknown hours are excluded from `openNow=1`; dishes without price are excluded when `maxPriceCents` is set; `total` and `offset` agree.
- Restaurants: `bbox` too large is 400; `topDish` is the best public main.
- Snaps: 415 for wrong type or magic bytes, 413 for oversize, 400 without consent or with a bad `anonId`, 429 after the per-IP limit, 503 after the global cap, EXIF and GPS gone from the stored object, duplicate upload returns the same `snapId`, admin routes 401 without token, reject deletes the R2 object, the cron deletes expired photos.
- Numbers: excluded devices do not count; events without `anonId` do not count; the second call within 60 seconds is served from cache.
- Headers: every response has the security headers; `/team` has a CSP.

## 12. What not to touch

- `apps/web/` (Batu's web agents and Malek1414), `pipeline/` and `worker/migrations/0010-0029` (pipeline agent), `worker/migrations/0001-0009` (merged; never edit, fix forward in your range), `worker/migrations/0030-0039`, `worker/src/review/`, `worker/src/qa/` (Kalvarez09), `archive/`, `brand/`, `docs/design/`, `docs/team-prompts/`.
- Never add a public route that returns a snap photo, a reviewer, an `anonId`, an IP hash or raw events.
- Never add a Google rating, photo, photo reference, Google hours, name or address field or column.
- Never call an AI model or the Places API from a public request path; the only AI call allowed in the Worker is the optional, flag-gated snap pre-check.
- Never write `published_at` (only the pipeline's `publish` and Kalvarez09's kill switch do); never deploy to production; never store or print a key or token.
