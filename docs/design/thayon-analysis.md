# Thayon reference audit

Inspected the live landing page in Chrome at 1440 × 900 CSS px and at 390 × 844 mobile CSS px on 21 November 2026.
The public site exposes one same-origin subpage, /privacy-policy.
Thesis, engagements and results are landing-page anchors.
The reference captures are for internal comparison. [Thayon landing](https://thayon.com/) · [Privacy policy](https://thayon.com/privacy-policy)

## Color and surface

| Role | Computed or declared value | Observed use |
| --- | --- | --- |
| Light canvas | `#fcfcfd` | Hero image surround, results canvas, light separators |
| White | `#ffffff` | Light section backing, selected inverted text |
| Soft surface | `#f9f9fb` | Quiet navigation action |
| Light ink | `#1c2024` | Serif headlines, card titles, navigation mark |
| Muted | `#60646c` | Navigation text, supporting copy and light labels |
| Decorative muted | `#8b8d98` | Footer marker and controls |
| Rules | `#d9d9e0` | Light vertical rails, dividers and outlined actions |
| Soft rule | `#e8e8ec` | Subtle light boundaries |
| Strong surface | `#111113` | Thesis, founder and footer canvas, primary action |
| Dark rules | `#363a3f` | Inverted rails and etched lines |
| Dark type | `#edeef0` / `#afb3ba` | Inverted primary / secondary text |
| Badge inset | `inset 0 4px 4px #f0f0f3` | Small icon square inside a results card |

Cobalt, periwinkle, violet and pearlescent white live mainly inside the photographs and video.
The three artwork colors in [tokens.json](tokens.json) are Plus One art direction, not sampled site UI tokens.

## Typography

Values below are CSS pixels unless expressed as an em ratio.
The fonts loaded from Google Fonts WOFF2 resources.
All three are open-source OFL families, so the brand can use the measured faces directly. [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4) · [Geist](https://fonts.google.com/specimen/Geist) · [Geist Mono](https://fonts.google.com/specimen/Geist+Mono)

- Source Serif 4 v14. [Observed WOFF2](https://fonts.gstatic.com/s/sourceserif4/v14/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kDXr4.woff2)
- Geist v5. [Observed WOFF2](https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2)
- Geist Mono v6. [Observed WOFF2](https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmg.woff2)

| Level | Family and weight | 1440 size / leading / tracking | 390 size / leading / tracking |
| --- | --- | --- | --- |
| Hero | Source Serif 4 400 | 56 / 61.6 / −2.24 | 26 / 28.6 / −1.04 |
| Section heading | Source Serif 4 400 | 48 / 52.8 / −1.92 | 24 / 26.4 / −0.96 |
| Editorial subhead | Source Serif 4 500 | 40 / 52 / −1.60 | 20 / 26 / −0.80 |
| Results title | Geist 500 | 40 / 44 / −1.60 | 29 / 31.9 / −1.16 |
| Results metric | Geist 500 | 40 / 60 / −0.80 | Results metrics tucked into the card |
| Card heading | Geist 500 | 20 / 30 / −0.40 | 18 / 27 / −0.36 |
| Hero supporting line | Geist 400 | 18 / 27 / −0.36 | 14 / 21 / −0.56 |
| Body | Geist 400 | 16 / 24 / −0.64 | 14 / 21 / −0.56 |
| Desktop nav | Geist 400 | 14 / 21 / −0.28 | Collapsed menu |
| Metadata | Geist Mono 500 | 12 / 18 / −0.48 | 12 / 18 / −0.48 |
| Action | Geist Mono 500 | 12.8 / 15.36 / −0.128 | 12.8 / 15.36 / −0.128 |

## Grid and composition

- Outer rails sit 16 px from desktop edges and 8 px from mobile edges, with 1 px rules.
- The header is about 68 px tall on desktop and 56 px on mobile; it floats above the hero without shifting the top of the section.
- Hero text starts at y=160 / 120, centered in a max-width 800 px frame.
- The hero copy and action have separate 24 / 12 px and 48 / 24 px gaps. The art starts 40 px below the action.
- The featured desktop art frame is 1408 × 1061 px; the mobile frame is 374 × 440 px. Both have square upper edges and 16 px bottom corners.
- Desktop content sections use 80 px inner padding and an even split on the dark thesis band. Desktop light feature cards use a 768 px group with 24 px gaps. Mobile sections use 40 px vertical / 16 px horizontal padding and stack into a single column.
- Observed spacing steps are 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 120 and 160 px.
- Buttons use 4 px corners and about 36 px height at desktop / 32 px in the mobile header. Small cards and inset media are 8 px, large results surfaces and exterior media are 16 px. Nav link hit areas use a 48 px pill radius. Most surfaces have 1 px borders and no shadow.

## Imagery and mark

The hero uses an iridescent, deliberately defocused portrait against a cobalt-to-violet field.
A pale fade connects image and canvas, while low-opacity white registration lines float over the image.
Results images echo the same glassy optical treatment, and the end section uses looping refractive footage.
The founder portrait is a single small documentary accent.
Use original soft-focus city or human imagery for Plus One.

The live logo has two independent SVG components.
The approximately 27 × 26 px symbol has four heavy, pill-like tapered forms offset around an empty center with a slight rotation.
The wordmark has a 67 × 26 px SVG box, tight mixed-case neo-grotesk shapes, a quiet medium weight and a gap of roughly 4–8 px from the symbol.
For Plus One, keep a compact single-ink lockup with similar optical density and tight word spacing.
Use an original asymmetric three-seat form with a smaller arriving fourth element.

## Motion

- Live scroll sampling triggered line and character reveals with a 500 ms duration and successive 25 ms offsets. Chrome exposed a sampled spring-like `linear()` curve that reached about 94% at half the duration. The token cubic-bezier is an approximation.
- The hero uses layered transforms, including pointer-responsive registration details on desktop. The motif is static under touch.
- Desktop results use a sticky stage and horizontal progress tied to document scroll. Mobile results stack, with tap-sized closed cards. The long middle area in the full desktop capture comes from the sticky travel.
- Action labels have clipped rolling characters on hover. The primary action in the prototype uses a 180 ms state transition for a simpler functional equivalent.
- The final call-to-action layers looping video and a framed foreground, with section and separator reveals as they enter view.
- Keep text and controls visible with reduced motion. Treat art motion and the logo film as optional presentation.
- The measured values, tokens and drop-in web and SwiftUI implementations live in [motion/motion-spec.md](motion/motion-spec.md), which supersedes the approximate `motion` block in [tokens.json](tokens.json).

## Captures

- [Landing at 1440](ref/thayon-landing-1440.webp)
- [Landing at 390](ref/thayon-landing-390.webp)
- [Privacy at 1440](ref/thayon-privacy-1440.webp)
- [Privacy at 390](ref/thayon-privacy-390.webp)
