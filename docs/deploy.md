# Going live on Cloudflare

One Worker (`worker/`) serves the API under `/api/*` and the built web app (`apps/web/dist`) as static assets.
Data lives in D1 (`wohin-db`), photos in the Workers KV namespace `wohin-photos` (binding `PHOTOS`, see "Photos in Workers KV").
The web screens still answer from the bundled seed (`apps/web/src/data/api.ts`); the API serves the same data with the same ids from D1, ready for when the screens switch to `fetch`.
The production settings are `env.production` in `worker/wrangler.jsonc`; secrets never go in that file.

Everything below runs on the Workers Free plan and creates only free resources.

## Live now

Production runs at the workers.dev URL that `npm run deploy:production` prints, on D1 `wohin-db` (`database_id` in `worker/wrangler.jsonc`) and the KV namespace `wohin-photos` (`id` in `worker/wrangler.jsonc`).
R2 is not enabled on the account and not needed: every photo lives in Workers KV, which the Workers Free plan includes.

- Private plate and menu scans at `/api/scans` need the `OPENAI_API_KEY` Worker secret (`SCAN_AI_MODE=openai` in `env.production`). The reading is stored in D1; the photo of a successful scan is kept privately in KV for 30 days and can be deleted from the app.
- `GET /api/images/ai/*` answers 404 unless KI-Bild files were uploaded to KV (step 1, optional); the app bundles its own copies, so nothing visible changes.
- Share cards are prebuilt static assets and need no storage.

## Submission numbers

In production, `GET /api/numbers` counts distinct browser IDs from the launch cutoff in `NUMBERS_SINCE` (configured in `worker/wrangler.jsonc`). Environments without that variable count from the first recorded event.
Before exporting the slides, open DishFit first, then open `/api/team` and submit the existing `ADMIN_TOKEN` on every testing device, in each browser and again from within the installed app (each production origin, browser profile and installed app has its own browser ID).
The registration excludes earlier activity and suppresses future event writes for that browser ID.
`GET /api/numbers` is cached per Worker instance for 30 seconds, so an exclusion can take up to 30 seconds to appear in every instance. Wait that long, then run the export in [the submission instructions](../submission/README.md).

Apply `0050_numbers.sql` through the ordinary release migration step before deploying this Worker. It builds on the
`events` table in `0001_init.sql`. Analytics creates one event row for an open-only visitor and one more for each distinct
tracked action that device takes in the same UTC day. A visit with an app open, a dish view and a directions tap creates
three event rows. The web app has seven event types, so it can create at most seven event rows per device per full UTC day after launch.
Each insert updates three indexes, so those examples cost approximately 4, 12 and 28 D1 row writes, respectively. On launch day, each side of the cutoff has its own deduplication window, for up to 56 D1 row writes per device across both windows.

## Release (every merge)

```bash
npx wrangler login   # once per machine
DEPLOY_ENV_DIR=<dir with the .env files> npm run deploy:production
```

`worker/scripts/deploy-production.sh` runs the whole release and is safe to re-run: install, web build with the Maps key, share cards, lint, type-check and all tests, the photo KV namespace, remote D1 migrations, the real-data seed, deploy with secrets, and a smoke test of the live URL.
The photo step (`worker/scripts/ensure-photos-kv.sh`) creates the KV namespace `wohin-photos` when it is missing and checks that `env.production` binds `PHOTOS` to it; it never creates anything that costs money.
On a fresh account it writes the new namespace id over the placeholder `<production-photos-kv-id>` in `worker/wrangler.jsonc`; commit that change.
It sources every `*.env` in `DEPLOY_ENV_DIR` (point it at a folder that holds only the files you mean, for example links to the Maps browser key and the AI keys).
It reads `VITE_GOOGLE_MAPS_API_KEY` (or `VITE_GOOGLE_MAPS_BROWSER_KEY`), and uploads `ANTHROPIC_API_KEY` as a Worker secret when it is set.
It never uploads `OPENAI_API_KEY`: it stops before any change unless that secret already exists on the Worker.
`ADMIN_TOKEN` and `DEVICE_COOKIE_SECRET` are generated on the first deploy and kept on every later one; the new `ADMIN_TOKEN` lands in `worker/.dev.vars.production` (gitignored, mode 600) and is never printed.
The seed is applied only when `worker/seed/real.sql` changes (its hash is kept in the D1 table `deploy_meta`). The updated seed inserts new rows, updates changed rows, and removes items no longer on each seeded website menu. The incremental seed keeps community rows and the IDs of existing restaurants and dishes.
`SKIP_CHECK=1` skips lint and tests, `SKIP_SEED=1` keeps the D1 data, `FORCE_SEED=1` reseeds anyway, `SKIP_INSTALL=1` skips `npm ci`.

### Canonical domain cutover

After Cloudflare activates `dishfit.de`, attach the apex and `www.dishfit.de` to the running `wohin` Worker. Check HTTPS, the home page, `/api/health`, map, dish, and Google Places on the apex before enabling the www and legacy redirects with `DISHFIT_REDIRECT_ALIASES`. Set it to `"true"` in the production release configuration after those checks. Keep the legacy hostname bound for its permanent redirects.

The production Worker enforces HTTPS and handles the hostname redirects for paths routed through it. The excluded static files below are served directly on each attached hostname.

### Static asset routing

The production `assets.run_worker_first` setting in `worker/wrangler.jsonc` excludes `/assets/*`, `/icons/*`, `/restaurant-logos/*` and `/favicon.svg`. Matching files are served directly by Cloudflare Static Assets with the response headers in `apps/web/public/_headers` and do not use the Worker request quota.
App HTML, dish previews and API requests go through the Worker for HTTPS enforcement and security headers.

### Community photo expiry backfill (operator-run, not part of the release)

Community photos written before the 12-month expiry have no KV expiry.
Run `node worker/scripts/backfill-community-photo-expiry.ts` with `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `PHOTOS_KV_NAMESPACE_ID` and `CLOUDFLARE_API_TOKEN` set.
It is a dry run by default and prints counts, including `orphanDelete` (non-expiring keys with no submission or scan row, which are failed community uploads) and `ambiguous` (keys it will not touch).
The IDs must be the production pair from `worker/wrangler.jsonc` (`env.production`); the script refuses any other D1 and KV combination.
Review the output, then add `--apply` to write expirations from each submission's original timestamp and delete expired photos.
Orphans are deleted only with `--apply --delete-orphans`.
Before that, deploy the expiry-enabled Worker and confirm that uploads started under the old Worker have finished, because an old upload writes KV before its D1 row and would look like an orphan.
Private scan keys are never changed.

The numbered steps below are the same release by hand.

### Search guides

The web build generates German and English catalog guides, `/robots.txt` and `/sitemap.xml`.
The English routes mirror `/kiez/<slug>`, `/kategorie/<slug>` and `/kiez/<slug>/<category>` under `/en`.
Each listing needs at least five whole meals from the public catalog. A combination with the same dishes as either parent is omitted. A guide shows up to 30 meals and links to the corresponding search in the app.

Set `DISHFIT_CANONICAL_URL` in the release environment to update every guide canonical, language alternate and sitemap URL together. The default is `https://dishfit.caniberk.dev`. After the new domain serves the Worker, build with `DISHFIT_CANONICAL_URL=https://dishfit.de`.

## 0. Check before going live

From the repo root:

```bash
npm ci && npm ci --prefix apps/web && npm ci --prefix pipeline
npm run deploy:check
```

`deploy:check` builds the web app (with its type-check), draws the share cards (`npm run cards`), lints, type-checks the worker and packages, runs all tests, generates the real-data seed (`worker/seed/real.sql`) and runs `wrangler deploy --env production --dry-run`.
It needs no Cloudflare login, and its dry run must print `--dry-run: exiting now.`
With `DEPLOY_CHECK_E2E=1` it then also runs the click-through regression (`npm run e2e`, see the README) against a local Worker, or against a deployment when `E2E_BASE_URL` is set.

## 1. One-time setup (copy and paste)

```bash
cd worker
npx wrangler login

# D1: create the database, then paste the printed database_id into env.production in wrangler.jsonc
# (replace "<production-d1-id>"). If wrangler offers to add the binding for you, answer No: it would add it outside env.production.
npx wrangler d1 create wohin-db

# KV: the photo store (Workers Free, no R2 and no payment method needed). Creates "wohin-photos" if missing
# and writes its id into env.production in wrangler.jsonc; commit that change.
bash scripts/ensure-photos-kv.sh

# Schema, then the real data (118 restaurants, 3774 dishes from the merged pipeline export)
npx wrangler d1 migrations apply DB --env production --remote
npm run seed:build
npx wrangler d1 execute DB --env production --remote --file seed/real.sql

# Optional: KI-Bild files to KV under ai/<file> (served by /api/images/ai/:file). The web app bundles its own copies,
# and each file is one KV write of the 1,000 per day, so upload them on a quiet day, at most a few hundred at once.
for f in ../apps/web/src/data/seed/pipeline/images/*; do
  case "$f" in *.webp) t=image/webp ;; *.png) t=image/png ;; *) t=image/jpeg ;; esac
  npx wrangler kv key put "ai/$(basename "$f")" --path "$f" --metadata "{\"contentType\":\"$t\"}" --binding PHOTOS --env production --remote
done
```

Commit the pasted `database_id` (it is an identifier, not a secret).

## 2. Build and deploy

Google Places is off by default. The regular build uses DishFit's own content. If the Google services are enabled again, opt in with `VITE_PLACES_ENABLED=1` and `VITE_GOOGLE_MAPS_API_KEY` at build time. `npm run deploy:production` ignores `VITE_PLACES_ENABLED` from the environment and always builds with Places off; only `npm run deploy:production -- --enable-places` turns it on. The key is baked into the web bundle, so it must be a browser key:

- In Google Cloud, restrict it to **Maps JavaScript API**, **Places API (New)** and **Places UI Kit**.
- Restrict it to HTTP referrers `https://wohin.<your-subdomain>.workers.dev/*` (plus `http://localhost:*/*` for local dev, and any custom domain later).
  `npx wrangler whoami` shows the account; the workers.dev subdomain is in the dashboard under Workers & Pages, and the first deploy prints the full URL.

Before a manual deploy, `npx wrangler secret list --env production` must show `OPENAI_API_KEY`: production runs `SCAN_AI_MODE=openai`, and without the key both private scan types answer 503.
On a first deploy run `npx wrangler secret put OPENAI_API_KEY --env production` once, then deploy.

```bash
cd ..   # repo root
npm run build --prefix apps/web
npm run cards
cd worker
npx wrangler deploy --env production
```

Every later release is the same build, `npm run cards` and `npx wrangler deploy --env production`.
`npm run cards` draws the share cards into the static assets (`apps/web/dist/share/cards/`, a few minutes): every dish with a KI-Bild plus the 300 best by health score (`-- --top <n>` or `-- --all` for more).
Drawing a card takes far more than the 10 ms CPU a Workers Free request may use, so production (`SHARE_CARD_RENDER: "prebuilt"`) never draws: a dish without a drawn card gets the DishFit brand card until a later build draws its own.
On Workers Paid, `"on-request"` draws missing cards in the Worker once and keeps them in the photo store (`share-cards/`, within the daily KV write budget).
Places content is off by default: also set `VITE_PLACES_ENABLED=1` in the build to show the Google block and live card photos (see `apps/web/README.md`, "Google Places key").
Without the key or the switch the app still works; the restaurant page just leaves out the Google Places block.

### Fathom Analytics

In Fathom, open **Settings → Sites** and copy the Site ID for DishFit. Set that ID as `VITE_FATHOM_SITE_ID` in the environment of the web build. `npm run deploy:production` also accepts it through a `*.env` file in `DEPLOY_ENV_DIR`. For Cloudflare Workers Builds, set it in the build environment. It is a public embed identifier. Leave it unset or empty to make a build without the Fathom script. Changing it requires a new web build.

If the Fathom site's firewall restricts domains, add `dishfit.caniberk.dev` to **Allowed domains**. With an empty domain allowlist, Fathom can already count visits from that hostname. An allowlist containing only `dishfit.caniberk.dev` keeps previews, local builds and the `workers.dev` fallback out of the production numbers. [Fathom site firewall settings](https://usefathom.com/docs/script/firewall)

Fathom counts pageviews on initial loads and in-app navigation. URLs with query parameters and individual scan-status pages are excluded. The existing first-party counters are separate and unchanged: share records from the app and opens of tagged share links.

If a Content Security Policy applies to the web app shell, include `https://cdn.usefathom.com` in `script-src` (and `script-src-elem` if set separately), `img-src` for pageview requests, and `connect-src` for visit-duration beacons. These sources need to be present before enabling the Site ID, including when the security headers ship separately.

## 3. Secrets

Set after the first deploy (each `secret put` rolls out a new version immediately):

```bash
# Bearer token for GET /api/admin/ai-usage. Keep the value in the password manager.
ADMIN_TOKEN=$(openssl rand -base64 32); echo "$ADMIN_TOKEN"
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN --env production
```

The same `ADMIN_TOKEN` opens the community queue at `$URL/api/admin/queue`.
Private plate and menu scans use OpenAI in production (`SCAN_AI_MODE=openai`). `npm run deploy:production` checks `wrangler secret list` first and stops without changes when `OPENAI_API_KEY` is missing or the lookup fails.
After a release, confirm both scan types return real readings: `E2E_BASE_URL=https://<your-worker>.workers.dev E2E_LIVE_AI=1 npm run e2e -- journeys.spec.ts -g camera` (spends a few cents).
The run requires `E2E_BASE_URL`; on production both scans must answer with `mode: openai`, elsewhere either real provider passes.
The community menu scans (`/api/submissions`, `worker/src/community/`) need one AI key for the review agent (`COMMUNITY_REVIEW_MODE` is `auto` in production).
Community review prefers `ANTHROPIC_API_KEY` when both keys are set. Without a key every upload waits in the team queue; `COMMUNITY_DAILY_BUDGET_USD` caps the review spend per day.

```bash
npx wrangler secret put OPENAI_API_KEY --env production
```

Turnstile for uploads: set `TURNSTILE_SITE_KEY` and `"TURNSTILE_ENABLED": "true"` in `env.production` vars, then `npx wrangler secret put TURNSTILE_SECRET_KEY --env production`.
When Kalvarez09's review queue lands, it adds `REVIEW_TOKEN` the same way (`openssl rand -base64 32 | npx wrangler secret put REVIEW_TOKEN --env production`).

`GOOGLE_PLACES_API_KEY` stays out of the Worker: only the pipeline uses it, on Batu's machine.
`npx wrangler secret list --env production` shows what is set.

## 4. Smoke test

```bash
URL=https://wohin.<your-subdomain>.workers.dev
curl -s "$URL/api/health"                                    # {"ok":true,"env":"production"}
curl -s "$URL/api/kieze"                                     # restaurantCount > 0 for the five wave-1 Kieze
curl -s "$URL/api/dishes/top?limit=3&maxPriceCents=1200"    # three dishes with nutrition ranges
curl -s "$URL/api/restaurants/osm-node-89274696" | head -c 300   # Aapka, Mitte, with its menu
curl -sI "$URL/api/images/ai/5-chicken-kachumber-salat-e2e163c8.jpg" | head -3   # 200 image/jpeg once KI-Bild files are in KV, else 404
curl -s -H "authorization: Bearer $ADMIN_TOKEN" "$URL/api/admin/ai-usage"
curl -s "$URL/api/submissions/config"                        # {"uploadsEnabled":true,"uploadsPaused":null,...,"maxBytes":5242880,...}
curl -s -H "authorization: Bearer $ADMIN_TOKEN" "$URL/api/admin/storage-usage"   # today's KV writes against the soft limit
curl -s -o /dev/null -w '%{http_code}\n' "$URL/"             # 200 (app)
curl -s -o /dev/null -w '%{http_code}\n' "$URL/map"          # 200 (the Worker serves the app shell for known routes)
curl -s -o /dev/null -w '%{http_code}\n' "$URL/no-such-page" # 404 (still the app shell with the DishFit recovery screen)
open "$URL"
```

In the browser: the home feed shows dishes, the map shows pins, and a restaurant page shows its menu and (with the Maps key and `VITE_PLACES_ENABLED=1`) the Google block.
The same click-through runs automatically with `E2E_BASE_URL="$URL" npm run e2e`.
Logs: `npx wrangler tail --env production`, or the Observability tab in the dashboard (enabled in `wrangler.jsonc`).
Rollback: `npx wrangler rollback --env production`.

## Updating the data

After a Kiez PR is merged (new files in `apps/web/src/data/seed/pipeline/kiez/`):

```bash
cd worker
npm run seed:build
npx wrangler d1 execute DB --env production --remote --file seed/real.sql   # sync the pipeline website menus
# upload new KI-Bild files with the loop from step 1, then rebuild and deploy as in step 2
```

The seed is generated by `worker/scripts/build-seed.ts` from the merged per-Kiez export, with the same merge rules and ids as the bundled web seed.
`npm run db:seed:real:local` loads it into the local D1 for `npm run dev`.

## Free plan limits

- **Workers Free: 100,000 requests per day** across the account, 10 ms CPU per request.
  Share cards are drawn at build time for that reason (`npm run cards`, see step 2).
  Requests served directly by Static Assets are free. Requests handled by the Worker, including app HTML, dish previews and API calls, count toward the quota.
  Past the limit Cloudflare returns errors for Worker requests until 00:00 UTC.
- **D1 Free:** 5 million rows read and 100,000 rows written per day, 5 GB storage.
  The `0049_menu_items.sql` migration backfills one inventory row per existing first-party dish in a table with no secondary indexes. Allow headroom for that backfill, the logo URL updates, and routine traffic before release. Incremental seeds batch dish upserts below D1's statement size limit. When a generated seed is unchanged, the deploy script skips it entirely.
- **Workers KV Free** (photo store): 100,000 reads, 1,000 writes, 1,000 deletes and 1,000 lists per day for the whole account, 1 GB storage, 25 MiB per value.
  At a daily limit, operations of that type fail until 00:00 UTC. The Worker reserves headroom for writes. [Cloudflare pricing](https://developers.cloudflare.com/kv/platform/pricing/), [Cloudflare limits](https://developers.cloudflare.com/kv/platform/limits/).
- **Rate limits** (`wrangler.jsonc`): 300 reads and 60 event posts per minute per IP.
- **AI budget guard:** `AI_DAILY_BUDGET_USD` (var in `wrangler.jsonc`, `5` in production) caps paid AI calls made by the Worker per UTC day, counted from `ai_usage`; `0` turns paid calls off.
  Change it in `wrangler.jsonc` and deploy.

## Photos in Workers KV

All photos live in one KV namespace behind a small storage interface (`worker/src/lib/photo-store.ts`), so R2 can replace KV later without touching the routes (`r2PhotoStore` implements the same interface).

| What | Key | Expiry | Who can load it |
| --- | --- | --- | --- |
| Camera scan photo (plate or menu, "Teller scannen", "Speisekarte scannen") | `photos/<device id>/<uuid>` | 30 days (`expirationTtl`) | only the device that took it, with its signed cookie: `GET /api/scans/:id/photo` |
| Community menu photo ("Mit Community teilen", `/scan`) | `photos/<device id>/<uuid>` | 12 months (`expirationTtl`); older values need the backfill above | everyone once published (`GET /api/submissions/:id/photo`), with moderation checked on each request. Before publication or after rejection, only the guest's device and the admin queue |
| KI-Bild file (optional) | `ai/<file>` | none | everyone: `GET /api/images/ai/:file` |
| Share card drawn on request (Workers Paid only) | `share-cards/<version>-<format>.png` | none | everyone, through `GET /api/share/:id/:file` |

- The app compresses every photo before upload (`apps/web/src/lib/photo.ts`): WebP (JPEG where the browser cannot encode WebP), longest side at most 1600 px, aimed at under 1 MB.
  The Worker refuses anything over 5 MB, strips metadata again, and stores the result; KV's own value limit is 25 MiB.
- A guest deletes a scan photo with "Foto löschen" (`DELETE /api/scans/:id/photo`) or together with the scan (`DELETE /api/scans/:id`).
  An expired photo reads as gone even before KV removes it.
- **Soft daily write guard.** The Worker counts its KV writes per UTC day in D1 (`storage_ops`) and stops at `PHOTO_DAILY_WRITE_LIMIT` (var in `wrangler.jsonc`, `900`), leaving 100 writes of KV Free's 1,000 for releases and manual uploads.
  Past it, community uploads pause with a friendly message ("Für heute sind genug Fotos da", `GET /api/submissions/config` answers `uploadsPaused: "daily_limit"`, `POST /api/submissions` 503 `storage_limit`), and camera scans still read the photo but do not keep it.
  It resets at 00:00 UTC; `GET /api/admin/storage-usage` shows today's count.
- One photo upload is one KV write, so the Free plan holds about 900 photos per day and, at under 1 MB each, about 1,000 photos in total storage (1 GB) before older community photos need deleting or R2.
  Camera photos delete themselves after 30 days and free their space.

## Premium waitlist

`/waitlist` uses the `WAITLIST` SQLite Durable Object. Wrangler registers the class during the Worker deploy and the object creates its own table on first use. The waitlist needs no D1 migration or seed. Each new normalized email inserts one row and retries read the existing row. Signups are limited to six attempts per client IP per minute at each Cloudflare location.

The offer is configured in `packages/contract/src/waitlist.ts`. Keep old offer IDs because the signup record keeps its original offer. When the paywall adds a coupon-code field, verify control of the stored email before redeeming the code. The waitlist re-displays a code when the same email is entered.

The owner can export the waitlist using the existing `ADMIN_TOKEN`. The CSV contains email addresses, codes, offer IDs and consent timestamps.

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ADMIN_TOKEN:?Set the existing admin token}" \
  https://dishfit.de/api/admin/waitlist.csv --output dishfit-waitlist.csv
```

## Local check of the production shape

```bash
npm run build --prefix apps/web && npm run cards
cd worker
npm run db:migrate:local && npm run db:seed:real:local
npx wrangler dev   # http://localhost:8787 serves the app and /api from one Worker on the real seed
```
