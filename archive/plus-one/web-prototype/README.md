# Plus One web prototype

The first clickable Plus One prototype: React + Vite + TypeScript with plain CSS tokens, following the web-client conventions of the [AI app playbook](https://github.com/blakeandersonw/ai-app-playbook).
There is no backend and no login yet.
All data comes from one typed mock module, so the Workers API can replace it without touching the screens.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm run lint     # oxlint, warnings fail
```

`/api` and `/go` are already proxied to `http://localhost:8787` for when `wrangler dev` serves the Worker.

## Screens and routes

| Route | Screen | Reference |
| --- | --- | --- |
| `/` | Landing | Thayon layout and motion, own copy |
| `/cities` | City picker with popular hangouts and mood chips | Luma Discover |
| `/c/:slug` | City tonight: timeline of hangouts, map preview, traveller hand-off | Luma city page |
| `/h/:id` | Hangout details, join card, joined state with safety hints | Luma event page |
| `/h/:id/join` | Join flow: nickname, mood, 18+ confirmation, joined | Cal AI onboarding |
| `/c/:slug/spots` | Spots map with pins, filter chips, large cards, save heart, "Start a hangout here" | Resy |
| `/new`, `/c/:slug/new` | Start a hangout: city, vibe, spot, time, size and language, nickname, 18+, then a share step | Cal AI onboarding |

`/c/:slug/new` accepts `?time=HH:MM` and `?spot=<spot id>` presets, which skip those questions (used by the time chips on an empty city and by spot cards).
The share sheet (Web Share, WhatsApp, copy link) opens from the city, hangout, join and spots screens.
Shared links carry `utm_source=share&utm_medium=<native|whatsapp|copy>`.
Every partner link goes through `/go/<brand>?city=<slug>&from=<placement>` so the Worker can count it; in `npm run dev` without a Worker, the proxy falls back to the partner's city search.

## Structure

```
src/
  data/       types.ts (API shapes), api.ts (the only data entry point), cities, spots, hangouts (mock data)
  lib/        router (History API), resource (Suspense cache), session (saved spots, last nickname), time and clock, partners (/go links), share (UTM), motion, brand
  components/ Chrome (header, rails, footer), MapView (MapLibre, lazy), ShareSheet, Reveal (motion), ui
  screens/    one file plus stylesheet per screen
  styles/     fonts.css, tokens.css, base.css
  assets/     brand logo and fonts from brand/, artwork
```

## Data

- `src/data/types.ts` mirrors the API contract (`fm/t0-foundation` `lib/contract.ts` plus the deltas in `docs/team-prompts`) field for field.
- `src/data/api.ts` has one function per Worker route (`GET /api/cities`, `GET /api/cities/:slug`, `GET /api/cities/:slug/spots`, `POST /api/hangouts`, `GET /api/hangouts/:id`, `POST /api/hangouts/:id/join`, `GET /api/me`, `POST /api/events`) returning the contract response shapes.
  To connect the backend, replace those bodies with `fetch` calls; the screens only import from there.
- Fields marked PROPOSED in `types.ts` are not in the contract yet: `Hangout.title`, `Hangout.note` and `HangoutSummary.spot.neighborhood`.
  The UI falls back gracefully when they are missing.
- There is no leave action, because the contract has no leave route.
- Spots are a curated copy of the OpenStreetMap export on branch `fm/t1-spots` (`data/spots/*.json`, © OpenStreetMap contributors, ODbL).
- Hangouts, nicknames and lines are invented demo data and are labelled as demo in the UI.
- The mock keeps this device's joins and hosted plans in `localStorage`, standing in for the `wohin_device` cookie and D1; saved spots and the last nickname stay device-local (`src/lib/session.ts`).
- Prague has no demo plans on purpose, so the empty city state (start the first group, suggested times) is visible.

## Time

A night runs from 06:00 to 06:00 local time, so 01:30 still belongs to the evening before and plans expire at the next 06:00 (`src/lib/time.ts`).
Copy says "today" through the afternoon and "tonight" from 16:00; the city timeline groups plans into Daytime, Early evening, Later on and Late night.
In development, `?now=2026-11-22T11:00:00%2B01:00` on any URL shifts the clock for that tab (an empty `?now=` resets it), which makes Sunday daytime and after-midnight states easy to check.

## Motion

All animation timing lives in `src/styles/motion.css` (durations, easings, keyframes) and `src/lib/motion.ts` (script-driven timing).
Swap the measured reference values in there; no screen hard-codes a duration.
Reduced motion shows final states immediately.

## Brand

Logo, fonts and the hero and Berlin/Hamburg artwork are copied from `brand/` (do not edit `brand/`).
The other city and spot images are original generated artwork in the same blue-hour style.
`public/og-default.png` (1200x630) is the default link preview image the Worker's preview tags point to.
Map tiles come from [OpenFreeMap](https://openfreemap.org) (Positron style, © OpenMapTiles, data © OpenStreetMap), loaded only on map screens.
