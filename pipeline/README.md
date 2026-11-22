# Restaurant data pipeline

Deterministic TypeScript script pipeline that turns Berlin restaurants into dishes with price, nutrition ranges, a health score and a "KI-Bild".
Code does the orchestration; models are called only where judgement is needed (reading menus, naming ingredients, checking a Kiez, drawing images).
Every stage is idempotent and resumable from a D1 queue, every paid call is logged with its cost, and a run stops cleanly at its budget.

## Scan a Kiez on your own machine

Google Places is off. `run` skips discovery and processes the existing queue using restaurant websites. Live `scan`, `--probe-only`, `photo-coverage` and `--require-google-photo` are unavailable and exit with an error. Offline fixtures and regular exports still work.

Live scan, for reference (unavailable while Places is off):

```bash
cd pipeline && npm install
npm run scan -- --kiez charlottenburg --member kalvarez --by <your GitHub handle>
```

`--member kalvarez|malek` uses that teammate's Google key and the team OpenAI key from `pipeline/.env.team` (temporary hackathon keys, committed on purpose, revoked after 2026-11-22).
Everyone else copies `.env.example` to `.env.local` and fills in `GOOGLE_PLACES_API_KEY` and `OPENAI_API_KEY` (never commit `.env.local`).

`scan` runs stages 1 to 5 for the Kiez (at most 50 restaurants enter menu reading, one KI-Bild for each restaurant's top dish, stop at 12 USD per Kiez) and writes:

- `apps/web/src/data/seed/pipeline/kiez/<kiez>.json`: the Kiez's restaurants and dishes for the web app (read automatically by `apps/web/src/data/seed/pipeline.ts`),
- `apps/web/src/data/seed/pipeline/images/<dish>.webp`: the new KI-Bild files,
- `pipeline/registry/<kiez>.json`: who scanned it, counts, cost and the place ids.

The registry is the lock (a Kiez registered to someone else needs `--force`) and the dedupe list (a restaurant already published by another Kiez, same place id or OSM element, is skipped), so scans of different Kieze by different people merge cleanly.
Commit exactly those files; the paste-ready prompts are `docs/team-prompts/scan-kalvarez.md` and `docs/team-prompts/scan-malek.md`.
Text steps run on OpenAI when no Anthropic key is set (`gpt-6.2-sol`, second opinions on `gpt-6.1-terra`, translations on `gpt-6-luna`), on Claude otherwise (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`); `PIPELINE_LLM_PROVIDER` forces one.
User-facing text is German: dish names stay as printed, descriptions and section headings get a German version (`description_de`, `section_de`).

## Data rules

- **Restaurant base: OpenStreetMap** (name, address, coordinates, cuisine, opening hours; © OpenStreetMap contributors, ODbL).
- **Google Places only to find and filter.** Text Search finds candidates per Kiez, the rating (>= 4.3) and business status are used in memory as filters, and only `google_place_id` is stored.
  No rating, price level, photo reference, Google name, address or opening hours is ever written (EEA Places terms; a test guards the schema).
  The app shows Google content live through the Places UI Kit, keyed by the place id.
  When OSM has no website, Place Details (`websiteUri` only) is used transiently to find the menu and is not stored.
- **Menus only from the restaurant's own website** (HTML, PDF or menu image), robots.txt respected, delivery platforms never fetched. The website model extracts all food items it can read, including inexpensive sides, desserts, and separately priced variants, and records the menu document for each item. The internal D1 `menu_items` catalog retains entries outside the public healthy list.
- **Dish images are AI images** ("KI-Bild", gpt-image-2.6) in the brand look; no restaurant, website, Instagram or Places photos are copied.
- **Restaurant logos** come from brand images or icons declared by the restaurant's own site. `npm run logos` requires ImageMagick 7 and makes square 256 px WebP tiles in `apps/web/public/restaurant-logos`. The asset URL and the original source are paired in `apps/web/src/data/seed/pipeline/logos.json`. The release seeds the local URL into D1. Static assets use the existing web release and require no KV writes. Logos are optional.
- **Google photos and reviews** are rendered live by the attributed Places UI Kit. Reviews, ratings and photo references stay with Google. Dish confirmations use the existing community ratings flow.
- The data basis is swappable: each source sits behind an interface (`OsmSource`, `PlacesClient`, `MenuFetcher`, `ImageGenerator`, `Llm`).

## Stages

| # | Stage | What happens | Status after |
|---|---|---|---|
| 1 | Finden (`find`) | OSM restaurants inside the Kiez boundary; Places Text Search over a tile grid (free IDs-only probe, quadtree split when a tile hits the 60-result cap, Enterprise fields only on leaf tiles); Places hits matched to OSM rows by name, distance and website domain | `found` (or `candidate` + `no_places_match` / `below_rating`) |
| 2 | Speisekarte (`menu`) | Crawl the own website (depth 2), pick menu HTML / PDFs / menu images, the model extracts dishes, sections, prices, German descriptions and any nutrition the restaurant prints itself (`translate` fills German text for menus read before that) | `menu` |
| 3 | Nährwerte (`nutrition`) | The model lists ingredients and grams per dish (keys from the food table); code computes kcal, macros, fibre, sugar, saturated fat from USDA data; official values replace estimates | `nutrition` |
| 3b | Einordnen (`classify`) | A light model (the `translate` model, Haiku 5.5 by default) sorts every dish into course, dish type, cuisine, diet flags and whole meal (`packages/contract/src/dish-class.ts`), cached by a hash of the dish text so re-runs only pay for new or changed dishes. The healthy rule (`HEALTHY_RULES` there) decides what the app and the Worker show; the rest stays stored but hidden. Team scans and community submissions go through the same stage | unchanged |
| 4 | Prüfen (`check`) | Deterministic outlier flags; a second model re-estimates flagged dishes (agree: keep, disagree: mean of both, range covering both, confidence low); one "Kiez chief" LLM judgement per Kiez: ok / needs_review / reject + confidence | `checked` |
| 5 | Bilder (`image`) | KI-Bild for each restaurant's top dish (default one per restaurant, gpt-image-2.6 low quality), deduplicated by dish | `image` |
| 6 | Freigabe (`review`) | Per-Kiez CSV sample for the assigned teammate (`passt` / `falsch`), imported back; a Kiez with >= 80 % `passt` is approved, restaurants with a `falsch` stay out | `approved` |

A restaurant a stage cannot use keeps its status and gets a `skip_reason` (`no_website`, `website_unreachable`, `robots_disallowed`, `js_rendered`, `aggregator_only`, `no_menu`, `menu_unreadable`, `rejected_check`, `review_failed`, ...).
Failed calls are retried on the next run up to three attempts.

Kieze (boundaries from the official Berlin ALKIS Ortsteile, dl-de/zero-2.0, `data/kieze.geojson`) and reviewers:

| Wave | Kiez | Scanned by | Reviewer |
|---|---|---|---|
| 1 | Mitte, Kreuzberg | BatuCani (pipeline agent) | Kalvarez09 |
| 1 | Prenzlauer Berg | BatuCani (pipeline agent) | vinaynaik432-debug |
| 1 | Friedrichshain, Neukölln | BatuCani (pipeline agent) | Malek1414 |
| 2 | Charlottenburg, Wilmersdorf | Kalvarez09 | vinaynaik432-debug |
| 2 | Schöneberg | Kalvarez09 | Malek1414 |
| 2 | Wedding, Moabit | Malek1414 | Kalvarez09 |
| 3 | Pankow, Tempelhof | Malek1414 | vinaynaik432-debug |
| 4 | Steglitz, Zehlendorf, Tiergarten | BatuCani (pipeline agent, healthy search) | Kalvarez09 |
| 4 | Treptow (Ortsteil Alt-Treptow), Lichtenberg | BatuCani (pipeline agent, healthy search) | Malek1414 |
| 4 | Spandau, Reinickendorf | BatuCani (pipeline agent, healthy search) | vinaynaik432-debug |

Wave 4 also deepened the five wave-1 Kieze with the healthy search (`--append`).

## Healthy search (wave 4)

`--healthy` replaces stage 1's "restaurant" tile grid with one Places Text Search per `HEALTHY_TERMS` entry in `src/stages/find-healthy.ts` over each selected Kiez. The terms include bowls, poke, salads, protein, vegan and vegetarian food, Mediterranean and Levantine food, sushi, pho, bibimbap, açaí, smoothies and healthy breakfasts, and meal prep.
Each search is first probed with the free IDs-only field mask; a saturated search (60 hits) is split once into quadrants.
Paid pages are fetched only up to the last page that holds a place no Kiez has published yet (`pipeline/registry/*.json`) and no earlier term already paid for. Term pages use the Enterprise fields, and the rating rule stays at 4.3 or higher. The individual lookups for OSM candidates read the rating too (Text Search Enterprise fields, server-side floor 4.0 like the term pages) and keep only hits at 4.3 or higher.
Places results are matched to named OSM restaurants, cafés and fast-food venues. Extra OSM candidates with a healthy cuisine or `diet:vegan` or `diet:vegetarian` set to `yes` or `only` get an individual Text Search lookup. A match requires an operational place that no Kiez or queue row holds, a similar name and a distance under 150 m. The OSM rows of a Kiez are refreshed on every run, so an existing queue also receives venues added to the OSM query later, and keeps its check status. A saved menu from a delivery platform is never exported.
A match whose place or OSM element is already published elsewhere is parked as `already_published` and never reaches the menu stage.
The export then publishes only restaurants with at least two healthy dishes (`HEALTHY_RULES.minDishesPerRestaurant`; `--min-healthy-dishes` overrides it), and `--append` adds the new restaurants to a Kiez's committed seed and registry instead of replacing them.

```bash
npm run scan -- --kiez steglitz,mitte --healthy --probe-only --by <you>   # free: prints the paid pages a real run would fetch
npm run scan -- --kiez steglitz,mitte --healthy --append --max-restaurants 25 --budget 40 --by <you>
```

### Berlin expansion and photo coverage

Wave 5 adds the remaining Ortsteile for discovery, together with the eight wave-5 Kieze already published. Commands without `--kiez` or `--wave` select waves 1-4. Select wave 5 with `--wave 5`, or all 97 Ortsteile with `--kiez all`; the web Kiez filters list every Kiez of the shared catalog (`packages/contract/src/kieze.ts`), which holds the Kieze with published restaurants. `scan`, `export-kiez`, `seed` and `publish` refuse a Kiez that is not in that catalog (add it there first), while discovery with `--probe-only` covers every Ortsteil. `run --probe-only` accepts only the `find` stage, and `run`, like `scan`, checks the Kiez owner first. To require a current Google photo for each new restaurant in an export, pass `--require-google-photo` to `scan` or `export-kiez`. The export checks only Place Details IDs-only fields and keeps the place ID. Restaurant pages and the cards on Karte and Entdecken fetch the photos through Places UI Kit using the browser key in `apps/web/.env.local`.

```bash
npm run scan -- --kiez all --healthy --probe-only --by <you>   # probes follow the same Kiez ownership check as scans (--force by agreement)
npm run pipeline -- photo-coverage --out ./photo-coverage.json
npm run pipeline -- photo-coverage --backfill --out ./photo-coverage.json
```

`photo-coverage` measures the published restaurant and healthy dish counts from the D1 seed inputs. `--backfill` looks up absent and obsolete IDs using Text Search Pro with the 150 m name match, only in Kieze registered to you (`--by`, or `--force` by agreement). It updates the matching seed and registry fields and records billable calls at list price in the shared ledger. A place ID that Google reports as moved is never replaced; it is logged for review. Every Kiez's IDs stay reserved, a replacement must have a Google photo, and the corrected ID is also written to your scan queue. The committed seed's place ID is authoritative on every later export of that Kiez, and a rerun copies the seed's IDs into the registry. See [the measured coverage and costs](../docs/data/photo-coverage.md).

## Run it

Node 22.18 or later runs the TypeScript directly; no build step.

```bash
cd pipeline
npm install
npm run check                       # typecheck + tests (offline)

# Offline end to end on fixtures, no keys, no cost:
npm run pipeline -- run --wave 1 --fixture spike --fake-llm

# Live (keys from the environment, pipeline/.env.local, an env dir with anthropic-event.env, openai-event.env, google-places.env, then pipeline/.env.team):
npm run pipeline -- run --wave 1 --stages find --budget 25 --env-dir <private env dir>
npm run pipeline -- run --wave 1 --stages menu,nutrition,check,image --max-restaurants 60 --images-per-restaurant 2 --budget 75 --env-dir <dir>
npm run pipeline -- run --kiez kreuzberg            # one Kiez chief, all stages, no export
npm run pipeline -- export-kiez --wave 1 --by BatuCani   # per-Kiez web seed + registry from the local queue, no API calls
npm run pipeline -- status --wave 1
npm run pipeline -- costs

# Stage 6
npm run pipeline -- review export --wave 1 --out ./review      # one CSV per Kiez and reviewer
npm run pipeline -- review import ./review/review-mitte-Kalvarez09.csv

# Seed for the web app (apps/web/src/data/contract.ts shape)
npm run pipeline -- seed --min-status image --out ./seed/berlin.json
```

Environment:

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional) | read from `pipeline/.env.local`, then `pipeline/.env.team` | API keys, never logged; only the temporary team keys in `.env.team` are committed |
| `GOOGLE_PLACES_API_KEY_<MEMBER>` | `pipeline/.env.team` | a teammate's Google key (not used while Places is off); `--member kalvarez\|malek` only selects the team |
| `PIPELINE_LLM_PROVIDER` | `anthropic` when its key is set, else `openai` | provider for the text steps |
| `PIPELINE_SCANNED_BY` | `git config user.name` | name in `pipeline/registry/<kiez>.json` (same as `--by`) |
| `PIPELINE_ENV_DIR` | - | directory with the private `.env` files (same as `--env-dir`) |
| `PIPELINE_DATA_DIR` | `pipeline/.data` | local SQLite queue, images, exports |
| `PIPELINE_LEDGER` | Firstmate key-spend ledger if present, else `<data dir>/ledger.jsonl` | cost ledger (JSON lines) |
| `PIPELINE_MODEL_MENU`, `_NUTRITION`, `_CHIEF`, `_SECOND`, `_TRANSLATE` | per provider (see above) | models per role |
| `CLOUDFLARE_ACCOUNT_ID`, `PIPELINE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN` | - | with `--d1`: run the queue on a remote D1 database instead of the local SQLite file |
| `PIPELINE_PLACES_DAILY_CALLS` | 400 | daily budget of paid calls per Places SKU (same as `--places-daily-calls`) |
| `PIPELINE_SPIKE_DIR` | Firstmate `data/menu-spike` | spike fixture data |

## Queue and storage

The queue lives in D1 tables created by `worker/migrations/0010_pipeline_queue.sql` and subsequent migrations in the 0010–0029 range.
Locally the same SQL runs on a SQLite file (`node:sqlite`); migrations are tracked in wrangler's `d1_migrations` table so a local file stays consistent with `wrangler d1 migrations apply`.
`--d1` switches to the D1 REST API (`src/store/d1http.ts`); it never creates databases.

### Local menu inventory

Use a dedicated scratch directory for a collection run. `--serial` runs one Kiez at a time, with up to two simultaneous AI calls and at most four simultaneous Places requests. An Overpass response saved as JSON can supply a city's OSM data for the grid via `--osm-snapshot`.

```bash
npm run pipeline -- run --kiez kreuzberg --serial --osm-snapshot /tmp/berlin-osm.json --stages find --budget 12
npm run pipeline -- run --kiez kreuzberg --serial --from-catalog --provider openai --images-per-restaurant 0 --max-restaurants 10 --budget 12
npm run pipeline -- publish --kiez kreuzberg --min-status menu --out /tmp/menu-items.sql
```

Use the Kiez ownership check as for other runs. `--from-catalog` queues first-party websites for already matched restaurants and skips Google requests. The `publish` SQL includes every extracted item from the selected menus, including rows awaiting nutrition. Apply it to a separate local D1 database with the Worker migrations installed. It uses the pipeline's direct-publish IDs, so keep these runs separate from the bundled catalog seed. The public release gate uses the shared healthy rule, a matching Place ID, and the configured release status.

Add `--probe-only` to the grid command for free IDs-only discovery. It retains distinct Place IDs in `pipeline_grid_place` and leaves populated tiles ready for the later paid OSM matching pass.

Concurrency and rate limits are shared across all Kieze of a run: Anthropic 12 requests in flight, OpenAI images 4, Places 4 in flight and at most ~8 requests per second, Overpass one query at a time (2 s apart), 6 restaurants per Kiez per stage.

## Costs

Every paid call appends `{"provider","model","usd",...,"stage","kiez","purpose","run"}` to the ledger and to `pipeline_cost`.
LLM cost comes from the response's token usage; Places calls are logged at list price with `"estimated": true` (the monthly free caps per SKU usually make them free: Text Search Enterprise 1,000, Place Details Enterprise 1,000 per month; IDs-only probes are free and not logged).
`--budget <usd>` reserves an estimate before every paid call and stops the run cleanly when the budget would be exceeded; rerunning resumes where it stopped.
The Places free-tier guard (`src/sources/places-quota.ts`) counts this month's and today's paid Places calls per SKU in the ledger and stops paid Places calls at 80 % of the monthly free calls or at the daily budget (400 calls per SKU, `--places-daily-calls`), whichever comes first; the run start logs where each SKU stands.

Measured on the spike (4 restaurants with menus, 119 dishes): menu extraction 0.68 USD, nutrition 0.74 USD, check 0.08 USD (Claude Opus 5.5 / Sonnet 5.5), KI-Bild about 0.044 USD per image (gpt-image-2.6-flare, medium, 1024 px).
Wave 1 (5 Kieze, 118 restaurants with menus, 3,774 dishes, all on Claude): 67.55 USD logged, of which 13.65 USD Places at list price (inside the free monthly calls), menu 26.67 (including website lookups and the German translation), nutrition 23.06, check 1.90, images 2.92 (0.025 per low-quality image).
The same steps on OpenAI cost about half (`gpt-6.2-sol`): about 6 to 9 USD per Kiez including Places at list price.

## Nutrition method

- The model never outputs nutrition numbers; it names ingredients and cooked grams for one portion, choosing keys from `data/foods.json`.
- `data/foods.json`: 178 ingredients from USDA FoodData Central SR Legacy (public domain, CC0) plus 17 fixed composite recipes over those rows (doner meat, tzatziki, vinaigrette, coconut curry sauce, ...).
  Rebuild with `npm run build:foods -- <unzipped SR Legacy CSV dir>`.
- BLS (Bundeslebensmittelschlüssel) 4.0 has been free of charge since 16 Dec 2025, but blsdb.de publishes no explicit licence for redistributing a subset, so it is not bundled; the table has a `source` field, so BLS rows can be added once the licence is confirmed.
- Range: ±15 % (high), ±25 % (medium), ±35 % (low) confidence, ±5 % for official values; same spreads as `apps/web/src/data/scoring.ts`.
  Confidence starts from the model's recipe confidence and drops when ingredients cannot be matched or the portion is implausibly small.
- Protein per euro uses the lower end of the protein range, so optimistic estimates do not win rankings.
- Health score (0-100): 50 base; + protein energy share (10 % -> 0, 30 % -> +20); + fibre per 1000 kcal (0 -> 0, 14 g -> +15); + vegetables, fruit and legumes by weight (0 -> 0, 50 % -> +15); - saturated-fat energy share (10 % -> 0, 20 % -> -15); - sugar energy share (10 % -> 0, 25 % -> -10); - fried or processed-meat weight share (0 -> 0, 30 % -> -10); - portion size (900 kcal -> 0, 1400 kcal -> -10).
- Quality on the spike: against dean&david's 16 official values the computed estimates have a mean absolute kcal error of 15 % (bias -5 %), 10 of 16 official values inside our range; protein is about 8 g too high, mostly on chicken dishes.

## Layout

```
src/cli.ts            commands
src/orchestrator.ts   Kiez chief (stages 1-5 per Kiez) and waves (Kieze in parallel)
src/stages/           find, find-healthy, menu, classify, nutrition, check, image, review
scripts/classify-seed.ts  backfill: classify and dedupe the committed web seeds (cached by dish hash, ledger, budget)
src/sources/          osm (Overpass), places (Google Places API New), website (menu crawler), images (OpenAI)
src/llm/              Anthropic client (structured outputs, prompt caching, refusal fallback) and the offline fake
src/nutrition/        food table and the deterministic calculation
src/store/            D1-shaped DB interface, SQLite and D1 REST adapters, migrations
src/export/           seed JSON in the web contract shape, OSM opening hours parser
data/                 foods.json (USDA), kieze.geojson (ALKIS Ortsteile)
seed/                 exported seed JSON and KI-Bild files
test/                 node:test suites, including an end-to-end run on fixtures
```
