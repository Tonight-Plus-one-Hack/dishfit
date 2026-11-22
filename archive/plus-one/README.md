# Plus One archive

Plus One ("Tonight, not alone": small groups meeting at a bar tonight) was this repo's first hackathon product.
The team moved to a restaurant nutrition app (see the [root README](../../README.md)), so everything Plus One specific lives here.
Nothing was deleted: files from `main` were moved with `git mv` (history follows with `git log --follow`), and the unmerged branches below were copied in where noted.

The brand kit in [`brand/`](../../brand/) and the design references in [`docs/design/`](../../docs/design/) stay at the top level because the new product keeps using them.

## What is here

| Path | What | From |
|---|---|---|
| [`PLAN.md`](PLAN.md) | "Find my group" agent proposal | `main` |
| [`TASKS.md`](TASKS.md) | lane and owner table | `main` |
| [`STEM.md`](STEM.md) | how to connect Claude Code sessions with stem (the invites in it expired after 24 hours) | `main` |
| [`docs/plan.md`](docs/plan.md) | the Plus One build plan: product, stack, lanes, safety rules | `main` |
| [`docs/team-prompts/`](docs/team-prompts/) | one brief per teammate for lanes 1 to 3 | `main` |
| [`launch/`](launch/) | launch and growth drafts: ads, outreach, QR poster, WhatsApp copy | `main` (PR [#1](https://github.com/Tonight-Plus-one-Hack/wohin/pull/1)) |
| [`submission/`](submission/) | submission deck, pitch, Q&A, backup demo | `main` (PR [#2](https://github.com/Tonight-Plus-one-Hack/wohin/pull/2)) |
| [`web-prototype/`](web-prototype/) | full React + Vite web prototype (landing, cities, hangouts, join flow, spots, no backend), with its screenshots in `web-prototype/screenshots/` | branch `fm/proto-web` at `c8a11c5` |
| [`ios/`](ios/) | paused native SwiftUI app (onboarding, tonight, hangouts, join, spots, profile, mock API, tests) | branch `fm/ios-app` at `6645bbe` |
| [`data/spots/`](data/spots/), [`scripts/spots/`](scripts/spots/) | curated bars, pubs and beer gardens for eight cities from OpenStreetMap, with the export scripts | branch `fm/t1-spots` at `67c4b83` |

The old top-level README was two lines: "wohin - Wohin? group trip decider (Layla 5K hackathon)".

### OpenStreetMap data

[`data/spots/`](data/spots/) is © OpenStreetMap contributors under the ODbL.
Keep [`data/spots/ATTRIBUTION.md`](data/spots/ATTRIBUTION.md) with the data wherever it is used or copied.

### Running the archived web prototype

```sh
cd archive/plus-one/web-prototype
npm install
npm run dev
```

It is self-contained (own `package.json` and lockfile) and not part of the root workspace, checks or tests.

## Reused in the new product

| Piece | Now at |
|---|---|
| Motion system measured from the reference site (spec, tokens, web module, SwiftUI `Motion.swift`) | [`docs/design/motion/`](../../docs/design/motion/), from branch `fm/thayon-motion` (PR [#13](https://github.com/Tonight-Plus-one-Hack/wohin/pull/13)) |
| Hashed-IP rate limiting, word filter, admin token check, AI usage cost logging | [`worker/src/lib/`](../../worker/src/lib/), ported product-neutral from branch `fm/lane2-chat-safety` (PR [#14](https://github.com/Tonight-Plus-one-Hack/wohin/pull/14)) |
| Design primitives of the web prototype: tokens, font wiring, one-question-per-screen onboarding, share sheet, MapLibre map | `apps/web` (built on its own branch); sources in [`web-prototype/src/styles/`](web-prototype/src/styles/), [`web-prototype/src/components/`](web-prototype/src/components/) and [`web-prototype/src/lib/share.ts`](web-prototype/src/lib/share.ts) |
| SwiftUI pieces for a later native app: onboarding flow and design system | [`ios/PlusOne/Features/Onboarding/`](ios/PlusOne/Features/Onboarding/), [`ios/PlusOne/DesignSystem/`](ios/PlusOne/DesignSystem/) (`Motion.swift`, `Theme.swift`, `Components.swift`) |

## Unmerged branches and pull requests

None of these were merged.
The branches stay on the remote; the table says what was copied here.

| PR | Branch | What | Archived here |
|---|---|---|---|
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/11 | `fm/proto-web` | web prototype: landing, cities, hangouts, join flow, spots | full copy in [`web-prototype/`](web-prototype/) |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/15 | `fm/ios-app` | paused native iOS app (draft) | full copy in [`ios/`](ios/) |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/14 | `fm/lane2-chat-safety` | lane 2 chat and safety on Workers, D1 and Durable Objects (draft) | generic security building blocks only, in `worker/src/lib/` |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/3 | `fm/t1-spots` | curated meetup spots for eight cities | full copy in [`data/spots/`](data/spots/) and [`scripts/spots/`](scripts/spots/) |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/13 | `fm/thayon-motion` | motion system measured from the reference site | full copy in `docs/design/motion/` |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/12 | `be/l3-catalog-share-numbers` | lane 3: catalog, spots seed, share links, hand-offs, events, `/api/numbers` (draft) | not copied |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/4 | `fm/t0-foundation` | old foundation: Next.js, Supabase schema and RLS, API contract | not copied (superseded stack) |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/6 | `fm/t3-chat-safety` | T3 chat and safety on the old stack (draft hand-off) | not copied (ported into lane 2) |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/7 | `fm/t2-hangouts` | T2 cities and hangouts on the old stack (draft hand-off) | not copied |
| https://github.com/Tonight-Plus-one-Hack/wohin/pull/8 | `fm/t4-share-numbers` | T4 sharing, partner hand-offs, launch numbers on the old stack (draft hand-off) | not copied |

Branch `be/l1-skeleton` (lane 1 backend skeleton: Worker, D1 core schema, shared contract) never got a pull request and is also not copied.
