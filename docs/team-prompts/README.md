# Team prompts: restaurant nutrition app (MenuFit / DishFit, final name open)

Three paste-ready prompts, one per teammate.
Each teammate pastes their whole file into their own coding agent (Claude Code or Codex) at the root of a fresh clone of https://github.com/Tonight-Plus-one-Hack/wohin.
Every prompt is self-contained: goal, why it matters for the 5K scoring, product, data basis, stack, exact files, API contract, Definition of Done, tests, schedule until Sunday 21:00, and what not to touch.
Sections 1 to 9 are identical in all three files, so every agent works from the same contract; sections 10 to 12 are the lane.
These prompts replace the Plus One prompts, which now live in `archive/plus-one/docs/team-prompts/`.

| File | Teammate | Lane |
| --- | --- | --- |
| [`Kalvarez09.md`](Kalvarez09.md) | `Kalvarez09` | Data pipeline review and data quality: phone review page for the pipeline's per-Kiez sample (`passt` / `falsch` written to D1 and exported back to the pipeline), second-line audit rules agreed with the pipeline agent, quality metrics, kill switch per Kiez, Kiez assignment for everyone |
| [`vinaynaik432-debug.md`](vinaynaik432-debug.md) | `vinaynaik432-debug` | Worker API and D1: contract alignment, OSM base columns, dish search with every filter, restaurants with map bbox, menu snap upload (R2, moderation, rate limits, EXIF strip), events and `/api/numbers`, admin, staging |
| [`Malek1414.md`](Malek1414.md) | `Malek1414` | Web app logic in `apps/web`: health score (matching the pipeline's), protein per euro, on-device personal ranking with reasons, one filter semantics for seed and API, data hooks (seed to API switch, events), the "snap a menu" upload flow |

## Kiez scans

Two more paste-ready prompts run the data pipeline on a teammate's own machine with keys Batu hands out privately (a Google key restricted to Places, an OpenAI key), one PR per teammate with per-Kiez output that merges cleanly.

| File | Teammate | Kieze |
| --- | --- | --- |
| [`scan-kalvarez.md`](scan-kalvarez.md) | `Kalvarez09` | Charlottenburg, Wilmersdorf, Schöneberg |
| [`scan-malek.md`](scan-malek.md) | `Malek1414` | Wedding, Moabit, Pankow, Tempelhof |

## Who owns what

| Area | Owner | Where it is |
| --- | --- | --- |
| `apps/web/` shell and screens (screens are added in parallel; see `apps/web/OWNERSHIP.md`) | Batu's web agents | on `main` (#16, #18, #21, #22) |
| `apps/web/src/lib/ranking.ts` (moved to `src/lib/ranking/`), `src/lib/filters/`, `src/screens/snap/`, `src/data/hooks/` | `Malek1414` | `web/*` branches |
| `pipeline/`, `worker/migrations/0010-0029` (find, menu, nutrition, check, images, review; queue with per-restaurant status; Kiez waves; `publish` into the Worker tables) | Batu's pipeline agent | on `main` (#23); Kiez scans per teammate add only `apps/web/src/data/seed/pipeline/kiez/<kiez>.json`, their images and `pipeline/registry/<kiez>.json` |
| `worker/` skeleton, `worker/migrations/0001-0009`, `archive/` | Batu's restructure agent | on `main` (#17) |
| `worker/src/routes/`, `worker/src/lib/`, `worker/src/db.ts`, `worker/src/index.ts`, `worker/wrangler.jsonc`, `worker/seed/`, `worker/migrations/0040-0049`, `docs/api.md`, `packages/contract/src/api.ts` and `model.ts` | `vinaynaik432-debug` | `api/*` branches |
| `worker/src/review/`, `worker/src/qa/`, `packages/contract/src/review.ts`, `worker/migrations/0030-0039`, `docs/quality/` | `Kalvarez09` | `qa/*` branches |
| Keys (Google Places, Anthropic, OpenAI) as Cloudflare secrets, Cloudflare account, production, merges | Batu only | - |

Migration ranges: `0001-0009` restructure, `0010-0029` pipeline, `0030-0039` Kalvarez09, `0040-0049` vinaynaik432-debug, `0050-0059` Batu's hotfixes.

## Data basis (assumption, swappable)

OSM is the stored base (name, address, coordinates, hours, website, with `osm_id` and ODbL attribution), menus come from the restaurants' own websites, Google Places is live only (EEA rules: only the place id is stored, ratings and photos show through Google's Places UI Kit), and user menu snaps are a moderated supplement.
The captain makes the final call soon; every prompt codes against `baseSource` and `menuSource.kind` enums so a change only touches the pipeline, a migration and an enum value.

## Kiez review duty

| Kiez (wave 1) | Reviewer |
| --- | --- |
| Mitte | `Kalvarez09` |
| Kreuzberg | `Kalvarez09` |
| Prenzlauer Berg | `vinaynaik432-debug` |
| Friedrichshain | `Malek1414` |
| Neukölln | `Malek1414` |

Wave 1 review done by Sunday 10:00.
Wave 2 proposal (from the pipeline's config; `Kalvarez09` confirms in `docs/quality/kiez-assignment.md`): Wedding and Moabit `Kalvarez09`, Charlottenburg and Wilmersdorf `vinaynaik432-debug`, Schöneberg `Malek1414`.
The pipeline's reviewer config (`pipeline/src/kiez.ts`, `pipeline/README.md`) follows this table; Pankow and Tempelhof (scanned by `Malek1414`) go to `vinaynaik432-debug` as a proposal.

How a Kiez goes live: the pipeline exports the review sample as CSV, it is uploaded to the review page, the reviewer marks `passt` / `falsch` on the phone, the export goes back into `npm run pipeline -- review import`, the pipeline approves the Kiez at 80 percent `passt`, and `publish` puts it live.

## Milestones

| When (Berlin) | What |
| --- | --- |
| Saturday 20:00 | First PR per teammate open |
| Saturday 22:00 | Integration on staging with real wave-1 data |
| Saturday ~23:00 | Live link; team devices excluded from the numbers |
| Sunday 10:00 | Wave-1 review done |
| Sunday 13:30 | Feature freeze |
| Sunday 15:30 | Submission: live link, 3 slides, real user numbers |
| Sunday 21:00 | Final numbers export, handoff notes |

## Merge order (Batu)

1. This PR, then the pipeline PR #23 (the review loop and `publish` need it on `main`).
2. First PRs, small and independent: `api/contract-align`, `qa/review-store`, `web/ranking`.
3. `api/search`, `qa/review-page`, `web/filters`, `web/data-hooks`.
4. `api/snaps`, `api/numbers`, `qa/audit`, `qa/kill-switch`, `web/snap`, `api/ops`.
5. Staging with real wave-1 data, team review, `review import` and `publish` per Kiez, production.

## Batu's human steps

1. PR #23 (pipeline) is merged and its reviewer config matches the table above; hand out the scan keys for [`scan-kalvarez.md`](scan-kalvarez.md) and [`scan-malek.md`](scan-malek.md) as private files.
2. Relay to the pipeline agent: append `dish_id` and `restaurant_id` columns to the review CSV, and write vinaynaik432-debug's new columns (`osm_id`, `base_source`, `cuisines`, `diet_tags`, `course`, `fiber_g`, `sugar_g`, `sat_fat_g`, `sodium_mg`) in `publish`.
3. Cloudflare: create staging and production D1 databases and R2 buckets (`wohin-images-*`, `wohin-snaps-*`), send `vinaynaik432-debug` the `database_id` values (not secrets), and upload the pipeline's AI images to the images bucket.
4. Set the Worker secrets yourself: `ADMIN_TOKEN`, `REVIEW_TOKEN` (`openssl rand -base64 32` each); give `REVIEW_TOKEN` to the three reviewers in person or by private message; set `ANTHROPIC_API_KEY` only if you want the optional snap AI pre-check.
5. Keep the Places, Anthropic and OpenAI keys out of the repo, the web bundle and the team chat.
6. Per Kiez: `npm run pipeline -- review export --kiez <slug>`, upload the CSV to `POST /api/admin/review/sample`, after the review download `GET /api/admin/review/export`, run `review import` and `publish`.
   `POST /api/admin/kieze/:slug/hide` is the kill switch; re-running `publish` restores.
7. Pass `docs/quality/rules.md` and its vectors to the pipeline agent so both quality lines agree.
8. Decide the data basis and the final name; tell the team if either changes.

## Was wir noch machen könnten

Sortiert nach Wirkung pro Aufwand (oben zuerst).
Aufwand: S = unter 1 Stunde, M = 1 bis 3 Stunden, L = mehr als 3 Stunden.

| # | Idee | Wirkung | Aufwand | Wofür | Wer |
| --- | --- | --- | --- | --- | --- |
| 1 | **Team-Geräte raus, dann Link in 5 bis 10 echte Gruppen** (WG-, Uni-, Gym-, Laufgruppen, r/berlin, Berlin-Expat-Gruppen) mit einem konkreten Hook pro Kiez: "40 g Protein unter 10 € in Neukölln, jetzt offen" | hoch | S | echte Nutzerzahlen | alle, ab Samstag 23:00 |
| 2 | **Öffentliche Live-Zahlen** `/numbers` (engaged, decided, Snaps) plus `GET /api/quality` (geprüfte Gerichte, Trefferquote, KI-Fehler gegen offizielle Werte) direkt auf Slide 2 und live in der Demo | hoch | S | Jury, Vertrauen | vinaynaik432-debug, Kalvarez09 |
| 3 | **"So rechnen wir"-Seite plus Badge "vom Team geprüft"**: Zutaten mit Gramm, Spanne, Kalibrierung gegen dean&david; genau die Schwäche, für die menufit 1-Stern-Reviews bekommt | hoch | S | Jury, Vertrauen | Batus Web-Agent, Kalvarez09 liefert Zahlen |
| 4 | **Kiez-Toplisten als Share-Karten** ("Top 5 Protein pro Euro in Kreuzberg") mit OG-Vorschaubild für WhatsApp und Instagram-Story, Link öffnet direkt die Liste | hoch | M | Viralität | Malek1414 (Logik), Batus Web-Agent (Karte) |
| 5 | **Snap-Loop sichtbar machen**: "Dein Kiez: 12 neue Gerichte dank 3 Fotos" nach dem Upload, plus Share-Aufforderung "Kennst du ein Lokal mit guter Karte?" | hoch | M | Growth, Datenbasis | Malek1414 |
| 6 | **Layla-Winkel "Neu in der Stadt"**: Link mit `?near=<Hotel oder Bahnhof>` zeigt die besten Gerichte im Umkreis von 10 Gehminuten; Slide: "Layla plant die Reise, wir sagen dir, wo du am ersten Abend gut isst" | hoch | M | Jury, Layla | Malek1414, Batu (Pitch) |
| 7 | **QR-Flyer/Sticker** an 5 Orten mit Laufkundschaft heute Abend und Sonntag früh (Gyms, Uni-Bibliothek, Coworking in Kreuzberg und Mitte), pro Ort ein eigener `utm_source` | mittel | S | echte Nutzer, messbar | alle |
| 8 | **"Wert stimmt nicht"-Button** am Gericht, Meldung landet in der Review-Liste; zeigt der Jury einen geschlossenen Qualitätskreislauf | mittel | M | Vertrauen | Kalvarez09, Batus Dish-Agent |
| 9 | **Restaurant-Badge "Auf DishFit mit Nährwerten"** als Bild, das wir 10 Restaurants per Mail oder Instagram schicken; jedes Repost bringt Reichweite | mittel | M | Viralität | Batu |
| 10 | **15-Sekunden-Reel**: Screen-Recording "Wo isst man in Kreuzberg 40 g Protein für 9 €?" für TikTok und Instagram, plus als Demo-Backup für den Pitch | mittel | M | Reichweite, Pitch | Batu |
| 11 | **Tages-Challenge "30 g Protein unter 10 €"** pro Kiez auf der Startseite, teilbar | mittel | M | Retention | Malek1414 |
| 12 | **Zweite Stadt als Teaser** (Hamburg oder Paris, Assets liegen in `brand/assets/`), 1 Kiez durch dieselbe Pipeline; Beweis für "jede Stadt, in der du landest" | hoch für Layla | L | Jury, Layla | Batus Pipeline-Agent, nach Sonntag 10:00 |

## Nachricht an das Team (zum Reinkopieren)

> Neue Prompts für heute Abend sind da, jeder hat seinen eigenen, einfach komplett in Claude Code oder Codex reinkopieren:
> Kalvarez09 (Review-Tool, Datenqualität, Kieze): https://github.com/Tonight-Plus-one-Hack/wohin/blob/main/docs/team-prompts/Kalvarez09.md
> vinaynaik432-debug (Worker-API, D1, Snap-Upload, Numbers): https://github.com/Tonight-Plus-one-Hack/wohin/blob/main/docs/team-prompts/vinaynaik432-debug.md
> Malek1414 (Ranking, Filter, Data-Hooks, Snap-Flow): https://github.com/Tonight-Plus-one-Hack/wohin/blob/main/docs/team-prompts/Malek1414.md
> Übersicht, Ownership und Ideen: https://github.com/Tonight-Plus-one-Hack/wohin/blob/main/docs/team-prompts/README.md
> Ziele: erster kleiner PR bis 20:00, Live-Link gegen 23:00, eure Kieze reviewt bis Sonntag 10:00, Freeze 13:30, Abgabe 15:30.
> Keine Keys ins Repo oder in den Chat, kleine PRs gegen main, ich merge. Fragen direkt hier im Chat.
