# Submission deck

Three slides plus an appendix for the Layla / Expedia Group "5K Build & Launch" submission (Sunday 22 Nov 2026, 15:30), in English with German speaker notes under each slide (screen only, not in the PDF).

| File | What |
| --- | --- |
| `slides.src.html` | Source: edit this one |
| `slides.html` | Built, self-contained deck (fonts, images and numbers inlined), 1280 x 720 per slide |
| `slides.pdf` | Headless Chrome print of `slides.html`, one slide per page |
| `numbers.json` | The live traction numbers the deck shows (`null` renders as "live at submission") and `history`, one point per export |
| `assets/` | Clay icons and live captures: [desktop map, 1440 × 900](assets/screen-desktop.webp) · [mobile dish](assets/screen-mobile-dish.webp) · [mobile restaurant photos](assets/screen-mobile-photos.webp) · [mobile scan](assets/screen-mobile-scan.webp), each 390 × 844 |
| `scripts/` | `build.mjs` (render and print) and `export-numbers.mjs` (pull live numbers) |

## Commands

```sh
npm run slides:build                                   # re-render slides.html and slides.pdf
npm run numbers:export -- https://<deployed-app>       # pull GET /api/numbers, fill numbers.json, re-render
NUMBERS_URL=https://<deployed-app> npm run numbers:export
```

`numbers:export` expects the `NumbersResponse` from `GET /api/numbers` as specified in `docs/team-prompts/vinaynaik432-debug.md` (Task D) and uses `engaged`, `decided` and `shared` on slide 3, plus `visitors`, `since` and `generatedAt` in the footnote.
Each export also appends a point to `history`, and slide 3 draws the numbers-over-time chart once there are two points (the slot shows a placeholder before that); a different base URL starts a fresh history.
If the request fails or a count is missing, `numbers.json` keeps its last successful snapshot. Metrics with a `null` value render as “live at submission”.
Run the export after team devices are excluded and the live endpoint is available.

The build needs Google Chrome; set `CHROME_PATH` if it is not in the default macOS or Linux location.

## Sources

- **Live catalog, 22 Nov 2026.** 309 restaurant records and 4,823 published dishes, calculated by summing their `dishCount` fields. The 15 Kieze with restaurants are the entries with a positive `restaurantCount`. The Kiez totals sum to 309 and agree with the restaurant records. [Live restaurants](https://dishfit.caniberk.dev/api/restaurants) · [Live Kieze](https://dishfit.caniberk.dev/api/kieze)
- **Versioned catalog.** The published seed figures are 384 publishable restaurants, 5,944 healthy dishes and 27 Kieze, as reported in the catalog audit and checked against the seed builder output. [Catalog audit](../docs/data/photo-coverage.md#before-and-after) · [Per-Kiez catalog](../apps/web/src/data/seed/pipeline/kiez/) · [Seed builder](../worker/scripts/build-seed.ts)
- **Wave 1 costs.** The ledger records $67.55 across 118 restaurants and 3,774 processed dishes in five Kieze, including Places at list price. Dividing the total by the respective counts gives $0.57 per restaurant and $0.02 per dish, rounded to cents. [Pipeline costs](../pipeline/README.md#costs)
- **Nutrition benchmarks.** The ingredient-based estimates had 15% mean absolute kcal error against 16 official dean&david values, with 10 of 16 values in the estimated range and protein about 8 g high. Confidence-based ranges are ±15%, ±25% or ±35%. The blind estimate result was 18.9% mean absolute kcal error across 10 dishes in the 21 Nov menu spike, rounded to 19% on slide 2. [Pipeline nutrition method](../pipeline/README.md#nutrition-method) · [Spike estimates and official values](../apps/web/src/data/seed/spike-restaurants.ts)
- **Traction.** The live export returned HTTP 404 on 22 Nov 2026, so `visitors`, `engaged`, `decided` and `shared` are `null` in this snapshot. [Live traction endpoint](https://dishfit.caniberk.dev/api/numbers) · [Metric definitions](../docs/team-prompts/vinaynaik432-debug.md)
- **Screenshots, 22 Nov 2026.** The desktop map shows Mitte's category pins and ranked dishes. The mobile dish shows Bu Kon's Phở Gà, and the restaurant capture shows its attributed Google Places photos. The scan capture shows the community menu camera entry screen. [Desktop map](https://dishfit.caniberk.dev/map?kiez=Mitte) · [Dish](https://dishfit.caniberk.dev/d/d_d90ad7bf00ae3d98) · [Restaurant](https://dishfit.caniberk.dev/r/osm-node-7275039878) · [Menu scan](https://dishfit.caniberk.dev/scan)
