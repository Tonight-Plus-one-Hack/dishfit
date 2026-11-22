# Agent prompt: menu scan in the Cal AI style (web + iOS)

Paste everything below the line into your coding agent.
It is self-contained; the agent reads the repo files it names.

---

You are the coding agent for GitHub user `vinaynaik432-debug` on the DishFit team (repo `Tonight-Plus-one-Hack/wohin`).
Work autonomously.
Your job: rebuild DishFit's scan flow (camera, analysing state, result) so it feels as polished and fast as Cal AI, on **both** the web app (`apps/web`, 390 to 1440 px) and the native iOS app (`apps/ios`), by **reverse-engineering the Cal AI reference screens one by one**.
You build DishFit's own version: our brand, our data, our copy, our components.

## 0. Hard rules

1. **No foreign assets.** Never copy Cal AI's icons, illustrations, photos, logo, wording, prices or code into the app, the site or any committed file outside `docs/refs/calai/`. The reference images live only in `docs/refs/calai/` and are never imported by app code.
2. **Our brand.** Purple-blue accent and gradient (`--accent`, `--brand-grad`; iOS `Design.accent`, `Design.brand`), clay icons (`apps/web/src/components/glyphs`, `apps/ios/Fit/Assets.xcassets/Clay*`). Where Cal AI uses black or orange, use the mapping table in `docs/refs/calai/spec.md` section 1.
3. **Keep DishFit's UI conventions.** Read the root `AGENTS.md`: layout, colours, typography, components, avatars and animations are preserved. Reuse existing components (`Rings.tsx` `MacroRing` / `EnergyRing` / `HealthRing`, `ui.tsx` `MacroGrid` / `ScoreRing` / `SourceBadge`, `DishCard`, `Design.swift`, `DustEffect.swift`). New tokens go **append-only** at the end of `apps/web/src/styles/tokens.css`; never change existing values. Any change to the overall visual language (not just the scan flow) needs Batu's OK first: open a draft PR with screenshots and ask.
4. **Honest numbers.** Every kcal and macro value stays a labelled AI estimate ("KI-Schätzung") with its range and confidence, exactly as today. Nothing invented, no fake ratings, no fake user counts.
5. **Value first.** No login and no quiz before the first scan result. The paywall is a separate issue; do not add one here.
6. **German UI copy**, written fresh for DishFit (the existing copy in `apps/web/src/screens/camera/CameraScreen.tsx` and `apps/ios/Fit/ScanView.swift` is the tone reference). Never hardcode the product name: the web app reads it from `apps/web/src/lib/brand.ts`, and new iOS strings do not contain it.
7. Never start a shell command with `cd`; use absolute paths or `( cd <abs> && … )`.

## 1. Read first (in this order)

1. `docs/refs/calai/spec.md`: the measured values (layout, type, colours, radii, motion) and the Cal AI to DishFit mapping.
2. `docs/refs/calai/SOURCES.md` and the images in `docs/refs/calai/` (`09`/`10` camera, `03`/`11`/`12` result, `07`/`08` home, `16` flow).
3. Current web scan: `apps/web/src/screens/camera/CameraScreen.tsx`, `camera.css`, `apps/web/src/data/scans.ts`, `apps/web/src/lib/photo.ts`, `apps/web/src/lib/diary.ts`, `apps/web/src/lib/cards.ts`, routes in `apps/web/src/lib/routes.ts` (`/kamera?art=karte|teller`).
4. Current iOS scan: `apps/ios/README.md` (section "Menu scan"), `apps/ios/Fit/ScanView.swift`, `MenuPhoto.swift`, `DustEffect.swift`, `Dust.metal`, `Worker.swift`, `Diary.swift`, `FitUITests/ScanFlowTests.swift`.
5. Backend: `worker/src/routes/scans.ts`, `worker/src/scans/estimate.ts`, `worker/migrations/0043_scans.sql`, `worker/migrations/0001_init.sql` (`dishes`), `worker/migrations/0049_menu_items.sql`.
6. Motion system: `docs/design/motion/motion-spec.md`, `apps/web/src/styles/motion.css`, `docs/design/motion/ios/Motion.swift`.

## 2. Target user flow

1. **Entry.** One clear scan entry: the existing scan tab on iOS and the camera entry on web (phone tab bar and desktop sidebar). On "Heute" and on the map, a floating round "+" action opens the camera directly, styled with DishFit tokens (Cal AI ref `07`/`08`, black "+" at bottom right).
2. **Camera** (ref `09`/`10`, spec section 4). Full-bleed live camera, translucent round back button, centred title, white corner-bracket viewfinder, a mode pill with "Speisekarte" (default) and "Teller", a big white shutter, photo-library button, flash toggle on iOS.
   - iOS: AVFoundation live preview with the overlay (replaces `MenuCamera`, the `UIImagePickerController` wrapper in `MenuPhoto.swift` shown via `fullScreenCover` in `ScanView.swift`), PhotosPicker for the library, the simulator keeps "Beispielkarte verwenden".
   - Web phone: `getUserMedia` live preview in a full-screen layer with the same overlay; fall back to the current `<input type="file" capture>` when permission is denied or unavailable. Web desktop (≥ 768 px): no live camera by default; keep upload / drag and drop inside the desktop panel, styled with the same viewfinder frame.
3. **Analysing** (spec section 7). The shot photo stays on screen with a progress state, then the result appears. iOS keeps the existing particle reveal (`DustEffect.swift`, PR #59) and its Reduce Motion crossfade. Web gets a matching, lighter reveal (CSS/WAAPI; e.g. a left-to-right mask sweep on the photo plus staggered list entry at `--stagger`), with `prefers-reduced-motion` falling back to a crossfade. Progress must be honest: indeterminate until the response arrives (or real per-dish progress once the streamed backend exists, section 4).
4. **Result.**
   - **Menu scan:** header with restaurant name (if read) and dish count; a ranked list of DishFit dish cards (name, price, kcal with range, three macro rings or `MacroLine`, `HealthRing`, "KI-Schätzung" badge). Tap a dish to open the dish sheet below.
   - **Dish sheet / plate scan** (ref `11`/`12`, spec section 5): photo hero, white sheet with ~28 pt top radius overlapping it, dish name, servings stepper (scales the shown values), big kcal tile, three macro tiles in DishFit macro colours, health score, ingredients (plate scan `items`), ranges and confidence visible.
   - **Actions** pinned at the bottom: secondary "Korrigieren" (only if you implement editing; otherwise leave it out, do not ship a dead button) and primary "Eintragen" (logs into "Heute" via `lib/diary.ts` / `Diary.swift`), plus "Karte speichern" for menu scans (existing `saveCard`) and the existing community share for menus.
5. **Back on "Heute"** the logged item appears at the top of the day list with its photo thumbnail (Cal AI "Recently uploaded", ref `07`), and the kcal/macro rings animate to the new totals with the existing ring motion.
6. **Errors** use the Worker's German messages (rate limit 429, not a menu 422, unavailable 503) in the same visual language, with "Nochmal versuchen" and "Anderes Foto".

## 3. Reverse-engineering method (do this for every screen)

Work screen by screen in this order: camera, analysing, menu result list, dish sheet, logged state on "Heute", error state.
For each screen:

1. **Capture.** Open the reference image(s) from `docs/refs/calai/`. Capture the current DishFit screen at the same size: web with Playwright at 390 × 844 and 1440 × 900 (`e2e/` has the setup), iOS on the iPhone 17 simulator (`xcrun simctl io booted screenshot`). Store captures under a scratch folder outside the repo, not in git.
2. **Measure.** List every element of the reference with position, size, spacing, radius, font size/weight, colour and state, starting from the values in `spec.md` and refining them on the image. Write the list as a short table in your PR description per screen.
3. **Spec.** For each element, write the DishFit equivalent: which existing component or token, which German copy, which data field. Mark anything you deliberately do differently and why (brand, honesty rule, DishFit feature).
4. **Build.** Implement web and iOS from the same spec. Reuse components; add a component only if nothing fits, and then add it on both platforms with the same name and props.
5. **Compare side by side.** Put the reference and your build next to each other at the same scale (for example `magick montage ref.png ours.png -tile 2x -geometry +8+8 compare.png`) and fix every visible gap in spacing, alignment, hierarchy, weight and motion until they read as the same quality level. Be picky: pixel-level alignment, no clipped text, no jumpy layout, no double borders.
6. **Motion.** Record the reference motion values from `spec.md` (option fill ~130 ms, screen change ~300 ms crossfade with ~70-100 ms stagger, zoom ~500 ms ease-out) and match them with DishFit's motion tokens; test with reduced motion on.
7. Attach the side-by-side images for every screen (web 390, web 1440, iOS) to the PR description.

## 4. Backend interfaces

### Available now on `main`

`POST /api/scans` (multipart form: `kind` = `menu` | `plate`, `photo` = JPEG/PNG/WebP ≤ 5 MB) returns `{ scan: ScanView }`:

```ts
type Range = { value: number; low: number; high: number }
type Nutrients = { kcal: Range; protein: Range; carbs: Range; fat: Range }
type ScanView = {
  id: string; kind: 'menu' | 'plate'; createdAt: string; mode: string; costUsd: number
  photo: { url: string; expiresAt: string } | null   // private, this device only, 30 days
} & (
  | { kind: 'plate'; plate: { name: string; items: string[]; nutrients: Nutrients; confidence: 'low' | 'medium' | 'high'; note: string | null } }
  | { kind: 'menu'; menu: { restaurantName: string | null; dishes: { name: string; description: string | null; priceEur: number | null; nutrients: Nutrients }[] } }
)
```

- Errors: `{ error: { code, message } }` with 400, 413, 415, 422 (`bad_request`: not food / not a menu, message in German), 429 (`rate_limited`), 503 (`unavailable`: no model or daily budget reached).
- Limits: 6 scans per hour and 20 per day per device cookie and per hashed IP, counting failures; daily spend cap `SCAN_DAILY_BUDGET_USD` (default 1 USD).
- `GET /api/scans?kind=menu|plate` lists this device's scans (newest first, max 100); `DELETE /api/scans/:id`; `GET` / `DELETE /api/scans/:id/photo`.
- Identity is the signed device cookie (`worker/src/lib/device.ts`); iOS sends it back automatically via `URLSession` cookies.
- Local dev: `npm run dev` starts the Worker; `SCAN_AI_MODE=mock` returns sample readings without any model call or cost. Web clients: `apps/web/src/data/scans.ts`; iOS: `Worker.scanMenu(_:)`.

### Catalog data for matching (D1)

- `dishes`: `kcal`, `protein_g`, `carbs_g`, `fat_g` each with `_min` / `_max`, `nutrition_source` (`ai` | `official`), `confidence`, `method_note`, `ingredients` JSON, `health_score` 0-100, `protein_per_euro`, `price_cents`, `restaurant_id`.
- `menu_items`: internal inventory of first-party menu items with `nutrition` JSON (`kcal`, `proteinG`, `carbsG`, `fatG` as `[value, min, max]`, `source`, `confidence`, `method`).
- Read routes: `GET /api/dishes/top`, `GET /api/dishes/:id`, `GET /api/restaurants`, `GET /api/restaurants/:id`.
- If a scanned menu belongs to a restaurant already in the catalog (match by restaurant name plus the user's position), show the catalog's sourced values first and link to the dish detail; this is a DishFit-only advantage over Cal AI. Do this only if you can do it without new Worker routes, otherwise note it as a follow-up.

### Malek's scan pipeline (planned, not on `main`)

Malek's PlatePal backend (`origin/new-backend`, `apps/snapmenu-api`) has a stronger menu engine: per-component provenance (USDA / Open Food Facts / recipe estimates), deterministic arithmetic, a per-dish goal `score` and `why`, `top` / `avoid` ranking, and a streamed `POST /api/menu` that sends server-sent events (`start`, `menu`, `dish` per dish, `result`, `tips`, `done`, `error`) so the first dishes show after about 3 s instead of about 20 s (see `apps/snapmenu-api/STREAMING.md` on that branch).
That branch has an unrelated git history and is **not** merged as a whole; its useful parts are being ported into DishFit's Worker in a separate PR, keeping DishFit's `POST /api/scans` contract and adding fields to it.
So: build against `POST /api/scans` now, behind one small client-side adapter per platform (`ScanSource`) that turns a response into a normalised view model (`dishes[]` with ranges, optional `score`, `why`, `sources`, ranking).
Make the result UI tolerate those optional fields today (hide what is missing) and make the analysing state able to render dishes incrementally, so switching to the streamed variant later only changes the adapter.
Do not call the PlatePal Worker, do not copy its code (AGPL-3.0) and do not add Worker routes in this task.

## 5. Acceptance criteria

### Web (390 to 1440 px)

- [ ] Camera opens from the tab bar (phone), sidebar (desktop) and the "+" action on "Heute" and the map, and defaults to "Speisekarte".
- [ ] Phone (390 × 844): live `getUserMedia` preview with viewfinder brackets, mode pill, shutter and library button; permission denied or unsupported browsers fall back to the file picker with no dead UI.
- [ ] Desktop (1440 × 900 and 1024 × 768): upload / drag and drop in the panel with the same visual language; no layout breaks between 390 and 1440 px (also check 768 and 1280).
- [ ] Analysing state shows the user's photo and an honest progress state; the reveal respects `prefers-reduced-motion`.
- [ ] Menu result: ranked dish list with kcal + range, macros, health score and "KI-Schätzung"; tapping a dish opens the dish sheet.
- [ ] Plate result / dish sheet: photo hero, overlapping sheet, servings stepper that scales all values, kcal tile, three macro tiles, ingredients, confidence.
- [ ] "Eintragen" logs into "Heute"; the entry appears at the top with thumbnail and the rings update.
- [ ] 422 / 429 / 503 show the Worker's German message with retry and another-photo actions.
- [ ] Side-by-side reference vs. DishFit images at 390 and 1440 for every screen are in the PR.
- [ ] No asset, text or code from Cal AI anywhere outside `docs/refs/calai/`.

### iOS (iPhone 17 simulator, iOS 26)

- [ ] Scan tab and the "+" action open a full-screen AVFoundation camera with the same overlay; simulator path "Beispielkarte verwenden" still works; PhotosPicker works.
- [ ] Camera permission denied shows a clear German explanation with a link to Settings.
- [ ] Analysing keeps the particle reveal from `DustEffect.swift`; Reduce Motion crossfades.
- [ ] Menu result list and dish sheet as on the web (same structure, `Design.swift` tokens, Dynamic Type up to XXL without clipping, VoiceOver labels on every control and value incl. ranges).
- [ ] "Eintragen" writes to `Diary.swift` and the "Heute" tab updates.
- [ ] Errors as on the web.
- [ ] Side-by-side reference vs. DishFit images for every screen are in the PR.

## 6. Tests

- Web unit tests (Vitest, next to the code) for the `ScanSource` adapter: `/api/scans` menu and plate responses, optional fields missing, every error status.
- Playwright (`e2e/`): a scan journey at 390 × 844 and 1440 × 900 against the mock Worker (`SCAN_AI_MODE=mock`): open camera, choose a photo (file chooser fallback), see analysing, see the menu list, open a dish, log it, see it on "Heute"; plus the 429 path with a mocked response. Add screenshots as test artifacts.
- iOS: extend `FitUITests/ScanFlowTests.swift` for example menu → result list → dish sheet → log → "Heute"; unit tests for the adapter and the servings scaling.
- Worker: no changes expected; if you touch it, `npm test -w @wohin/worker` must stay green.
- Before you open the PR: `npm run lint`, `npm run check`, `npm test`, `npm run e2e`, and the `xcodebuild … test` command from `apps/ios/README.md` all pass. Fix flaky tests you meet instead of retrying them.

## 7. Delivery

- Branch from `main`, one PR titled "Menü-Scan im Cal-AI-Stil (Web + iOS)", linked to the GitHub issue.
- PR description: per screen the measurement table, the DishFit spec, the side-by-side images (web 390, web 1440, iOS) and a short motion note.
- Do not merge yourself; ask Batu for review.
