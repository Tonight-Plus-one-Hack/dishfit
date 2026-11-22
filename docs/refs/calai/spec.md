# Cal AI reference: measured values spec

What Cal AI does, measured from the reference screens in this folder, and how each pattern maps onto DishFit.
Sources and measurement basis are in [SOURCES.md](SOURCES.md).
All sizes are iOS points on a 393 pt wide phone; on the web 1 pt = 1 CSS px at the 390 px phone width.
Values marked "~" are estimates from compressed images and are accurate to about ±2 pt; confirm them on a real device capture when you reverse-engineer a screen.

**This is a reference, not a source of assets.**
Do not copy Cal AI's icons, illustrations, photos, copy, prices, logo or code into DishFit.
DishFit keeps its own brand (purple-blue accent and gradient, clay icons) and its existing UI conventions (see the repo `AGENTS.md`).
Where Cal AI uses a colour, the "DishFit mapping" column names the existing DishFit token to use instead.

## 1. Global system

| Property | Cal AI measured | DishFit mapping |
| --- | --- | --- |
| Page background | White `#ffffff`; Home has a faint top wash `#fbfcfd` | Web `--canvas` / `--shell-bg`; iOS `Design.canvas` |
| Card surface | White, soft shadow, no border | Web `--soft-card` + `--soft-card-shadow`; iOS `Design.surface` + existing card shadow |
| Option / tile fill (unselected) | `#f7f6fd` (cool lavender grey) | Web `--surface` or `--accent-soft`; iOS `Design.accentSoft` |
| Primary action fill | `#000000` (onboarding), `#0c0b0e` (paywall) | Web `--cta` `#111113`; iOS `Design.cta` |
| Disabled action fill | `#b1b0b3` with white label | Web `--muted-decorative` `#8b8d98` at reduced opacity, or existing disabled button style |
| Selected option | Fill `#000`, white text and icon | Existing DishFit selected style (`--cta` fill, or `--accent` where DishFit already uses accent for active states) |
| Primary text | `#000000` | `--ink` `#1c2024` / `Design.ink` |
| Secondary text | Mid grey `~#8a8a8e` | `--muted` `#60646c` / `Design.muted` |
| Ring track | `#e0dfdf` (kcal), tinted light track per macro | `--ring-track` `#eeeef3` / `Design.track` |
| kcal ring progress | `#18141e` (near black) | DishFit `EnergyRing` (brand gradient) |
| Protein / carbs / fat | `#dd6464` / `#dd9866` / `#6d9bdf` | `--macro-protein` `#ef5b4c` / `--macro-carbs` `#f5a524` / `--macro-fat` `#3d9df6` (iOS `Design.protein/carbs/fat`) |
| Health score bar | Green fill on light track | DishFit `HealthRing` bands (`--band-green/orange/red`) |
| Font | SF Pro (system), large numbers in semibold/bold | Same system stack (`--font-sans` / `--font-display`; iOS system font). Use `--font-rounded` only where DishFit already does |
| Side margin | 16 pt for full-width buttons, 22-24 pt for option cards | Web `--rail` and existing screen padding; iOS existing padding |
| Corner radius | Option card ~12 pt; tiles ~14-16 pt; cards ~20-24 pt; sheets ~28 pt top; buttons full pill (onboarding) or ~16 pt (paywall CTA, 64 pt tall) | Keep DishFit's existing radii (`--radius-card`, `--shell-radius`, iOS card radius); use pill buttons only where DishFit already does |

## 2. Onboarding (refs 01-06)

Cal AI asks many questions before the first value.
DishFit's product rule is the opposite: value first, no long quiz before the first result.
Use only the visual patterns below; keep DishFit's existing short onboarding flow and step count.

| Element | Measured |
| --- | --- |
| Splash | White, centred wordmark, ~230 ms crossfade into welcome |
| Welcome hero | Top ~65 % of the screen is an animated device mockup; slides auto-advance roughly every 1.5-2 s |
| Welcome title | Centred, 2 lines, ~28 pt semibold, line height ~1.2, black |
| Get Started button | 51 pt tall, full pill, 16 pt side margins (361 pt wide), black, white ~17 pt semibold label |
| Secondary link | "Already have an account? Sign In", ~14 pt, centred, ~12 pt below the button, "Sign In" bold |
| Language chip | Top right, small grey pill with flag and code |
| Quiz header | Back arrow in a ~28 pt light circle at left, then a 2 pt progress bar (track `#e7e7e7`, fill black) ~67 pt from the top |
| Quiz title | Left aligned, ~28 pt semibold, max 2 lines, 24 pt left margin |
| Quiz subtitle | ~14 pt, grey, one line under the title |
| Option card, single line | 61 pt tall, fill `#f7f6fd`, radius ~12 pt, label ~16 pt medium centred, 12 pt gap between cards |
| Option card, icon + two lines | ~75 pt tall, leading icon in a ~24 pt circle, title ~16 pt semibold, subtitle ~12 pt |
| Continue | Pinned 16 pt from the sides and above the home indicator, 50 pt tall, disabled `#b1b0b3`, enabled black; a ~60 pt white fade sits above it so content scrolls under it |

### Onboarding motion (measured at 30 fps from the walkthrough)

| Moment | Measured |
| --- | --- |
| Option tap | Fill switches in ~130 ms (4 frames), no scale bounce |
| Continue to next question | No horizontal push: old content fades out and new content fades in within ~300 ms; the new options appear one after another ~70-100 ms apart (ref 06); the progress bar grows to the next step |
| Welcome carousel | Device mockup zooms from the whole phone into the cropped app content in ~500 ms, ease-out |

## 3. Home / daily overview (refs 07, 08, 16)

DishFit already has this screen as "Heute" (web `screens/today`, `FitDay`, `WeekStrip`, `Rings`; iOS `TodayView.swift`), styled after Cal AI in PR #25.
It is listed here because the scan result lands on it; do not redesign it.

| Element | Measured |
| --- | --- |
| Header | Wordmark left, streak chip right (white pill, flame + number) |
| Week strip | 7 day circles ~36 pt, today on a light rounded tile `#f0f0f4`; ring green when on goal, red when over, dashed grey when empty |
| Calories card | White, radius ~24 pt, soft shadow; big number ~44 pt bold with a grey "/goal"; label "Calories left"; ring at right, diameter ~100-120 pt, stroke ~7 % of the diameter, round caps, icon centred |
| Macro cards | Three equal columns, ~10 pt gap, white, radius ~16 pt; value "75/150g" ~17 pt semibold with grey denominator; ring ~68 pt with ~4.5 pt stroke; coloured glyph in the centre |
| Recently uploaded | White list cards radius ~16 pt; photo thumbnail ~96 pt square on the left; name ~15 pt medium, time ~12 pt grey at right; kcal row with flame ~16 pt semibold; macro chips with coloured glyphs |
| Tab bar | 4 tabs + floating black "+" circle (~56 pt) at the right that opens the scanner |

## 4. Scan camera (refs 09, 10, 16)

| Element | Measured |
| --- | --- |
| Canvas | Full-bleed live camera, no chrome other than the overlays below |
| Top bar | Back button: ~40 pt circle, translucent black (~30 %), white chevron; centred title "Scanner" ~17 pt semibold white; "…" circle at right |
| Viewfinder | Four white rounded corner brackets (~3 pt stroke, ~40 pt arms) around a centred square ~70 % of the screen width |
| Mode bar | Translucent white pill above the shutter; the active mode is a solid white chip with icon + label ("Scan food"); other modes are icons (barcode, food label, photo library) |
| Shutter | White ~72 pt circle with a thin ring, centred ~40 pt above the home indicator |
| Secondary controls | Flash toggle ~40 pt circle at bottom left; gallery at bottom right (DE); zoom pill ".5x / 1x" above the mode bar |

DishFit mapping: the modes are "Speisekarte" (menu, default for DishFit) and "Teller" (plate); keep the existing "Beispielkarte verwenden" fallback on the simulator and the photo-library picker.

## 5. Scan result (refs 03, 11, 12, 16)

| Element | Measured |
| --- | --- |
| Photo hero | Top ~45 % of the screen, full bleed, the user's own photo |
| Overlay bar | Back circle left, title ("Nutrition" / "Nährwerte") centred, share + "…" circles right; same style as the camera top bar |
| Sheet | White, top radius ~28 pt, overlaps the photo by ~24 pt |
| Meta row | Bookmark icon + time ("18:21") in a small grey chip |
| Dish name | ~20 pt semibold, 2 lines max |
| Servings stepper | Pill at the right of the name, 1 pt grey border, "−  1  +", ~36 pt tall |
| Calories tile | Full width: flame in a grey circle, "Calories" ~13 pt grey, value ~32 pt bold |
| Macro tiles | Three columns (DE) or a 2 × 2 grid together with calories (EN); coloured glyph, label ~12 pt grey, value ~17 pt semibold, small grey edit pencil at bottom right; 1 pt `#eee` border, radius ~14 pt |
| Health score | Heart in a pink circle, "Health score", "7/10" at right, green bar ~4 pt |
| Ingredients | Section title + "+ Add" at right, one row per ingredient with kcal and amount |
| Actions | "Fix Results" outlined pill with sparkle icon + "Done" black pill, equal widths, ~48 pt tall, 16 pt margins, pinned to the bottom |

The labelled callouts on the photo in the App Store frames ("Blueberries 8") are marketing overlays, not app UI.

DishFit mapping for a **menu** scan (the main DishFit case): the result is a list of dishes, not one plate.
Use the sheet + tiles language for the **dish detail** reached from the list, and a ranked list (DishFit dish cards with kcal, three macro rings or MacroLine, HealthRing, price) for the menu overview.
Every number stays a labelled "KI-Schätzung" with its range (DishFit rule), which Cal AI does not show.

## 6. Paywall (refs 13-15)

Three full screens in sequence, each with the same footer.

| Element | Measured |
| --- | --- |
| Top bar | Back chevron left (steps 2 and 3), "Restore" ~15 pt grey text at right |
| Title | Centred, 2-3 lines, ~30 pt bold (heavier than onboarding), black |
| Step 1 visual | Device mockup playing the scan flow |
| Step 2 visual | Large grey bell (`#dde6e7`) with a red badge (`#d23228`) showing "1" |
| Step 3 timeline | Three rows; node circles ~33 pt: orange `#fe8e04` (today, unlock icon), orange (reminder, bell icon), black (billing day, crown icon); vertical connector ~8 pt wide, light orange `#fbcf90` between orange nodes and grey `#9f9c9f` after; row title ~20 pt regular, description ~16 pt grey with the concrete charge date |
| Plan cards | Two columns, 168 pt wide each, 24 pt gap, ~84 pt tall, radius ~16 pt, 2.5 pt border; unselected: grey `#aaa` border + empty radio; selected: black border + black check circle + black badge pill (~24 pt tall, white bold caps ~12 pt) centred on the top edge |
| Reassurance row | Check mark + "No Payment Due Now", ~17 pt medium, centred |
| CTA | 64 pt tall, 16 pt margins, `#0c0b0e`, radius ~16 pt (rounded rectangle, not a pill), white ~20 pt semibold label |
| Footer | Price sentence ~15 pt grey centred under the CTA |

DishFit mapping: orange accents become the DishFit brand gradient / `--accent`; the CTA uses `--cta`; prices, trial length and plan names come from configuration and are pending a product decision.
Never show invented ratings, user counts, prices or savings percentages.

## 7. Patterns that apply to DishFit

| Cal AI pattern | Apply in DishFit | Not applicable |
| --- | --- | --- |
| One black "+" entry point to the scanner from everywhere | Yes: the scan entry on the map and on "Heute" opens the camera directly | |
| Full-bleed camera with corner brackets and a mode bar | Yes, modes "Speisekarte" / "Teller" | Barcode and food-label modes (no backend) |
| Analysing state as a card with progress | Yes, followed by DishFit's existing particle reveal on iOS (PR #59, `DustEffect.swift`); the web app has no reveal yet and gets a lighter one matched to the iOS timing | |
| Result sheet over the photo with big kcal and macro tiles | Yes, for one dish (plate scan, or a dish opened from a menu scan) | |
| "Fix Results" | Later: maps to editing a dish's ingredients; out of scope unless the backend supports it | |
| Ranked menu list with score rings | Yes, from the menu reading (MenuFit-style cards already exist in DishFit) | |
| Map + restaurant context | DishFit only: a scan can be attached to a restaurant on the map | |
| Trial-explainer paywall with timeline and two plans | Yes, after the free allowance (see the paywall issue) | Long pre-paywall quiz, social-proof screens, rating prompts |
