# Cal AI reference screens: sources

These images are design references for the team only.
They are third-party screenshots of Cal AI (Viral Development LLC) and must never ship in the app, the landing page, store listings, decks or social posts.
Every file was downscaled to at most 600 px wide (1100 px for the website composite), re-encoded as JPEG and stripped of metadata.
Captured on 2026-11-22.

| File | What it shows | Source |
| --- | --- | --- |
| `01-splash.jpg` | Launch screen | Frame at 00:01 of the public app walkthrough on [screensdesign.com/apps/cal-ai-calorie-tracker](https://screensdesign.com/apps/cal-ai-calorie-tracker/) (chapter "Welcome & Feature Carousel") |
| `02-welcome.jpg` | Welcome carousel, slide with device mockup | Same walkthrough, 00:04 |
| `03-welcome-result-slide.jpg` | Welcome carousel slide showing the real scan result screen | Same walkthrough, 00:11.5 |
| `04-quiz-gender.jpg` | Onboarding quiz, single-line options, Continue disabled | Same walkthrough, 00:17 (chapter "Personalization Quiz Part 1") |
| `05-quiz-selected.jpg` | Onboarding quiz, option with icon and subtitle selected, Continue enabled | Same walkthrough, 00:22 |
| `06-quiz-source-stagger.jpg` | Next quiz screen mid-transition: options fading in one after another | Same walkthrough, 00:23 |
| `07-home-en.jpg` | Home / daily overview (marketing frame) | App Store US screenshot 1, [apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616), URL via `itunes.apple.com/lookup?id=6480417616&country=us` |
| `08-home-de.jpg` | Home / daily overview, German | App Store DE screenshot 1, [apps.apple.com/de/app/cal-ai-calorie-tracker/id6480417616](https://apps.apple.com/de/app/cal-ai-calorie-tracker/id6480417616), URL via `itunes.apple.com/lookup?id=6480417616&country=de` |
| `09-scan-camera-en.jpg` | Scan camera ("Scanner") | App Store US screenshot 2 |
| `10-scan-camera-de.jpg` | Scan camera with mode bar (Scannen / Strichcode / Etikett) | App Store DE screenshot 2 |
| `11-scan-result-en.jpg` | Scan result ("Nutrition") with 2 × 2 tiles, health score, Fix Results / Done | App Store US screenshot 3 |
| `12-scan-result-de.jpg` | Scan result ("Nährwerte"), calories tile, three macro tiles, ingredients | App Store DE screenshot 3 |
| `13-paywall-1-try-free.jpg` | Paywall step 1: "try for free" with app preview | [Adapty Paywall Newsletter #22](https://adapty.io/blog/paywall-newsletter-22/) (capture by ScreensDesign), image `adapty.io/uploads/2025/08/calai_1.webp` |
| `14-paywall-2-reminder.jpg` | Paywall step 2: reminder promise with bell | Same article, `calai_2.webp` |
| `15-paywall-3-trial-plans.jpg` | Paywall step 3: trial timeline, monthly / yearly plan cards, CTA | Same article, `calai_3.webp` |
| `16-site-flow.jpg` | Camera to result flow composite and dark home | Official website [calai.app](https://www.calai.app/), `/hero-image.webp` |

## Not captured

The "analysing" state (the scanned photo shown as a card on Home with a progress percentage while the model reads it) appears in the walkthrough chapter "Logging Food" (03:42 - 04:57), but that part of the public preview is blurred.
The same applies to every paywall frame in the walkthrough, which is why the paywall comes from the Adapty article.
Mobbin needs an account and was not used.

## Measurement basis

All values in [spec.md](spec.md) are in iOS points for a 393 pt wide phone (iPhone 15/16/17).
Scale factors used: walkthrough frames 592 px wide = 1.506 px/pt; Adapty paywall captures 1080 px wide = 2.748 px/pt; App Store screenshots measured inside the device frame (DE home: 739 px screen width = 1.88 px/pt).
Paywall plan-card arithmetic (16 + 168 + 24 + 168 + 16 = 392 pt) confirms the 393 pt basis.
Colours are eyedropper samples from the source pixels (JPEG/WebP compression shifts them by a few units).
