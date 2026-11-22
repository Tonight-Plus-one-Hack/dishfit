# Plus One logo loop

A 3.2 s silent logo loop in the grammar of the reference clip analyzed in [REFERENCE.md](REFERENCE.md).
The symbol stays locked in place while the world around it cuts every 8 frames: twelve shots, hard cuts, 30 fps, built to loop in a feed.
Everything is code-drawn with HyperFrames (HTML, CSS, SVG filters, GSAP) in the Plus One tokens; there are no photos or third-party assets.

| Output | Size |
| --- | --- |
| [out/plus-one-logo-1080x1080.mp4](out/plus-one-logo-1080x1080.mp4) | 1080 × 1080, H.264, 30 fps, 96 frames |
| [out/plus-one-logo-1080x1920.mp4](out/plus-one-logo-1080x1920.mp4) | 1080 × 1920, H.264, 30 fps, 96 frames |

## The logo comes from the brand kit

`brand/assets` and `brand/fonts` stay the single source of truth.
HyperFrames serves only files inside this folder, so `scripts/sync-brand.mjs` copies what the film needs into `assets/`:

| Film file | From | Used for |
| --- | --- | --- |
| `assets/logo.svg` | `brand/assets/symbol.svg` | The symbol in every shot, as an alpha mask (fills, glass, hatching, outlines and the enamel pin all derive from it) |
| `assets/lockup.svg` | `brand/assets/logo-primary.svg` | The official horizontal lockup on the brand poster (shot 9) |
| `assets/wordmark.svg` | Wordmark outlines extracted from `logo-primary.svg` | The stacked close (shot 12) |
| `assets/fonts/*` | `brand/fonts` | Source Serif 4 and Geist Mono, with their OFL texts |

`npm run render` syncs first, and `npm run check` fails if a copy has drifted from the brand kit.
After a logo change in the brand kit, run `npm run render` and commit the refreshed copies with the new MP4s.

## Shots

| # | File | Ground | Symbol |
| --- | --- | --- | --- |
| 1 | `s01-optical.html` | Canvas fading into a blue-violet optical field, crosshairs | Solid #111113 |
| 2 | `s02-city.html` | The city at night as a street map with a river | Light gradient |
| 3 | `s03-poster.html` | Editorial poster, Source Serif "Tonight", rails, swatches; pushes in 5 % | Glossy blue-violet icon |
| 4 | `s04-field.html` | Saturated #355EDA field that drifts | White |
| 5 | `s05-sketch.html` | Paper grain, guides, construction circle | Hatched pencil sketch |
| 6 | `s06-glass.html` | Dark canvas with blue and violet light | Frosted glass |
| 7 | `s07-blueprint.html` | Blueprint blue, construction circles and measurements | Translucent with white outline |
| 8 | `s08-blocks.html` | Colour blocks, the gradient tiles slide inside their cells | #355EDA |
| 9 | `s09-brand.html` | Brand poster: cities, serif line, official lockup | Ink |
| 10 | `s10-grid.html` | Dark 45 px construction grid with key lines | Translucent periwinkle with violet outline |
| 11 | `s11-pin.html` | Crumpled paper | Enamel pin with metal rim |
| 12 | `s12-lockup.html` | Canvas | Symbol over the wordmark |

Each shot is 8 frames (0.267 s).
Hosts in `index.html` start 4 ms before their cut frame, so every cut lands exactly on frame 8k.

## Formats

`index.html` is the 1080 × 1080 source and the one Studio previews.
Every shot positions itself from `--mark-cy` and the `--safe-*` insets, which `index.html` sets per canvas:

- 1080 × 1080: the symbol sits dead centre at 405 × 405 px (37.5 % of the short side), like the reference.
- 1080 × 1920: the symbol sits at y 768 px, the centre of the band TikTok, Reels and Shorts all leave clear (y 288 to 1248, x 120 to 888), and every word stays inside that band.

The 1080 × 1920 cut is not a second source: `scripts/render.mjs` copies the project to a temporary folder, rewrites the canvas size of the root, the scene hosts and the scene roots, and renders it.

## Commands

Run from this folder; Node 22+ and FFmpeg are needed.

```bash
npm run check                                   # brand drift, lint, runtime, layout, contrast, craft
npm run dev                                     # Studio preview of the square cut
npm run render                                  # sync, then both MP4s into out/ (delivery quality)
npm run render:square                           # only 1080x1080
npm run render:vertical                         # only 1080x1920
node scripts/render.mjs --workers 2             # gentler on a shared machine
node scripts/render.mjs --prepare-vertical /tmp/plus-one-vertical   # vertical project copy for check, snapshot or preview
```

## Known check warnings

`npm run check` passes on both cuts with no lint, layout, motion or contrast findings.
Its craft pass warns that the small text in shots 3, 5, 6, 7, 9 and 10 is on screen for 0.27 s, under a reading floor; that is the reference's grammar (text is texture in a flip-book, the symbol is the message), so it stays.
It also warns that frame 0 shows only background, because it does not count a CSS-masked symbol as content; frame 0 does show the symbol.
