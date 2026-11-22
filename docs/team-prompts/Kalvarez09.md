# Kalvarez09: review tooling, data quality and the Kiez rollout

You are the coding agent for GitHub user `Kalvarez09` on the hackathon team.
This is a paste-ready brief: read all of it before you start, then work through section 10 in order.
It replaces every earlier brief (the Plus One prompts are archived under `archive/plus-one/`).
Work autonomously; ask your human only for the steps marked "human step".

**Your goal:** no Kiez goes public without a measured, team-reviewed sample, every "wrong" verdict flows back into the data, and we can show the jury honest quality numbers.
The pipeline (Batu's agent, PR #23) already picks a review sample per Kiez and approves a Kiez at 80 percent `passt`, but today that means hand-editing a CSV.
You build the phone-friendly review page around that sample (verdicts written to D1 and handed back to the pipeline), a second-line audit of the published data (outlier rules agreed with the pipeline agent), the quality metrics, and the kill switch per Kiez.
You also own the Kiez assignment for the whole team and review Mitte and Kreuzberg yourself.

**Why it matters for the 5K scoring:** the jury will open dishes on the live link.
One absurd value ("Caesar salad, 2,400 kcal, 3 EUR") kills the trust story; a slide line like "312 dishes reviewed by the team, 91 percent correct, AI kcal error 15 percent against official values" makes it.
Your kill switch is our safety net: if a Kiez turns out bad during the jury demo, one call hides it.

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

Your files: `worker/src/review/`, `worker/src/qa/`, `packages/contract/src/review.ts`, `worker/migrations/0030-0039`, `worker/test/review*.test.ts`, `worker/test/qa*.test.ts`, `worker/test/fixtures/review*`, `docs/quality/`, `docs/decisions/0030-*.md`.
Append-only in shared files: your marked `// [review]` block in `worker/src/index.ts`, and `"/review*"` in `run_worker_first` in `worker/wrangler.jsonc` (coordinate both with vinaynaik432-debug, who owns those files).
Base: `origin/main`.
Read first: `worker/src/index.ts`, `worker/src/lib/` (`admin.ts`, `http.ts`, `rate-limit.ts`, `word-filter.ts`), `worker/migrations/0001_init.sql`, and on PR #23 (`git fetch origin fm/pipeline`): `pipeline/src/stages/review.ts` (the CSV format, `PASS_RATE`, `applyKiezReview`), `pipeline/src/stages/check.ts` (`dishFlags`), `pipeline/src/export/publish.ts`, `pipeline/README.md`.
Never edit `pipeline/`; it is the pipeline agent's.

### How a Kiez goes live (the loop you make fast)

1. The pipeline runs the Kiez and exports the review sample: `npm run pipeline -- review export --kiez <slug> --out ./review` (one CSV per Kiez and reviewer; columns `review_id, kiez, reviewer, restaurant, website, menu_source, dish, description, price_eur, kcal, kcal_range, protein_g, protein_range, carbs_g, fat_g, confidence, source, ingredients, image, check_note, verdict, note`).
2. Batu (or you, with `ADMIN_TOKEN`) uploads that CSV to your `POST /api/admin/review/sample`.
3. The reviewer opens `/review?kiez=<slug>` on their phone and marks each dish `passt` or `falsch`.
4. Batu downloads `GET /api/admin/review/export?kiez=<slug>&reviewer=<name>` (the same CSV with `verdict` and `note` filled in) and runs `npm run pipeline -- review import <file>`; the pipeline approves the Kiez at 80 percent `passt` and keeps restaurants with a `falsch` dish out.
5. Batu runs `publish`; the Kiez is live.
   Your `GET /api/admin/quality` and `GET /api/quality` show the result.

Human step: ask Batu to have the pipeline agent append `dish_id` and `restaurant_id` columns to the review CSV (append-only; the import reads columns by header name, check that in `review.ts`), so a late `falsch` on a published dish can hide exactly that dish.

### Task A: the review store (first PR by Saturday 20:00, branch `qa/review-store`)

Migration `worker/migrations/0030_review.sql`:

```sql
-- One row per sampled dish, loaded from the pipeline's review CSV. The row keeps a snapshot of what the
-- reviewer saw, so the page works before the dishes are published to the Worker tables.
CREATE TABLE review_items (
  review_id TEXT PRIMARY KEY,                  -- the pipeline's pipeline_review.id
  kiez TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  dish_id TEXT, restaurant_id TEXT,            -- when the CSV carries them
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),   -- the CSV row as an object, column name -> value
  verdict TEXT CHECK (verdict IN ('passt', 'falsch')),
  fields TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fields)),   -- ["name","price","kcal","protein","carbs","fat","ingredients","other"]
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  decided_by TEXT, decided_at INTEGER,
  loaded_at INTEGER NOT NULL
);
CREATE INDEX review_items_queue_idx ON review_items (kiez, reviewer, verdict);
```

`worker/src/review/csv.ts`: a small RFC 4180 parser and writer (quoted fields, doubled quotes, `,` or `;` as delimiter like the pipeline's parser, CRLF or LF, a UTF-8 BOM), pure and unit-tested with a round trip: parse, write, parse gives the same rows.

Routes:

- `POST /api/admin/review/sample` (`ADMIN_TOKEN`, body `text/csv`, at most 1 MB): check that the header has every pipeline column (extra columns are kept in the snapshot), upsert by `review_id` without overwriting a verdict that is already set, answer `{ kiez, reviewer, items }`; 400 with the missing columns otherwise.
- `POST /api/admin/review` (`REVIEW_TOKEN`): `{ reviewId, verdict: "passt" | "falsch", fields?, note?, reviewer }`; `reviewer` must be in `REVIEWERS`, `fields` in `REVIEW_FIELDS`; the note goes through `worker/src/lib/word-filter.ts`; 404 for an unknown `reviewId`; 201 `{ ok: true }`.
  Changing a verdict is allowed (the latest wins).
- `GET /api/admin/review/queue?kiez=&reviewer=&n=` (`REVIEW_TOKEN`, `n` 1 to 50, default 20): undecided items of that Kiez, the given reviewer's first, then anyone's.
- `GET /api/admin/review/export?kiez=&reviewer=` (`ADMIN_TOKEN`): `text/csv` with exactly the pipeline's columns in the pipeline's order, `verdict` and `note` filled in (prefix the note with the wrong fields, for example `[price,kcal] Preis ist 12,90`), `Content-Disposition: attachment; filename="review-<kiez>-<reviewer>.csv"`.

Shapes in `packages/contract/src/review.ts`:

```ts
export const REVIEWERS = ["Kalvarez09", "vinaynaik432-debug", "Malek1414", "BatuCani"] as const;
export const REVIEW_FIELDS = ["name", "price", "kcal", "protein", "carbs", "fat", "ingredients", "other"] as const;
export const PASS_RATE = 0.8;   // the pipeline's rule in pipeline/src/stages/review.ts; change both together
export type ReviewItem = {
  reviewId: string; kiez: KiezSlug; reviewer: Reviewer; kind: "sample" | "audit";
  dishId: string | null; restaurantId: string | null;
  restaurant: string; website: string | null; menuSource: string | null;
  dish: string; description: string | null; priceEur: number | null;
  kcal: number | null; kcalRange: string | null; proteinG: number | null; proteinRange: string | null;
  carbsG: number | null; fatG: number | null; confidence: string | null; source: string | null;
  ingredients: string | null; image: string | null; checkNote: string | null;
  flags: { rule: string; severity: "block" | "warn"; detail: string }[];   // audit flags (task C)
  verdict: "passt" | "falsch" | null; fields: ReviewField[]; note: string | null;
};
export type KiezQuality = {
  kiez: KiezSlug; sampled: number; decided: number; passt: number; passRate: number | null;
  passes: boolean;                                  // passRate >= PASS_RATE and every sample row decided
  falschByField: Record<ReviewField, number>;
  restaurants: number; publishedRestaurants: number; dishes: number; publishedDishes: number;
  withPrice: number; official: number; confidence: { high: number; medium: number; low: number };
  auditFlags: { block: number; warn: number };
};
```

Tests (`worker/test/review.test.ts`, workerd, migrations applied): CSV round trip including quotes, semicolons and umlauts; sample upload with a missing column is 400; re-upload keeps verdicts; verdict 401 without or with a wrong token, 400 for an unknown reviewer, verdict or field, 404 for an unknown id; export has the pipeline's exact header and the filled verdicts.

### Task B: the review page (branch `qa/review-page`, PR by Saturday 21:30, the part humans use tonight)

`GET /review?kiez=` is plain server-rendered HTML from the Worker (no React, no build step), made for phones:

- Login: a form posts the `REVIEW_TOKEN` and the reviewer name (a select from `REVIEWERS`) once to `POST /review/login`; the Worker sets an `HttpOnly; Secure; SameSite=Strict; Path=/` cookie whose value is `reviewer.expiry.HMAC-SHA256(REVIEW_TOKEN, reviewer + "." + expiry)`, valid 24 hours, checked in constant time.
  The token never appears in a URL, a log line or the HTML.
- Top: Kiez picker, progress ("18 of 30 decided, 16 passt, 89 percent, needs 80"), and the next step ("ready: tell Batu to export").
- One card per item: restaurant and dish name, description, price, kcal with range, protein with range, carbs, fat, confidence, source (`ai` or `official`), the ingredient list with grams, the pipeline's `check_note` and your audit flags (red for block, amber for warn), the AI image if there is one (`/api/images/ai/<file>`), and big links "Open website" and "Open menu source" (`target="_blank" rel="noopener noreferrer"`).
- Two big buttons, "Passt" and "Falsch"; "Falsch" reveals field chips and an optional note, then saves.
  Each button posts with `fetch` and moves to the next card without a reload; an undo link for the last verdict; keyboard shortcuts `p` and `f` on desktop.
- The review protocol at the top: name and price must match the source exactly; nutrition only has to be plausible for the portion (no missing main ingredient, no absurd numbers); when unsure, mark `falsch` and write why.
- Escape every value you render (dish names come from the web); send `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<random>'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- Look: system font stack, the brand cobalt `#355eda` for the primary button, 16 px base text, 44 px touch targets, works one-handed on a 375 px wide screen and in dark mode; it is an internal tool used on phones at night, so make it fast and legible.

Tests: the page escapes a dish named `<script>alert(1)</script>`, never contains the token, rejects a tampered cookie, and the login cookie has `HttpOnly`, `Secure` and `SameSite=Strict`.

### Task C: second-line audit and quality metrics (branch `qa/audit`)

The pipeline's check stage is the first line (`dishFlags` in `pipeline/src/stages/check.ts`: `kcal_low`, `kcal_high`, `portion_small`, `portion_large`, `protein_share_high`, `unmatched_ingredient`, `price_outlier`, `kiez_outlier`, `official_vs_estimate`, plus a second model and a Kiez chief).
You add an independent second line over what actually landed in the Worker tables, so nothing slips through between pipeline and app.

`worker/src/qa/rules.ts`: pure functions, no D1, fully unit-tested; every threshold in one exported `THRESHOLDS` object and in the table in `docs/quality/rules.md`.

| Rule id | Severity | Fires when | Why |
| --- | --- | --- | --- |
| `energy_mismatch` | block | `abs(4*protein + 4*carbs + 9*fat - kcal) / kcal > 0.15` | the pipeline computes macros by code, so a mismatch means a bug |
| `range_invalid` | block | `min > value` or `value > max` for kcal or protein, or a missing range on a published dish | broken data |
| `price_parse_suspect` | block | a main below 300 cents or above 6000 cents | price parsing errors ("7.9" vs "79") |
| `protein_suspect` | warn | protein above 40 g on an AI estimate that is not `high` confidence | the pipeline still overestimates chicken dishes by about 8 g |
| `range_too_narrow` | warn | AI estimate with `(kcal_max - kcal_min) / kcal < 0.2` | a narrow range overstates certainty |
| `kcal_compressed` | warn (restaurant) | at least 5 mains whose kcal standard deviation is below 60 | the first spike estimated every bowl at 680 to 790 kcal |
| `duplicate_dish` | warn | same restaurant, same normalized name and same price | menus list a dish twice |
| `missing_price` | warn | `price_cents` is null | never shows in price filters |
| `non_menu_text` | warn | the dish name matches `Vermögensanlage`, `Impressum`, `AGB`, `Datenschutz`, `Informationsblatt`, `Cookie` | a finance PDF once looked like a menu |
| `stale_menu` | warn | the menu source was fetched more than 60 days ago | prices change |

Add `worker/src/qa/rules.vectors.json` (one passing and one failing example per rule) and send Batu the link, so the pipeline agent can adopt rules into its check stage; change thresholds only together with the pipeline agent.

Migration `0031_qa_flags.sql`: `qa_flags (id, dish_id, restaurant_id, kiez, rule, severity, detail, created_at)` with indexes on `(kiez, severity)` and `dish_id`.
`POST /api/admin/qa/run` (`ADMIN_TOKEN`, `{ kiez }`): load every dish of the Kiez from the Worker tables, run the rules, replace that Kiez's flags in one `db.batch()` (chunks of at most 100 statements), answer `{ kiez, dishesChecked, flags: { block, warn } }`; idempotent.
Published dishes with a block flag become `audit` items in the review queue (after the sample items); a `falsch` on an audit item sets that dish's `published_at` to `NULL` at once and lists it in `GET /api/admin/review/export?kiez=&kind=audit` (JSON with dish id, fields and note) for the pipeline's re-run.

`GET /api/admin/quality?kiez=` (`REVIEW_TOKEN`): `{ kieze: KiezQuality[] }`.

### Task D: kill switch and public quality numbers (branch `qa/kill-switch`, by Saturday 22:30)

- `POST /api/admin/kieze/:slug/hide` (`ADMIN_TOKEN`): in one `db.batch()`, set `published_at = NULL` on every restaurant of that Kiez and their dishes; log it in `0032_kiez_visibility.sql` (`kiez_visibility_log (id, kiez, action, restaurants, dishes, created_at)`); answer `{ slug, restaurants, dishes }`.
  Restoring is Batu re-running the pipeline's `publish` for that Kiez, so there is only one place that publishes.
- `GET /api/quality` (public, `LIMIT_READ`, edge-cached 60 seconds with the Cache API): `{ generatedAt, kiezeLive, reviewedDishes, passRate, calibration: { n, kcalMaePct, kcalBiasPct, proteinBiasG, source, measuredAt } }`.
  Calibration comes from the pipeline's measurement against official dean&david values (PR #23 reports 16 dishes, kcal mean absolute error 15 percent, bias -5 percent, protein about 8 g high on chicken); keep it in `worker/src/qa/calibration.ts` with source and date, and update it when the pipeline re-measures.
  This feeds the "How is this calculated?" sheet and slide 2; it never contains per-dish or per-reviewer data.

### Task E: Kiez assignment and running the review (human step, Saturday 22:00 to Sunday 10:00)

1. Write `docs/quality/kiez-assignment.md`: the wave-1 table from section 4, the wave-2 proposal, the loop from the top of this section with the exact commands, the review protocol, and a status column you keep current.
2. When the pipeline reports a Kiez ready, make sure its sample is uploaded, post in the team chat "Kiez X is ready: <staging URL>/review?kiez=x", and chase the reviewer.
3. Review Mitte and Kreuzberg yourself (about 20 minutes per Kiez for 30 dishes); wave 1 done by Sunday 10:00.
4. After each Kiez: send Batu the export link and the pass rate; after `publish`, run `POST /api/admin/qa/run` for the Kiez and review its audit items.
5. Sunday 14:00: write the slide numbers into `docs/quality/report.md` (reviewed dishes, pass rate, calibration, Kieze live) with the timestamp and the exact queries.

### Stretch (only after A to D are merged)

- "Value looks wrong" from users: `POST /api/feedback/dish/:id` with `{ field, note? }`, rate-limited per IP (5 per hour), word-filtered, stored as a `qa_flags` row with rule `user_report`, shown as an audit item.
  Coordinate the route with vinaynaik432-debug and the button with Batu's dish-screen agent.

## 11. Definition of done

- Tasks A to D merged (or open with green checks and Batu's go), with tests; `npm run check`, `npm run lint` and `npm test` pass after rebasing on `origin/main`.
- One full loop done on staging with a real pipeline CSV: upload, review on a real phone, export, `review import` by Batu, `publish`, and the Kiez visible in the app; screenshots of the review page in the PR.
- Mitte and Kreuzberg reviewed by Sunday 10:00; every wave-1 Kiez has a pass rate; the slide numbers are in `docs/quality/report.md` by Sunday 14:00.

Tests you must have (workerd via `SELF.fetch`, migrations applied, seed loaded):

- The CSV round trip and the sample, verdict, queue and export routes from task A, including every auth and validation error.
- The review page tests from task B.
- Every rule vector passes; `POST /api/admin/qa/run` twice gives the same flag count; a `falsch` on an audit item unpublishes exactly that dish, and vinaynaik432-debug's `GET /api/dishes/top` no longer returns it.
- The kill switch hides the whole Kiez from `GET /api/dishes/top` and `GET /api/restaurants`; `GET /api/quality` is cached and contains no per-dish data.

## 12. What not to touch

- `pipeline/` and `worker/migrations/0010-0029` (pipeline agent; read them, never edit), `apps/web/` (Batu's web agents and Malek1414), `worker/migrations/0001-0009` (restructure agent), `worker/migrations/0040-0049` and `worker/src/routes/` (vinaynaik432-debug), `archive/`, `brand/`, `docs/design/`, `docs/team-prompts/`.
- Never set `published_at` to a value; you only ever set it to `NULL` (kill switch, audit `falsch`).
- Never duplicate the pipeline's approval rule in a second place that publishes; `PASS_RATE` mirrors it for display only.
- Never expose review items, reviewer names or `qa_flags` through a public route; never store or print a token or key; never deploy to production.
