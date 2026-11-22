# Plus One motion, web

Two drop-in implementations of the [motion spec](../motion-spec.md) and a demo page that runs either one.
Both read every value from [motion.json](../motion.json).

## Run the demo

```sh
npm install
npm run dev
```

- framer-motion variant: http://localhost:5178/
- GSAP variant: http://localhost:5178/?variant=gsap

The demo uses the brand kit fonts and artwork from `brand/` through the `@brand` alias in `vite.config.ts`.

## Drop it into an app

Copy `src/motion/` and `../motion.json`, and keep the relative import in `src/motion/tokens.ts` pointing at the JSON.

framer-motion (needs `framer-motion` 11 and `lenis`):

```tsx
import { CharReveal, Reveal, RollButton, useSmoothScroll } from "./motion/framer";

useSmoothScroll();
<CharReveal as="h1" trigger="mount" text="Alone tonight?" />
<Reveal trigger="mount" delay={1500}>…</Reveal>
<RollButton label="Find my group" href="/join" />
```

GSAP (needs `gsap` 3.12 and `lenis`), either per element or by data attributes:

```ts
import { initMotion, charReveal, reveal } from "./motion/gsap";

const cleanup = initMotion(document); // wires every [data-motion] element and starts Lenis
charReveal(heading, { trigger: "mount" });
reveal(card, { y: 30, delay: 200 });
```

Give `html` a non-static position (the demo uses `position: relative`), because framer-motion's `useScroll` measures `<StickyTrack>` against the root.
The GSAP character split mutates the DOM once, so do not run `initMotion` twice on the same nodes (for example under React StrictMode).

## Scripts

- `npm run typecheck` checks both variants and the demo.
- `npm run build` builds the demo into `dist/`.
