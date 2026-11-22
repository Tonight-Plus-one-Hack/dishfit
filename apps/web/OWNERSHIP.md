# Ownership for parallel screen work

Each screen worker owns exactly one folder under `src/screens/` and may change anything inside it.
Everything else is shared: change it only in the append-only way described below, so parallel branches merge cleanly.

## Screen folders

| Folder | Owner | Route | What it is |
| --- | --- | --- | --- |
| `src/screens/onboarding/` | onboarding worker | `/onboarding` | One question per screen goal setup (Cal AI pattern via `components/Flow.tsx`), writes `lib/profile.ts` |
| `src/screens/map/` | map worker | `/map`, `/map?r=<restaurant id>` | MapLibre map of restaurants with pins and a dish card |
| `src/screens/restaurant/` | restaurant worker | `/r/:id` | Restaurant facts, photos with attribution, menu with nutrition per dish |
| `src/screens/dish/` | dish worker | `/d/:id` | Price, kcal and macros with ranges, health score, protein per euro, "How is this calculated?" |
| `src/screens/filters/` | filters worker | `/search?<filters>` | Search plus filters (kcal, protein, price, open now, distance, Kiez); filter state lives in the URL query |
| `src/screens/today/` | today worker | `/today` | Daily overview against the goal, profile and goal edits |
| `src/screens/home/` | web-shell (reassignable) | `/` | Discover: best protein dishes under 12 EUR nearby, nearby restaurants |
| `src/screens/snap/` | Malek1414 (snap lane; first version built by fm/community) | `/scan`, `/scan?r=<id>&n=<name>`, `/scan/:id` | "Speisekarte scannen": photo (re-encoded, no EXIF/GPS), restaurant or new place with a map pin, send, review status and thank-you |
| `src/screens/community/` | fm/community2 | `/me`, `/bestenliste?k=<kiez>&p=week\|all` | Community profile (contributions, badges, nickname), Kiez leaderboard, "Hat das gestimmt?" (`ConfirmDish`, rendered on the dish page) and badge moments (`BadgeMoment`, `UnseenBadges`) |

Every route is registered in `src/lib/routes.ts` and `src/app/Screen.tsx` already, each pointing at the screen component exported from its folder.
Keep that component's name and props (`OnboardingScreen`, `MapScreen`, `RestaurantScreen({ id })`, `DishScreen({ id })`, `SearchScreen`, `TodayScreen`, `HomeScreen`).
Put new subcomponents, hooks and CSS for a screen inside its folder.

## Shared files

Append-only means: add new exports, fields, tokens, icons or routes at the end; never rename, remove or change the meaning of what exists.
If a shared change cannot be append-only, tell firstmate instead of making it.

| File or folder | Rule |
| --- | --- |
| `src/data/contract.ts` | Append-only: new optional fields and new types |
| `src/data/api.ts` | Append-only: new functions; existing signatures stay |
| `src/data/mock.ts`, `src/data/seed/` | Append-only: new seed records and new query helpers |
| `src/data/scoring.ts` | Placeholder formula; the app-logic lane may replace `healthScore` with the shared pipeline formula, keeping the signature |
| `src/data/hours.ts` | Shell-owned; propose changes to firstmate |
| `src/lib/routes.ts`, `src/App.tsx`, `src/app/Screen.tsx` | Shell-owned; all routes exist already. New routes are append-only |
| `src/lib/profile.ts`, `src/lib/diary.ts`, `src/lib/position.ts` | Append-only: new fields must be optional |
| `src/lib/*` (others) | Append-only |
| `src/components/` | New files are free to add; existing files append-only (`Icon.tsx`: add icons at the end) |
| `src/app/` (shell, tab bar, header) | Shell-owned |
| `src/styles/tokens.css` | Append-only, inside the app tokens block at the end |
| `src/styles/base.css`, `src/styles/motion.css`, `src/styles/fonts.css` | Shell-owned |
| `src/motion/` | Copied motion system; do not edit, add new helpers in new files |
| `public/`, `index.html`, `package.json`, `vite.config.ts` | Shell-owned; dependency additions need firstmate's go |

## Data rules for every screen

- Get data only through `src/data/api.ts`, wrapped in `useResource(key, load)` from `src/lib/resource.ts` with a Suspense boundary.
- Nutrition from `source: 'ai'` is always labelled as an estimate (`SourceBadge`) and shown as a range somewhere on the screen (`MacroGrid` or `formatRange`).
- Whatever renders a test restaurant or test dish shows the `TestBadge` ("Testdaten"); `RestaurantName` does this already.
- Never store or show Google rating, price level, photos or opening hours from our data; the restaurant screen shows them live via the Places UI Kit keyed by `placeId`, with Google attribution, and no Places content goes on the MapLibre map.
- A dish image is always an AI illustration with the "KI-Bild" label (`DishThumb` adds it).
- A dish without a price shows "Preis vor Ort" (`formatPrice`), never 0.
