# Plus One brand kit

Open [index.html](index.html) for the landing and kit, or [prototype.html](prototype.html) for the city picker, mood filters, hangout details and join flow.
Both run locally with their relative assets and bundled fonts.
The prototype uses sample data, and the join state lives in browser memory for the current page session.

## Identity

The symbol is a group of three with a fourth seat arriving.
Its exact vector geometry is in [source/mark.svg](source/mark.svg).
The wordmark ships as outlines for cross-platform use.
Use the primary lockup on the off-white canvas, the dark version on white, and the light version on a dark background.
Allow half a symbol-width around each lockup.
Use the symbol alone below a 20 px lockup height.

Plus One remains the working name.
There are several social-discovery apps with close names. [Plus 1](https://joinplus1.com/) · [PlusOne](https://www.plusone.today/) · [Plus One on the App Store](https://apps.apple.com/no/app/plus-one-social-experiences/id6760841160)
Tonight Plus One makes the occasion explicit and shares the same core name.
One More Tonight makes the extra seat the promise.
The initial search surfaced a music release with this name. [One More Tonight](https://www.qobuz.com/us-en/album/one-more-tonight-jasmin/znuzdhxpbe4tt)

## Assets

| File | Use |
| --- | --- |
| `logo-primary`, `logo-dark`, `logo-light` | Transparent SVG and 960 px wide PNG lockups |
| `symbol` | SVG and 512 px transparent PNG |
| `app-icon` | Square SVG and 1024 × 1024 PNG for platform masking |
| `social-avatar` | Square SVG and 512 × 512 PNG with safe padding for circular crops |
| `story-template` | Editable SVG and 1080 × 1920 PNG. Update the city, timing and invite text, then add the live invite link sticker in Instagram |
| `logo-reveal.mp4` | Silent H.264 film, 1080 × 1440, 30 fps, 4.2 seconds |
| `icons.svg` | City, time, group and place examples for a 24 px grid and 1.5 px stroke |
| `hero.webp`, `city-*.webp` | Original ImageGen artwork. The city illustrations are atmospheric depictions of the cities |

The logo film uses moving color panels and nested outlines, then assembles the four pieces over original artwork and lands on the static lockup. [Motion reference on Inspora](https://www.inspora.design/posts/1-15)
The kit offers manual playback and a still poster.

## Re-export

The Python sources use CairoSVG, FontTools with WOFF support, and Pillow.
The film source also uses FFmpeg.
To change the working label, run `python brand/source/export_assets.py --name "New Name"` and `python brand/source/render-film.py`, then update the display copy in the two HTML files.
The city and story artwork can be reused independently of the wordmark.

[Design tokens](../docs/design/tokens.json) · [Reference audit](../docs/design/thayon-analysis.md)
