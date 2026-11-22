# Kalvarez09: scan Charlottenburg, Wilmersdorf and Schöneberg

You are the coding agent for GitHub user `Kalvarez09` on the hackathon team.
This is a paste-ready brief: read all of it, then do sections 3 to 7 in order.
Work on your own; there is no human step.

**Your job:** run the team's data pipeline for three Berlin Kieze (Charlottenburg, Wilmersdorf, Schöneberg) on this machine with the team keys that are already in the repo, check the result, and open one pull request with the output.
You do not write pipeline code.
If the pipeline breaks, follow section 8 and report to Batu instead of patching it.

## 2-command quickstart

```bash
cd pipeline && npm install    # no key setup: --member uses the team keys in pipeline/.env.team
npm run scan -- --kiez charlottenburg,wilmersdorf,schoeneberg --member kalvarez --by Kalvarez09
```

## 1. What the app is and where your data goes

We build a Berlin restaurant nutrition web app: a map of good restaurants and, for every dish, the price plus kcal, protein, carbs and fat as a clearly labeled AI estimate with a range and a confidence level ("KI-Schätzung"), a health score and protein per euro.
The pipeline (`pipeline/`, read `pipeline/README.md`) produces that data per Kiez in six stages:

1. Find: restaurants from OpenStreetMap inside the Kiez boundary, matched to Google Places results; Google is only used to filter (rating at least 4.3, open) and to get the place id, which is the only Google value we store.
2. Menu: the restaurant's own website (HTML, PDF or menu image), read by a model into dishes, sections and prices, with a German description; dish names stay exactly as printed.
3. Nutrition: the model only names ingredients and grams; code computes kcal and macros from USDA data.
4. Check: outlier flags, a second model re-estimates flagged dishes, and one judgement per Kiez.
5. Images: one AI illustration ("KI-Bild") for each restaurant's top dish.
6. Release: a teammate reviews a sample per Kiez (not you for your own Kieze).

`npm run scan` runs stages 1 to 5 and writes three things you commit:

- `apps/web/src/data/seed/pipeline/kiez/<kiez>.json`: the Kiez's restaurants and dishes for the web app.
- `apps/web/src/data/seed/pipeline/images/<dish>.webp`: the new KI-Bild files.
- `pipeline/registry/<kiez>.json`: who scanned the Kiez, counts, cost and the list of place ids.

The registry is the team's lock and dedupe list: a Kiez registered to someone else cannot be scanned without `--force`, and a restaurant already published by another Kiez (same Google place id or OSM element) is skipped, so parallel PRs from different people merge cleanly.
The web app reads every file in `kiez/` automatically; real data shows without the "Testdaten" badge.

## 2. Rules (non-negotiable)

- **No new keys in the repo, ever.** The only exception is `pipeline/.env.team`: temporary team keys that Batu committed on purpose and revokes after 2026-11-22. Never edit it, never add other key files, and never paste a key into code, a commit, a PR, an issue, a chat or a log you share. If a key leaks outside the repo, tell Batu immediately so he can revoke it.
- **Google only through the official Places API** as the pipeline calls it. No scraping of the Google Maps website or app, no copying of Google ratings, photos, reviews, names, addresses or opening hours into our data (EEA terms: only the place id is stored).
- **No delivery platforms.** Never fetch menus from Wolt, Lieferando, Uber Eats, Deliveroo or similar; the pipeline only notes such links and skips them. Do not add them as sources.
- **Respect robots.txt.** The menu fetcher checks it on every request; do not change, bypass or speed it up.
- **Labels stay honest.** Nutrition is "KI-Schätzung" with a range unless the restaurant prints official values; images are "KI-Bild"; nothing real is marked as test data and nothing invented is marked as real.
- **Stay in your lane.** Commit only the output files of your three Kieze (section 6). Do not edit pipeline code, other Kieze's files or other people's registry files. Do not run Kieze that are not yours.
- **Cost.** The scan stops itself at its budget (default 12 USD per Kiez, so 36 USD for your three). Do not raise it without asking Batu.

## 3. Prepare the machine

1. Check Node: `node -v` must print 22.18 or newer (the pipeline runs TypeScript directly with Node's built-in SQLite). If it is older, install the current Node LTS first.
2. Use a fresh, up-to-date clone of `https://github.com/Tonight-Plus-one-Hack/wohin` on `main`, then create your branch:
   ```bash
   git checkout main && git pull
   git checkout -b scan/kalvarez-charlottenburg-wilmersdorf-schoeneberg
   ```
3. Install: `cd pipeline && npm install`, then run the offline self-test (no keys, no cost): `npm run check`. It must end with `fail 0`.

## 4. Keys (nothing to set up)

The repo already contains the team keys in `pipeline/.env.team` (temporary hackathon keys, revoked after 2026-11-22).
`--member kalvarez` makes the pipeline use your own Google Places key from that file, plus the team's OpenAI key.

- Do not create `pipeline/.env.local` unless Batu asks you to; a value in it overrides the team file.
- `ANTHROPIC_API_KEY` stays unset: the text steps run on OpenAI (`gpt-6.2-sol`, second opinions on `gpt-6.1-terra`), and images always use OpenAI (`gpt-image-2.6-flare`).
- Never copy the team keys anywhere else.

## 5. Run the scan

From `pipeline/`:

```bash
npm run scan -- --kiez charlottenburg,wilmersdorf,schoeneberg --member kalvarez --by Kalvarez09
```

- The three Kieze run in parallel; expect 30 to 60 minutes. Log lines show each stage per Kiez.
- It is resumable: if it stops (network, laptop sleep, budget), run the same command again and it continues where it stopped without paying for finished work.
- The run's local database and generated images live in `pipeline/.data/` (gitignored); keep it until your PR is merged.
- Useful while it runs or afterwards: `npm run pipeline -- status --kiez charlottenburg,wilmersdorf,schoeneberg` and `npm run pipeline -- costs`.
- At the end it prints, per Kiez, the restaurants, dishes, KI-Bilder, skipped duplicates and cost, and writes the three output paths.

What to expect per Kiez (from wave 1): a few hundred OSM restaurants, of which 200 to 500 pass the Google rating filter; at most 50 of them go into menu reading (healthy cuisines first); about half have a readable menu on their own website, so roughly 15 to 30 restaurants and 400 to 900 dishes per Kiez.
Restaurants without a usable menu are normal (no website, JavaScript-only site, robots.txt, delivery platform only, no menu online).

## 6. Check the result, then commit and open the PR

1. Read `pipeline/registry/<kiez>.json` for each Kiez: `counts.restaurants` should be above 10 and `costUsd.total` within the budget.
2. Look at the data in the app:
   ```bash
   cd ../apps/web && npm ci && npm run dev
   ```
   Open the printed local URL at phone width, pick your Kiez in the chips on the home or search screen, and open five dishes from different restaurants.
   For each, compare the dish name and price with the restaurant's website (the "Quelle" link); note anything wrong in the PR.
   The numbers are estimates; flag only clear errors (a 200 kcal burger, a missing price that is on the menu, a dish that is not on the menu).
3. Commit only these paths:
   ```bash
   cd ..   # repository root
   git add apps/web/src/data/seed/pipeline/kiez/charlottenburg.json apps/web/src/data/seed/pipeline/kiez/wilmersdorf.json apps/web/src/data/seed/pipeline/kiez/schoeneberg.json \
           apps/web/src/data/seed/pipeline/images/ pipeline/registry/charlottenburg.json pipeline/registry/wilmersdorf.json pipeline/registry/schoeneberg.json
   git status   # must show nothing else staged; never pipeline/.env.local or pipeline/.data
   git commit -m "Scan Charlottenburg, Wilmersdorf, Schöneberg"
   git push -u origin scan/kalvarez-charlottenburg-wilmersdorf-schoeneberg
   ```
4. Open the PR against `main` (with `gh`, or on github.com):
   ```bash
   gh pr create --base main --title "Scan: Charlottenburg, Wilmersdorf, Schöneberg" --body "<summary>"
   ```
   In the body, put one table row per Kiez with restaurants, dishes, KI-Bilder, skipped duplicates and cost from the registry, the total cost, and the issues you found in the spot check.
   Batu reviews and merges; do not merge yourself.

## 7. Cost expectations

Measured on wave 1 and an OpenAI test run (USD):

| Per Kiez | Typical | Notes |
| --- | --- | --- |
| Find (Google Places Text Search) | about 3 at list price | 70 to 110 searches; usually inside Google's free monthly calls, so likely 0 billed |
| Menu reading (gpt-6.2-sol) | 2 to 4 | about 0.10 per restaurant with a website |
| Nutrition and check | 2 to 3 | about 0.003 per dish |
| KI-Bild (one per restaurant) | 0.4 to 0.8 | 0.025 per image |
| **Total** | **about 6 to 9** | hard stop at 12 per Kiez unless you pass `--budget` |

Every paid call is logged in `pipeline/.data/ledger.jsonl` and summed in your registry.

## 8. If something goes wrong

| Symptom | What to do |
| --- | --- |
| `node: bad option` or a syntax error at start | Node is older than 22.18; update Node |
| `GOOGLE_PLACES_API_KEY is not set` / `OPENAI_API_KEY is not set` | the command is missing `--member kalvarez`, or `pipeline/.env.team` is missing (pull `main`); see section 4 |
| `Places searchText 403` | the Google key is not enabled for "Places API (New)" or is restricted to other APIs; send Batu the error line (not the key) |
| `OpenAI ... 429` or `5xx` | rate limit or outage; wait a few minutes and run the same command again |
| `Overpass 429/502/504` | the free OpenStreetMap server is busy; wait a minute and run again |
| `budget reached` | the Kiez is partly done; tell Batu the numbers before running again with a higher `--budget` |
| `already registered to ...` | someone else owns that Kiez; check the Kiez names, never use `--force` without Batu |
| anything else | stop, copy the last 30 log lines (no keys in them) to Batu |

## 9. Definition of done

- One PR from `scan/kalvarez-charlottenburg-wilmersdorf-schoeneberg` against `main` with exactly the three Kiez files, their new images and their three registry files.
- The PR body lists per Kiez: restaurants, dishes, KI-Bilder, skipped duplicates, cost, plus the total cost and the spot-check notes.
- You looked at each Kiez in the running app.
- No key appears anywhere in the diff, the PR or the logs you shared.
