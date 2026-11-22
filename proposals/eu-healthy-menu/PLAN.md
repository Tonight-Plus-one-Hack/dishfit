# EU healthy menu app: build plan

Separate proposal. Nothing here changes Plus One or any lane. Owner: Malek.

## One line

Snap any menu in Europe, in any language, and know in seconds what to order for your goal and what to avoid for your
allergies, with numbers we can justify.

## Why people will want it

- US apps like MenuFit (about 2.1M installs, about 337K monthly users) work from chain-restaurant databases (Wendy's,
  McDonald's). Most restaurants in Europe are independent and publish no nutrition data, and menus are often only in
  the local language.
- Travellers eat out three times a day in a language they cannot read. Expats, students and gym-goers in Berlin
  face the same thing every week.
- Most AI calorie apps show one confident number. Ours shows a range and where every number comes from.

**Claim:** "Snap any menu in Europe. Know what to order, with numbers we can justify."

## Built on open source

- Fork: https://github.com/Malek1414/nut-ai (from Nut AI by Mann Bellani, AGPL-3.0-or-later). Our version stays open
  source under the same license, with credit in the README, the app footer and the pitch.
- We reuse the engine in `packages/*` (plain TypeScript, about 6,600 lines): core-schema, gram-engine, resolver,
  db-adapter, totals, confidence, clamp, repair, prompt, pipeline. Its rule stays: the model only recognises food,
  grams come from fixed rules, nutrition from a database row, totals are arithmetic.
- We do not ship `apps/mobile` (Expo app tied to the publik service). We build a web app that runs in the phone browser.
- Forking open source is OK for this event (confirmed 21 Nov).

## What we add

1. **Menu mode** (new): photo of a menu, the model lists each dish and its likely components, the engine estimates
   each dish's calories and macros as a range, then we rank dishes for the user's goal.
2. **European food data:** Open Food Facts (free, no key, strong on European products) next to the bundled USDA data,
   plus a small table of common European dishes (Döner, Currywurst, Schnitzel, Pho, Margherita, Falafel teller ...)
   with component recipes, written by us and marked as estimates.
3. **Goal and allergy interview:** one question per screen (goal, diet, allergies, language), stored on the device.
4. **Allergy check:** each dish flagged "likely contains" with the reason, always with "confirm with the restaurant".
5. **Ask in the local language:** one tap gives the sentence to order it your way ("Ohne Soße, bitte").
6. **Meal photo mode:** Nut AI's original scan, for the plate in front of you.
7. **Share card:** "My best order at <restaurant>: 620-720 kcal, 48 g protein" for stories.

## The flow

1. Landing: the claim, one button "Scan a menu".
2. Interview: goal (lose fat, build muscle, eat balanced, vegan or vegetarian), allergies, language. About 30 seconds.
3. Camera: photo of the menu (or pick from photos).
4. Results: top 3 dishes for the goal with ranges and sources, dishes to avoid, the sentence to ask, share card.
5. Tap a dish: components, grams, where each number came from, "this looks wrong" to correct it.

## Stack (all free)

- Web app: React + Vite + TypeScript, works in the phone browser with the camera (`<input capture>`).
- API: one Cloudflare Worker (same platform as the team), engine packages imported from the fork.
- AI: Claude through the team key, set as a Worker secret, never in the repo. The model only reads the menu and
  names components; it never owns a number on screen.
- Data: Open Food Facts API, the bundled USDA data from the fork's build tool, our European dish table.
- Analytics: an events table (scans, dishes shown, share taps), team devices excluded, for the numbers slide.

## Timeline (submission Sunday 15:30)

| When | What | Done when |
|---|---|---|
| Sat evening | web app shell, interview, camera, Worker with the engine packages building | a photo reaches the Worker |
| Sat night | menu mode: dish list from the photo, engine ranges, ranking for the goal | a real Berlin menu gives a sensible top 3 |
| Sat night | Open Food Facts lookup + European dish table, allergy flags, ask-in-German sentence | Döner and Pho give believable ranges |
| Sun 09:00 | meal photo mode, share card, events and /numbers | full flow on a phone |
| Sun 09:00-14:00 | users: gyms, CODE Slack, Erasmus and expat groups, fitness TikTok ("what to order at a Berlin Döner when cutting") | numbers growing |
| Sun 14:00-15:15 | 3 slides, pitch, numbers frozen | submitted 15:30 |

## Numbers for the jury

Menus scanned, people who scanned, dishes recommended, share taps, cities and languages seen.

## Risks

- **Accuracy:** every number is a range with its source; allergy flags are hints, never a guarantee.
- **Scope:** if time runs short, cut meal photo mode first, then the share card. Menu mode is the product.
