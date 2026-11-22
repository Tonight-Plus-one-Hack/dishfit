# Agent prompt: paywall in the Cal AI style (web + iOS, test mode only)

Paste everything below the line into your coding agent.
It is self-contained; the agent reads the repo files it names.

---

You are the coding agent for GitHub user `vinaynaik432-debug` on the DishFit team (repo `Tonight-Plus-one-Hack/wohin`).
Work autonomously.
Your job: build DishFit's premium paywall on the web app (`apps/web`, 390 to 1440 px) and the iOS app (`apps/ios`) by **reverse-engineering Cal AI's three-step trial paywall screen by screen**, wired to **test-mode** payments only: Stripe Checkout in test mode for the web, StoreKit 2 with a local StoreKit configuration for iOS, prepared so RevenueCat can replace the StoreKit layer later.

## 0. Hard rules

1. **No real money, no real products.** Stripe test keys only (`sk_test_…` as a Worker secret, never in git); Stripe test-mode prices you create yourself; iOS uses a local `.storekit` configuration file with placeholder product IDs. No App Store Connect products, no live Stripe keys, no production deploy of billing.
2. **Nothing invented.** No ratings, review quotes, user counts, "x % off" claims or testimonials. Prices, trial length, plan names and the free allowance come from configuration (section 3) and are **pending a product decision**: use clearly marked placeholders in test mode.
3. **No foreign assets.** Never copy Cal AI's illustrations, icons, wording, prices or code. The references live only in `docs/refs/calai/` and are never imported by app code.
4. **Our brand and conventions.** Purple-blue accent and gradient, clay icons, existing components and tokens (root `AGENTS.md`, `docs/refs/calai/spec.md` section 1 mapping). Cal AI's orange timeline accents become DishFit's brand gradient / `--accent`. New tokens are appended at the end of `apps/web/src/styles/tokens.css`. A change to the overall visual language needs Batu's OK first (draft PR with screenshots).
5. **Value first.** The paywall never appears before the first scan result. It appears only (a) when the free allowance is used up, or (b) when the user opens "Premium" themselves. Map, dish catalog, dish detail and "Heute" stay free.
6. **German consumer law.** The final payment step is Stripe's hosted Checkout page (web) or Apple's purchase sheet (iOS); our own CTA must not pretend to be free when it starts a paid subscription after a trial. Show the price per period, the trial end date and that cancellation is possible, and link Impressum and Datenschutz (`apps/web/src/screens/legal`). There are no subscription terms (AGB) yet: leave a clearly marked placeholder link and list it in the PR as an open item. If something here is legally unclear, note it in the PR instead of guessing.
7. German UI copy written fresh for DishFit. Never hardcode the product name (web reads `apps/web/src/lib/brand.ts`).
8. Never start a shell command with `cd`; use absolute paths or `( cd <abs> && … )`.

## 1. Read first

1. `docs/refs/calai/spec.md` section 6 (paywall values) and section 1 (mapping).
2. Images `docs/refs/calai/13-paywall-1-try-free.jpg`, `14-paywall-2-reminder.jpg`, `15-paywall-3-trial-plans.jpg`.
3. Worker: `worker/src/index.ts` (route table and rate-limit wrappers), `worker/src/lib/device.ts` (signed device cookie), `worker/src/routes/scans.ts` (`SCAN_LIMITS`, `overLimit`), `worker/wrangler.jsonc`, `worker/migrations/` (next free number).
4. Web: `apps/web/src/lib/routes.ts`, `apps/web/src/app/` (phone shell and desktop shell), `apps/web/src/data/scans.ts`, `apps/web/src/screens/camera/CameraScreen.tsx`, `apps/web/src/screens/legal/`.
5. iOS: `apps/ios/README.md`, `Fit/FitApp.swift`, `Fit/Worker.swift`, `Fit/ScanView.swift`, `Fit/Design.swift`.

## 2. The three screens (reverse-engineer each)

| Step | Cal AI reference | DishFit version |
| --- | --- | --- |
| 1 | `13`: title "try for free", device mockup playing the scan, check row, big CTA, price footer | Title about trying premium, an in-app preview of DishFit's own scan (a short loop rendered from our UI, not Cal AI footage), check row, CTA, price footer from config |
| 2 | `14`: reminder promise with a bell and a red badge | Same promise only if we really send the reminder (iOS: local notification scheduled before the trial ends, after asking permission; web: email only if we have one, otherwise skip this step on the web) |
| 3 | `15`: three-row timeline (today / reminder / billing day with the real date), two plan cards (monthly / yearly, selected one with badge), check row, CTA, footer | Same structure with DishFit tokens; the dates are computed from the configured trial length; the badge text comes from config; no savings percentage unless computed from the two configured prices |

Top bar on every step: back (steps 2, 3) and "Wiederherstellen" (iOS: `AppStore.sync()` / restore; web: re-check the entitlement) at the right; a close button so the user can always leave without paying.

Method per screen, as in the scan issue: capture the reference and the current DishFit state (web 390 × 844 and 1440 × 900 with Playwright, iOS on the iPhone 17 simulator); measure every element (start from `spec.md`); write the DishFit spec (component, token, copy, data); build web and iOS from the same spec; compare side by side (`magick montage ref.png ours.png -tile 2x -geometry +8+8 compare.png`) until spacing, hierarchy and motion match the quality level; attach the comparisons to the PR.
Desktop (≥ 768 px): the paywall is a centred modal panel (~440 px wide, the desktop shell's panel width) over the dimmed app, not a full-page takeover.

## 3. Configuration (pending decision, placeholders only)

Create one config source per platform, read by the paywall and the Worker:

- Web + Worker: Worker env vars `FREE_SCANS_PER_DAY`, `TRIAL_DAYS`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` (test-mode price IDs), `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (secrets). `GET /api/billing/config` returns the display data (prices as Stripe reports them, trial days, free allowance) so the web never hardcodes prices.
- iOS: `Fit/Billing.storekit` (local StoreKit config) with placeholder products `premium.monthly` and `premium.yearly`, a trial offer of `TRIAL_DAYS`; prices displayed from `Product.displayPrice`, never hardcoded.
- Until Batu decides, the default for `FREE_SCANS_PER_DAY` keeps today's behaviour (no extra limit beyond the existing `SCAN_LIMITS`); a dev/test override lets you demo the paywall (for example `FREE_SCANS_PER_DAY=1` locally).

## 4. Backend interfaces (new, Worker)

DishFit has no accounts; identity is the signed device cookie (`worker/src/lib/device.ts`).
In test mode the entitlement is bound to that device; cross-device restore needs accounts and is a follow-up.

- Migration `00xx_entitlements.sql`: `entitlements (device_id, source 'stripe'|'storekit', product, status, trial_ends_at, current_period_end, external_id, updated_at)`.
- `GET /api/billing/config` (see section 3).
- `GET /api/me/entitlement` → `{ premium: boolean, source, status, trialEndsAt, renewsAt }` for the calling device.
- `POST /api/billing/checkout` `{ plan: 'monthly' | 'yearly' }` → creates a Stripe Checkout Session (mode `subscription`, `subscription_data.trial_period_days = TRIAL_DAYS`, `client_reference_id` = device id, success and cancel URLs back into the app) and returns `{ url }`. Stripe calls are plain `fetch` to the Stripe REST API (no Node SDK in the Worker).
- `POST /api/billing/webhook`: verifies the `Stripe-Signature` header (HMAC-SHA256 with `STRIPE_WEBHOOK_SECRET`, Web Crypto), handles `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`, and upserts `entitlements`. Idempotent on the event id.
- `POST /api/billing/storekit` `{ signedTransaction }` (prepared): stores the StoreKit 2 transaction for the device after verifying the JWS signature chain; if full verification is too large for this task, keep the route behind a dev flag and document what is missing.
- Scan gate in `POST /api/scans`: when the device is not premium and has used `FREE_SCANS_PER_DAY` today, answer `402` with `{ error: { code: 'premium_required', message: <German> } }`; the clients open the paywall on that code. The existing 429 rate limits stay for everyone.
- All new routes go through the existing `limited(...)` wrappers in `worker/src/index.ts`.

## 5. Acceptance criteria

### Web (390 to 1440 px)

- [ ] Paywall opens on `402 premium_required` from a scan and from a "Premium" entry; it never opens before the first scan result.
- [ ] Phone 390 × 844: three steps full screen with the measured layout; desktop 1440 × 900 and 1024 × 768: centred modal panel; no breaks at 768 and 1280.
- [ ] Prices, trial length and free allowance come from `GET /api/billing/config`; no hardcoded price or invented claim anywhere.
- [ ] Monthly/yearly selection, CTA → Stripe Checkout (test mode) → back to the app; after the webhook the scan works again and the paywall does not reappear.
- [ ] Cancel on Stripe returns to the paywall without changes; close button always works; "Wiederherstellen" re-reads the entitlement.
- [ ] Legal links and cancellation info are visible on step 3.
- [ ] `prefers-reduced-motion` respected; keyboard and screen-reader accessible (focus trap in the modal, labelled plan options as a radio group).
- [ ] Side-by-side reference vs. DishFit images for all three steps at 390 and 1440 in the PR.

### iOS (iPhone 17 simulator, iOS 26)

- [ ] Paywall as a full-screen cover on `402 premium_required` and from a "Premium" entry; never before the first scan result.
- [ ] Products load from `Billing.storekit` via StoreKit 2; prices shown with `displayPrice`; trial offer shown when eligible.
- [ ] Purchase in the simulator (StoreKit testing) unlocks scanning; the transaction is sent to `POST /api/billing/storekit` (or stored locally behind the documented dev flag).
- [ ] Restore (`AppStore.sync()`), cancel and failed purchase states are handled with German messages.
- [ ] Reminder step only if a local notification is actually scheduled (permission asked in context).
- [ ] A small `Entitlements` protocol hides StoreKit so RevenueCat can replace it without touching views; no third-party SDK added in this task.
- [ ] Dynamic Type up to XXL without clipping; VoiceOver labels on plans, prices and the timeline.
- [ ] Side-by-side reference vs. DishFit images for all three steps in the PR.

## 6. Tests

- Worker (Vitest, `worker/test/`): webhook signature valid / invalid / replayed, entitlement upserts for each event type, checkout session request body (mocked `fetch`), the `402` gate with and without premium, config route.
- Web: unit tests for the paywall state machine; Playwright journey at 390 × 844 and 1440 × 900 with mocked billing routes (scan → 402 → paywall → choose plan → mocked checkout return → premium → scan works).
- iOS: StoreKit tests with `SKTestSession` against `Billing.storekit` (purchase, restore, cancel, trial eligibility) and a UI test for the paywall steps.
- Before the PR: `npm run lint`, `npm run check`, `npm test`, `npm run e2e` and the iOS `xcodebuild … test` command pass; fix flaky tests you meet.

## 7. Delivery

- Branch from `main`, one PR titled "Paywall im Cal-AI-Stil (Web + iOS, Testmodus)", linked to the GitHub issue.
- PR description: per step the measurement table, the DishFit spec, side-by-side images, the list of config values used as placeholders, and how to run Stripe test mode locally (`stripe listen --forward-to` or a test webhook).
- Do not merge yourself and do not deploy billing; ask Batu for review.
