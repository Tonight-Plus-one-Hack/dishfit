# Plus One submission kit

Drafts for the Layla x Expedia 5K Build & Launch submission (Sunday 22 Nov 2026, 15:30: live link, 3 slides, real user numbers).

| File | What it is |
| --- | --- |
| `slides.html` | Self-contained 16:9 deck, exactly 3 slides, in the Plus One brand look. Generated, do not edit by hand. |
| `slides.src.html` | Source of the deck; edit this one. |
| `build-slides.py` | Builds `slides.html` from the source and inlines the brand fonts, logo and artwork from `brand/`. |
| `numbers.json` | The numbers on slide 2. Every value starts as `null` and shows as "pending". |
| `pitch.md` | 2-minute and 4-minute pitch scripts with number placeholders. |
| `qa.md` | Honest jury Q&A: safety, legal, cold start, product, build. |
| `backup-demo.md` | Shot list for a 90-second backup video. |

## Before the pitch

1. Fill `numbers.json` from the live `/numbers` page (our own events table, team and test devices excluded) and the ad dashboard; set `updated_at` and `launch_window` as ISO times (for example `2026-11-22T13:30:00Z`), and `live_url`.
   Leave anything you cannot verify as `null`; never type an estimate.
2. Optional: put `screenshot.png` (a portrait phone screenshot of the Berlin city page) and `qr.png` (QR code for `live_url`) next to `slides.html`; the deck picks them up automatically and shows placeholders otherwise.
3. Open the deck over http so it can read `numbers.json`, for example `python3 -m http.server 8000` inside this folder, then open `http://localhost:8000/slides.html`.
   Opened as a plain file, the browser blocks reading `numbers.json`; drag the file onto the page instead.
   `slides.html?numbers=<url>` reads the numbers from another URL on the same origin.

## Changing the deck

Edit `slides.src.html`, then run `python3 submission/build-slides.py` (Python 3, standard library only).
Run it again whenever the brand kit in `brand/` changes, so the inlined fonts, logo and hero artwork stay in sync.
Colors, type and radii follow `docs/design/tokens.json` and `brand/theme.css`.

## Presenting

- Right arrow, Space, Enter or a click on the right two thirds: next slide.
- Left arrow, Backspace or a click on the left third: previous slide.
- 1, 2, 3 jump to a slide; F toggles fullscreen; `#2` in the URL opens slide 2.
- Print to PDF gives one slide per page as a fallback copy.

## Derived numbers on slide 2

- Hangouts with 3+ people = `hangouts_reached_3 / hangouts_started`; the note adds `hangouts_filled` (every seat taken) when present.
- Shares per joined user = `shares / people_joined`.
- Layla / Expedia clicks = sum of `brand_clicks`.
- Cost per join = `ads.spent_eur / ads.people_joined_from_ads`.
