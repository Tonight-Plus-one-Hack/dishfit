# Reference clip analysis

Source: https://www.inspora.design/posts/1-15 ("New Calendly logo", a logo study by Mike Smith, original post linked from the Inspora page).
Analyzed live in a browser on 2026-11-21, then frame by frame from the clip the page serves.
Nothing from the clip (frames, logo, photos, copy) is used in this project; only its grammar is.

## Technical facts (measured)

| Property | Value |
| --- | --- |
| Duration | 2.98 s, plays as a seamless loop |
| Canvas | 960 × 1280 (3:4 portrait) |
| Frame rate | Variable: 43 unique frames, encoded at ~25 fps with repeated frames dropped |
| Audio | None (single video stream, autoplays muted) |
| Shots | 11 |
| Shot length | 0.26 to 0.29 s each, effectively one constant cadence of ~0.27 s (≈ 8 frames at 30 fps) |
| Transitions | Hard cuts only: no fades, wipes, blur or motion between shots |
| Logo position | Dead center (480, 640) in every shot |
| Logo size | 351 × 351 px, 36.6 % of the frame width, identical in every shot |

## The idea

The clip is a flip-book of brand applications.
The mark never moves: it stays locked at the same position and size while the world around it is swapped every quarter second.
Because the mark is the only constant, the eye fixes on it and reads every cut as "the same logo, everywhere".
The mark itself is never animated in, drawn on or revealed with motion; its construction is told by the montage (a pencil sketch, a blueprint, a construction grid) instead of by a single draw-on animation.
The loop is seamless because the last shot cuts straight back to the first and the mark does not jump.

## Shot by shot (measured)

| # | Time (s) | Ground | Mark treatment | Motion inside the shot |
| --- | --- | --- | --- | --- |
| 1 | 0.00 to 0.27 | Soft blurred pastel sky (blue, peach, yellow) | Solid deep navy | Hold |
| 2 | 0.27 to 0.54 | Split photo: desk setup and flower field | White, with a faint gradient inside the counters | Hold |
| 3 | 0.54 to 0.81 | Editorial brand poster: portrait, huge cropped wordmark, icon set, colour swatches, small rails of copy | Glossy 3D app-icon version, light blue | Slow push-in of the poster, about 5 % scale over the shot, mark stays fixed |
| 4 | 0.81 to 1.08 | Light grey paper | Pencil sketch, hatched strokes | Hold |
| 5 | 1.08 to 1.35 | Off-white paper texture with one thin horizontal rail of tiny labels and icons | Frosted translucent glass, pale blue | Hold |
| 6 | 1.35 to 1.62 | Heavily blurred photo (sky, peach, sea) | White outline with the ground showing through, soft gradient | Slight drift of the blur |
| 7 | 1.62 to 1.88 | Saturated blue gradient with light streaks | Translucent mark with blueprint construction: concentric circles, a bounding square, small coordinate labels, the wordmark tiny in the corner | Hold |
| 8 | 1.88 to 2.15 | Colour-block checkerboard: lime cream, lavender, sky gradient tiles, one dark gradient tile | Solid mid blue | The gradient tiles slide a little |
| 9 | 2.15 to 2.42 | Light brand poster: sky photo tile, icon row, small serif headline, wordmark bottom left | Solid deep navy | Hold |
| 10 | 2.42 to 2.69 | Light grey construction grid of thin rules aligned to the mark | Translucent pale blue with a fine outline | Hold |
| 11 | 2.69 to 2.98 | Crumpled paper | Physical enamel pin: raised metal edge, glossy blue fill, contact shadow | Hold, then cut back to shot 1 |

## Grammar to reuse

- One constant: the mark, fixed at the exact center and ~37 % of the short side, never animated.
- A relentless, even cadence: about 8 frames per shot at 30 fps, every shot the same length.
- Hard cuts only, no easing between shots; the energy comes from the cut rhythm, not from motion.
- Inside a shot, motion is almost absent; at most a slow push (≈ 5 % scale per shot, linear-ish) or a small slide of a background tile.
- Each shot shows the mark in a new material or context: flat colour, photo, poster, sketch, glass, outline, blueprint, colour blocks, grid, physical object.
- The construction story (sketch, blueprint, grid) is spread through the loop, not grouped.
- Alternate light and saturated grounds so neighbouring cuts always change value, which keeps every cut legible.
- The wordmark appears only inside a few shots as part of the layout, never as a separate reveal.
- Silent; built to loop in a feed.

## Our adaptation (Plus One)

- Same cadence and structure: 12 shots of 8 frames at 30 fps (3.2 s), hard cuts, the symbol locked in place at 405 px (37.5 % of the 1080 px short side).
- Two outputs from one source: 1080 × 1080 with the symbol dead centre, and 1080 × 1920 with the symbol at the centre of the social safe band (y 768 px) so no platform UI covers it or the copy.
- Every shot is code-drawn in the Plus One tokens (Thayon-derived): canvas #FCFCFD, ink #1C2024 and #111113, rules #D9D9E0, artwork-only blue-violet #355EDA, #8391F7, #9C90FE, Source Serif 4 and Geist Mono.
- No photos, no third-party imagery; the reference's photo shots become optical blur fields and a night street map drawn in CSS and SVG.
- The reference's shot list maps onto ours almost one to one: flat mark on a soft field, mark on a city image, editorial poster with a push-in, pencil sketch, frosted glass, blueprint construction, colour blocks with sliding gradient tiles, brand poster with the logo in the corner, construction grid, enamel pin on crumpled paper; we add a closing stacked lockup.
- The logo is the brand kit's: `brand/assets/symbol.svg` in every shot and `brand/assets/logo-primary.svg` for the lockup and wordmark, synced in by `scripts/sync-brand.mjs`.
- Silent, like the reference.
