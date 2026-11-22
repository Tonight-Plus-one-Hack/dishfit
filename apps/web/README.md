# Restaurant nutrition web app (working name DishFit)

An installable web app for eating out healthily in Berlin: good restaurants on a map, and per dish the price plus kcal, protein, carbs and fat as clearly labelled estimates.
From 768 px it is a desktop website app; below 768 px it keeps the phone layout, which is the reference for the iOS app.
React + Vite + TypeScript with plain CSS tokens, following the web-client conventions of the [AI app playbook](https://github.com/blakeandersonw/ai-app-playbook).
There is no backend yet; every screen reads from one typed data module that a Worker API can replace.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm run lint     # oxlint, warnings fail
npm run test     # vitest (map pin layout)
npm run preview  # serve dist/, the service worker only runs here
```

`/api` is proxied to `http://localhost:8787` for when a Worker serves the API locally.

## Structure

```
src/
  app/        AppShell (safe areas, bottom tab bar), ScreenHeader, Screen (route to screen), desktop/ (desktop frame)
  screens/    one folder per screen: home, onboarding, map, restaurant, dish, filters, today
  components/ Flow (one question per screen), ShareSheet, MapView (MapLibre, lazy), DishCard, ui (badges, macros, score), Reveal,
              glyphs (icon set), Rings (macro, energy, health), DishTile, MiniMap, WeekStrip
  data/       contract.ts (types), api.ts (the only data entry point), mock.ts, scoring.ts, hours.ts, seed/
  lib/        router, routes, resource (Suspense cache), profile, diary, position, format, store
  motion/     motion tokens and framer-motion components from the motion system
  styles/     fonts, tokens, base, motion
```

Parallel screen work follows [OWNERSHIP.md](OWNERSHIP.md).

## Layouts

`src/app/viewport.ts` picks one of three tiers; every screen component renders in all of them.

| Width | Layout |
| --- | --- |
| below 768 px | Phone: one screen at a time above the bottom tab bar. Reference for the iOS app; unchanged by the desktop frame. |
| 768 to 1279 px | Tablet: icon rail sidebar that expands over the content, top bar, map with the right panel as a closable drawer. |
| 1280 px and up | Desktop: sidebar (Karte, Entdecken, Suche, Heute, Ich; foldable to a rail), top bar with search and the global filters, map with a docked right panel. |

On tablet and desktop, `/` (also `/map`), `/entdecken`, `/r/:id` and `/d/:id` render as the map workspace: the big map plus a right panel that shows the ranking, Discover, the restaurant or the dish.
The panel is the route, so every state deep-links.
`/search`, `/today` and 404 render in the main column; Today becomes a two-column dashboard; onboarding stays a focused flow without navigation.
Screens find out where they render through `useShellMode()` (`phone`, `page` or `panel`); `AppShell` drops the tab bar outside the phone layout.
The top bar's filters use the phone map's query keys on the map (`kiez`, `open=1`, `budget=0`, `protein=1`), are remembered for detail routes, and are handed to `/search` in its own keys.
The map legend filters pins and the ranking by restaurant specialty. The selection is shared as `category` in the map URL.

The map opens on Berlin at Kiez zoom: around the user when they shared a position inside Berlin, else around Moritzplatz, zoomed out only as far as needed to show the nearest restaurants.
A picked Kiez or category frames its restaurants, never zooming out past a few Kieze, and the map cannot leave Berlin.
The last view is kept per browser tab, so coming back from a restaurant or dish reopens it unchanged (`src/screens/map/camera.ts`).
On the phone the map keeps about half of a short in-app browser screen (390 x 664): one control row, a compact dish card and a sheet that shows only its heading until it is opened.

## Routes

| Route | Screen | Tab |
| --- | --- | --- |
| `/` | Map of restaurants, the start page (`/map` still opens it) | Karte |
| `/entdecken` | Discover: best protein dishes under 12 EUR nearby | Entdecken |
| `/search` | Search and filters, state in the query string | Suche |
| `/today` | Daily overview and profile | Heute |
| `/onboarding` | Goal setup; the first launch lands here | none |
| `/r/:id` | Restaurant | none |
| `/d/:id` | Dish | none |
| `/impressum` | Impressum (§ 5 DDG) | none |
| `/datenschutz` | Datenschutzerklärung (DSGVO) | none |

## Languages

DishFit starts in German for a German browser locale and in English otherwise. The DE / EN control in the desktop header, mobile Discover header and Today settings remembers the choice on the device.

Add app copy to both catalogs in `src/i18n/` and use `useTranslation()` in React components. The language context and `LanguageSwitch` can also be used by the landing page when it joins the app. The web lint checks for untranslated JSX text, and the catalog test checks that keys and interpolation slots match.

Menu data can provide `descriptionEn` alongside the original description. The app uses it in English when available and preserves the original dish and restaurant names. The legal text is published in German, with an English notice on each legal page.

## Impressum and Datenschutz

The responsible person's name, street, postal code and city, and email live in one file: `src/screens/legal/operator.json`.
While a field is empty, both pages show "Angaben folgen in Kürze" in its place, so no placeholder reaches the live site; an invalid email counts as empty.
Fill the file and rebuild to publish the data.
The footer links (`components/LegalLinks.tsx`) sit at the end of Entdecken and Heute on the phone and in the sidebar foot on tablet and desktop.
`src/screens/legal/DatenschutzScreen.tsx` describes the real data flows (Cloudflare, Google Places UI Kit, OpenFreeMap, photo uploads and AI review, analytics, local storage); update it whenever one changes.

## Data

- `src/data/contract.ts` defines `Restaurant` (Kiez, position, cuisine and opening hours from OSM tags or the restaurant website, Google `placeId`) and `Dish` (price, category, nutrition estimate with min/max ranges, confidence, source `official` or `ai`, method note, menu source URL, kind and fetch date, health score, protein per euro, AI image).
- Google Places data rule (EEA terms): the only stored Google field is `placeId`.
  Rating, price level, photos and Google opening hours are never stored or drawn on the MapLibre map. When enabled, the restaurant screen and Entdecken dish cards show live content through the Places UI Kit with Google attribution.
  Dish images are our own AI illustrations, always labelled "KI-Bild".
- `src/data/api.ts` exposes `listRestaurants(filters)`, `getRestaurant(id)`, `getDish(id)` and `topDishes(query)`; each body notes the Worker route it maps to.
- `src/data/seed/spike/` holds the raw output of the menu pipeline spike from 2026-11-21: Claude estimates for four of the ten spike restaurants (real places from OpenStreetMap, © OpenStreetMap contributors, ODbL; menus from the restaurants' own websites).
  The ten restaurants are in `seed/spike-restaurants.ts`; the six without a readable menu show "Noch keine Speisekarte".
  dean&david bowls and wraps use the chain's official nutrition values instead of the estimate.
- `src/data/seed/test-restaurants.ts` adds fifteen invented restaurants across Mitte, Kreuzberg, Prenzlauer Berg, Friedrichshain and Neukölln.
  They are test data and carry a visible "Testdaten" badge everywhere.
  They show in development only: production builds drop them (`src/data/seed/visible.ts`) unless `VITE_SHOW_TEST_DATA=true`.
- Ranges: official values ±5 %, AI estimates ±15/25/35 % for high, medium and low confidence (the spike measured about 19 % mean kcal error).
- Health score (0 to 100) and protein per euro are computed in `src/data/scoring.ts`; the app-logic lane replaces the score with the shared formula.
  Protein ranking and protein per euro use the lower end of the protein range, so optimistic estimates do not win.
- Content is visible without onboarding; Home offers the goal setup as a card, and `/onboarding` can be closed.

## Google Places key

Live Google content comes from the Places UI Kit web components, keyed by `placeId`. The restaurant screen uses `<gmp-place-details>` for photos, ratings, price level and opening hours. Entdecken cards show a live restaurant photo with Google attribution through `<gmp-place-details-compact>`, mounted only while the card is on screen; the compact map card leaves the photo to the restaurant screen. If a photo is unavailable, the card shows labelled dish artwork.
Places content is off by default: set `VITE_PLACES_ENABLED=1` to enable it. With it off the app makes no Places requests, even with a Maps key, and cards show the labelled illustration and the restaurant logo.
Nothing from Google is stored, proxied or drawn on the MapLibre map.
The same fallback applies when the browser key or `placeId` is missing and for test data.

To opt in after the Google services are enabled, set `VITE_PLACES_ENABLED=1` and supply a browser key via `VITE_GOOGLE_MAPS_API_KEY` (or `VITE_GOOGLE_MAPS_BROWSER_KEY`).
Vite inlines it into the bundle at build time, so it is public by design and must be restricted in the Google Cloud console:

- API restrictions: Maps JavaScript API, Places API (New) and Places UI Kit (the UI Kit fails with "This API key is not authorized to use this service" without it).
- Website restrictions: every origin that serves the app, with a port wildcard for local work, for example `http://localhost:*/*`, `http://127.0.0.1:*/*`, `https://*.workers.dev/*` and the production domain.

Local development and `npm run preview`: put the key into `apps/web/.env.local`, which git ignores, and never commit it.

```sh
VITE_PLACES_ENABLED=1
VITE_GOOGLE_MAPS_API_KEY=<browser key>
```

Deployed builds: the Worker in `worker/` serves `apps/web/dist` as static assets, so the key has to exist when `npm run build` runs, not at runtime.
Wrangler `vars` and secrets only reach the Worker and do not help here.
Set both variables in the build environment for Workers Builds, Pages or the CI job that runs `npm run build` before `wrangler deploy`.

## PWA

`public/manifest.webmanifest` (standalone, brand app icon, theme colour) and a hand-written offline-shell service worker in `public/sw.js`, registered only in production builds.
The layout respects `env(safe-area-inset-*)` and uses `100dvh`, so it fills an installed phone screen edge to edge with the tab bar above the home indicator.

## Brand and motion

Tokens, the app icon and the UI primitives come from the Plus One brand kit and web prototype.
Type follows Cal AI: the Apple system font (SF Pro Text and Display through `-apple-system`, `ui-rounded` for large numbers), with Inter (`@fontsource-variable/inter`, SIL OFL) as the fallback elsewhere; SF Pro is never embedded (`src/styles/fonts.css`).
`src/motion/` is the motion system (`motion.json` tokens, curves, framer-motion components); CSS timing for simple transitions lives in `src/styles/motion.css`.
The product name is a working name; change it in `src/lib/brand.ts`, `index.html` and `public/manifest.webmanifest`.
Map tiles come from [OpenFreeMap](https://openfreemap.org) (Positron style, © OpenMapTiles, data © OpenStreetMap), loaded only on the map screen.
