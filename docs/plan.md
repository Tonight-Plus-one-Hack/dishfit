# Plan: restaurant nutrition app for Berlin

Internal working title: MenuFit (menufit.com is an existing app, so this is never the public name).
State: Saturday 21 November 2026, about 18:10 Berlin time.
This plan replaces the Plus One plan, which is archived in [`archive/plus-one/docs/plan.md`](../archive/plus-one/docs/plan.md).
The paste-ready prompts for each teammate are in [`team-prompts/`](team-prompts/).

## Summary

1. The plan can be live by Saturday 23:00 if the pipeline starts wave 1 (5 Kieze) tonight and the team releases each Kiez after a sample review.
2. The most important finding is legal: "data only from Google Maps" collides with Google's own Places API terms in four places.
   For billing accounts in the EEA, since 8 July 2025, content from the Places API may no longer be displayed with any map; the Places UI Kit is allowed instead.
   Photo references must not be stored and they expire, business names and addresses from Places must not be copied into our own database, and only the place id may be stored indefinitely.
   Reading Places menu photos with a vision model and storing the dishes in D1 is, on our reading, an export of Google content and not covered.
3. The proposed compliant design comes as close to the wish as possible: Google finds the restaurants and shows rating, photos and opening hours live through the Places UI Kit; we store only the place id plus our own data (the menu from the restaurant's own website, our own nutrition calculation, our own coordinates).
   This is a captain decision and is the first item under "Open decisions".
4. The favourite name DishFit has a direct conflict: dishfit.app runs a "Dishfit" product for menu nutrition in the same category.
   Recommendation: Macrohood; from the captain's list, MacroPick.
5. Estimate quality is the second risk: the menu spike measured about 19 percent kcal error and about 10 g too much protein per dish.
   The captain's method (the model gives only ingredients and grams, code computes nutrition from BLS or USDA data, a second model checks outliers) is the right answer; on top come ranges, ranking on the low end of the protein range, and a team release per Kiez.
6. The team prompts are written for the new repo layout (`worker/`, `packages/contract/`, `pipeline/`, `apps/web/`): lane 1 review and QA, lane 2 backend and D1, lane 3 app logic, and everyone also reviews one or two Kieze.
7. Cost: about 8 to 11 USD of AI cost per Kiez on the event keys (estimate from the spike); Places discovery is probably 0 USD inside the free tiers; live display through the UI Kit is billed per call and needs daily limits.

## 1. Google Places compliance

### What applies

| Topic | Rule | Source | Certainty |
| --- | --- | --- | --- |
| Place id | "You can therefore store place ID values indefinitely." | Places policies | read verbatim |
| Coordinates | may be stored "for up to 30 consecutive calendar days, after which you must delete the cached coordinates" | Places policies | read verbatim |
| Names, addresses, reviews | the policies forbid to "copy and save business names, addresses, or user reviews" | Places policies | read verbatim (partial quote) |
| Photo reference | "You cannot cache a photo name. Also, the name can expire." | Place Photos docs | read verbatim |
| Photos per place | "Each API can return up to 10 photos for a place location." | Place Photos docs | read verbatim |
| Photo attribution | the author must be named wherever the image is shown ("you must include the additional attribution in your application wherever you display the image") | Place Photos docs, policies | read verbatim |
| Google attribution | Google Maps logo or the text "Google Maps" next to Places content | Places policies | read verbatim |
| Map (EEA) | "The Google Maps Content from the Places API (New and Legacy) may no longer be displayed with any map."; replacement: the Places UI Kit, "which works with any map (including third-party maps)" | EEA FAQ, for "All projects linked to billing accounts with an address in the EEA", "Effective 8 July 2025" | read verbatim |
| No export, no caching | Google content must not be exported, extracted or stored outside the services; caching only where explicitly allowed | main terms, section 3.2.3 | not verified verbatim, supported only by secondary sources and the policies above |

### What this means for the captain's plan

| Captain's requirement | Verdict | Why |
| --- | --- | --- |
| Find restaurants through Places, filter rating 4.3 and up and an own website | works | the rating is only used while finding, not stored; we store the place id |
| Kiez shards with parallel runs | works | pure organisation |
| Rating, opening hours, price level in D1 and on our map | does not work this way | only the place id may be stored; display live through Google components |
| Pins from Places coordinates on the MapLibre map | does not work this way | EEA rule: Places content on no map; way out: Places UI Kit or our own coordinates |
| Read Places menu photos with vision and store dishes in D1 | does not work, on our reading | export and permanent storage of derived Google content; also weak in practice, because the API returns at most 10 photos per place and menu photos cannot be requested on purpose |
| Match dish photos from Places and store "only the photo reference" in D1 | does not work | photo references must not be stored and expire |
| Restaurant photos live with photographer attribution | works | easiest through the Places UI Kit, which brings the attribution itself |
| AI dish images labeled "AI image" | works | our own content |
| D1 as the database, the app reads only from the DB | works | for our own data; Google content is added live |

### Compliant design (recommendation, option A)

1. Find: Places Text Search per Kiez in a tile grid, deduplicated by place id, filtered to rating 4.3 and up, a website, and an operational business.
   We store only `google_place_id` and our Kiez slug.
2. Menu: from the restaurant's own website (found through the Places website link), as HTML, PDF or image, read by a vision model; we store the source URL and fetch date.
   Chains with official nutrition values first.
   With a tripled candidate pool (about 80 per Kiez) and the measured hit rate of 30 to 40 percent, that gives 24 to 32 restaurants per Kiez, which meets the target of 20 to 30.
3. Name, address and opening hours for our database: from the restaurant's own website (imprint, contact page), extracted by the same model.
4. Coordinates for pins and "near me": our own geocoding of the website address with a free geocoder (Nominatim or Photon, with attribution as for the map tiles).
   This is not an OSM restaurant source, only address geocoding; the web app's base map (MapLibre with OpenFreeMap) uses OSM data anyway.
5. In the app: the restaurant page embeds the Places UI Kit with the place id and shows rating, photos, opening hours and reviews live with Google's attribution.
   Map: pins from our own coordinates with kcal or health score on the pin; the map carousel shows our data and an AI image or no image.
6. "Open now" as a filter: from the opening hours we stored from the website; without them the status is "unknown" and the filter excludes the restaurant.
7. Dish images: AI images in the brand look for the top dishes, clearly labeled "AI image"; real photos only as the restaurant's live gallery through the UI Kit.

Option B would be the captain's plan unchanged.
Risks of B: breaching the Places terms, a possible key suspension in the middle of the numbers window, and a weak answer to the jury question "where does the data come from" in front of a travel company that licenses its data properly.
Recommendation: A.
The backend scaffold already follows A: `restaurants.google_place_id` is the only Google value in D1 (see [`worker/migrations/0001_init.sql`](../worker/migrations/0001_init.sql)), and the Worker never calls the Places API.

### Cost per Kiez for the ledger

Prices from Google's pricing page (read through a summary): Text Search Pro 32 USD per 1,000 (5,000 free per month), Text Search Enterprise 35 USD (1,000 free), Nearby Search Enterprise 35 USD (1,000 free), Place Details Essentials 5 USD (10,000 free), Pro 17 USD (5,000 free), Enterprise 20 USD (1,000 free), Place Details Photos 7 USD (1,000 free), Dynamic Maps 7 USD (10,000 free).
Which fields sit in which tier (rating and website probably Enterprise) is not verified.

| Stage | Volume per Kiez (about 80 candidates, 25 to 30 finished) | Cost per Kiez | Basis |
| --- | --- | --- | --- |
| 1 Find (Text Search Enterprise) | up to 40 requests (tiles times search terms times pages) | 1.40 USD list price, probably 0 USD inside the free tier (10 Kieze = 400 of 1,000) | pricing page, volume estimate |
| 2 Menu, option A (website, vision) | about 30 extractions | 1.50 to 2 USD | spike: 0.036 to 0.138 USD per restaurant for extraction plus estimate |
| 2 Menu, option B (Places photos) | up to 800 photo fetches plus vision triage | 5.60 USD photos (list price) plus 0.15 to 2.60 USD triage | pricing page, estimate |
| 3 Nutrition (ingredients and grams, 2 runs) | about 30 restaurants, about 600 dishes | 3 to 4.50 USD | estimate from the spike tokens (about 270 output tokens per dish) |
| 4 Check (Kiez judgement plus second model on outliers) | about 60 dishes | 0.50 to 1 USD | estimate |
| 5 Images (gpt-image-2.6) | 75 images (top 3 mains of 25 restaurants) | about 2.60 USD | 6 logged calls at 0.0342 to 0.0343 USD each |
| Total, option A | | about 8 to 11 USD | 10 Kieze: about 80 to 110 USD on the event keys |

Runtime: every display through the Places UI Kit is billed per component call; that price is not verified.
Recommendation: set daily limits per SKU and a budget alert in the Google Cloud project before the live link goes out.
Every AI, image and Places call of the pipeline writes one ledger line with provider, model, cost, stage and Kiez; calls made through D1 land in the `ai_usage` table (cost per model and per Kiez at `GET /api/admin/ai-usage`).

## 2. Name

All findings are hints, not proof: DNS only shows whether a domain is delegated, and the App Store search only shows the first hits; trademark registers (DPMA, EUIPO, USPTO) were not queried directly.

| Name | App Store (DE and US) | .com | .app | .de | Verdict |
| --- | --- | --- | --- | --- | --- |
| DishFit (captain's favourite) | no exact hit; similar: "FoodieFit: Healthy Eating Out", "TasteFit", "DishPics: Menü Scanner" | taken (site behind bot protection) | taken: "Fast Food Calorie Calculator & Menu Nutrition - Dishfit" | NXDOMAIN (hint: free) | conflict: same name, same category, live web product; also very close to MenuFit |
| MenuPick | no exact hit; similar: "FoodPickAI: Allergy Menu", "MenuPal" | taken (empty response) | NXDOMAIN | NXDOMAIN | usable, but close to MenuPal and MenuFit |
| MacroPick | no exact hit | taken: classifieds marketplace, other industry | NXDOMAIN | NXDOMAIN | best of the three captain names |
| Macrohood (proposal) | no exact hit; only generic macro trackers are similar | NXDOMAIN | NXDOMAIN | NXDOMAIN | all three domains look free; fits the Kiez story ("macros in your neighbourhood") and scales to other cities |
| Makrokarte (proposal) | no hit | NXDOMAIN | NXDOMAIN | NXDOMAIN | German pun (Karte = menu and map), weak internationally |
| Sattfit (proposal) | no exact hit; similar "SatisFIT" (workout app) | NXDOMAIN | NXDOMAIN | NXDOMAIN | short, German, explains little |

Existing apps in the same field from the App Store search: "MenuFit - Healthy Eating Out", "Order Fit", "LeanBites - Healthy Dining", "MenuPal", "MacrosMap - Restaurant Macros", "AI Calorie Tracker - MacroMap".
That rules out MacroMap and LeanBite as well.

Recommendation: Macrohood.
If it has to be one of the three captain names: MacroPick with macropick.app and macropick.de.
DishFit is not recommended because of dishfit.app.
Objection to all macro names: they speak to the fitness crowd more than to people who simply want to eat healthily; the health score balances that in the app.

The brand kit in [`brand/`](../brand/) stays; only the wordmark changes once the name is final.

## 3. Screens (web first, mobile first, iOS later)

Structure after menufit (structure only), look from our design system: tokens, fonts and motion from the Plus One web prototype ([`archive/plus-one/web-prototype/`](../archive/plus-one/web-prototype/), PR https://github.com/Tonight-Plus-one-Hack/wohin/pull/11) and the motion system ([`design/motion/`](design/motion/), PR https://github.com/Tonight-Plus-one-Hack/wohin/pull/13).
Tabs in the web shell: Discover, Map, Search and filters, Today and profile.

| Screen | Content | Template and reuse |
| --- | --- | --- |
| Discover (home, `/c/berlin`) | headline "The best protein dishes under 12 EUR near you", location chip ("Near me" or a Kiez), filter chips, dish cards with price, kcal, protein, carbs, fat as "approx." values, health score, protein per euro, distance, "open now", label "AI estimate" | content is visible right away without onboarding, as the captain asked; list pattern from the prototype's `CityTonight.tsx` |
| Map (`/c/berlin/map`) | light warm map, pins with kcal or health score on the pin, filter chips on top ("Open now", price, Kiez), a horizontal carousel of large cards at the bottom, bottom sheet with the list | the captain's Mobbin references: Places (main template), TheFork (score on the pin), corner (chips, grid in the sheet), Zesty (large card with chips), OpenTable (sheet with list); technique from the prototype's `MapView.tsx` and `LazyMap.tsx` (MapLibre); pins from our own coordinates, see section 1 |
| Restaurant (`/r/:id`) | name, Kiez, address, buttons "Directions" and "Menu (source, checked on date)", share; Google block live through the Places UI Kit (rating, photos, opening hours); dishes by section with sorting | card pattern from the prototype's `Spots.tsx` |
| Dish (`/d/:id`) | large macro numbers with range, health score with band, price, protein per euro, "fits your goal" (share of the daily goal), confidence high, medium or low, "How is this calculated?" with ingredients and grams, source, "Report a value", share "Let's eat here", more from the restaurant | new |
| Filters (bottom sheet) | max kcal, min protein, max price, min health score, diet, open now, distance, Kiez, sort; quick chips "Under 12 EUR", "40 g+ protein", "Under 600 kcal", "Vegan", "Open now" | chips from the prototype's `ui.tsx` |
| Onboarding (`/start`, Cal AI style) | 1 goal (lose fat, build muscle, eat balanced), 2 daily kcal goal (suggestions plus own value), 3 protein goal (suggestions matching the goal), 4 diet (skippable), 5 location ("Near me" or a Kiez), result "3 dishes that fit you today" | the prototype's `Flow.tsx` and `flow.css` almost unchanged; deliberately without weight, height and age, which keeps it at 20 seconds and avoids health data; reached through "Tailor to me", never a gate in front of the content |
| Today and profile | daily goal, saved dishes (stored in the browser only), change goal | the prototype's `session.ts` |
| Landing (`/`) | order as on menufit: hero with the core promise, benefit in three images, "How it works", Kieze instead of chain logos, restaurant search, benefits by goal, testimonials (only with real users), FAQ ("How accurate are the values?"), closing call to action, footer | the prototype's `Landing.tsx` as a frame, own texts and images; no user count or testimonial claim without proof |
| "How we calculate" | method, health score formula, typical error, sources | new, important for trust and for the jury |
| Numbers (`/numbers`), imprint, privacy | as before | the prototype's `Legal.tsx`, numbers from https://github.com/Tonight-Plus-one-Hack/wohin/pull/12 |

Dropped from the prototype: chat, report dialog, hangout, join, create and the hangout data.

### What the menufit research means for our scope

- menufit asks a quiz of about 34 steps, then an account, then a hard paywall; of its 150 most recent US reviews, 72 percent are 1 star (paywall, wrong calories, gaps in local menus).
  Our answer: usable right away without quiz, account or paywall, Berlin preloaded.
- menufit shows no price per dish.
  Price, protein per euro and the budget filter are our clearest difference and belong on every dish card.
- menufit shows an AI "mock menu" when a menu is missing.
  We show no dish without a source and a date.
- Navigation: the research suggests the map with a bottom sheet as the start screen and only 3 tabs (Map, Saved, Me); the web shell has 4 tabs (Discover, Map, Search and filters, Today and profile).
  Recommendation: start on the map, the bottom sheet carries the list "The best protein dishes under 12 EUR near you", search and filter chips float over the map; detail pages as sheets so the location stays in view.
  That meets both captain wishes at once ("see the restaurants right away" and "beautiful maps").
- Build for the submission: short goal onboarding, ranking with score, kcal and macros with range, price, map as the main screen, "open now", Kiez filter, confidence per dish with a "checked" status, a "this value is wrong" button, directions, German and English.
- Do not build for the submission: ordering through delivery services, an AI chat tab, menu scanning by users, a meal builder, accounts and sync, a food diary (at most a light one: protein and euros per day).
- Sugar and salt are missing in menufit and requested in its reviews; the data model in the team prompts already has both fields.

## 4. Data pipeline

The split follows the captain: deterministic scripts with AI calls, agents only for judgement, one "Kiez chief" per Kiez, wave 1 with 5 Kieze in parallel (Mitte, Kreuzberg, Prenzlauer Berg, Friedrichshain, Neukölln), wave 2 early Sunday (Charlottenburg, Schöneberg, Wedding, Moabit, Wilmersdorf).
The queue lives in D1 with a status per restaurant (found, menu, nutrition, checked, image, approved); every stage is idempotent and resumable.
The pipeline owns `pipeline/` and `worker/migrations/0010-0029`; the Worker owns `worker/migrations/0001-0009`.

| Stage | Content | Note from this plan |
| --- | --- | --- |
| 1 Find | Places Text Search in a tile grid per Kiez, deduplicated by place id, rating 4.3 and up, website present; pool of about 80 candidates per Kiez | assign the Kiez by the search tile, not by a point-in-polygon test on Places coordinates |
| 2 Menu | 10 to 20 in parallel; a vision model extracts dish, short description, price, section, course, diet; source URL and fetch date | source per the recommendation: the restaurant's own website (depth 2, also location subpages, headless fallback for JavaScript sites, respect robots.txt); Places menu photos only if the captain picks option B |
| 3 Nutrition | the model gives only ingredients and grams with low and high bounds; code computes with BLS or USDA data; official restaurant values replace the estimate | BLS 4.0 has been free since 16 December 2025, but the exact license terms were not found; USDA FoodData Central is public domain and the safe base |
| 4 Check | one Kiez chief per Kiez: outliers, unreadable menus, a second model on flagged dishes, confidence level | the second model from another provider (the OpenAI event key) for real independence; plus the fixed QA rules from lane 1 |
| 5 Images | AI image for top dishes, labeled "AI image" | photo matching from Places only with option B |
| 6 Release | team sample per Kiez in the review page, "correct" or "wrong" | release rule: at least 40 dishes from 12 restaurants reviewed, 90 percent correct for name and price, 80 percent overall, no open blocking flag |

Lessons from the menu spike (10 Berlin restaurants), built into the plan:

- Only 3 of 10 restaurants had a menu with prices on their own website, hence the tripled pool.
- Mean kcal error 19 percent, protein about 10 g too high, and two runs on the same dish differ by 21 percent at the median.
  Answer: ingredients and grams instead of a free estimate, two runs and a range from them, ranking on the low end of the protein range, display as "approx." with the range.
- The official dean&david values serve as a small test set: before the mass run, the kcal error on it should be under 15 percent and the protein bias under 10 percent; otherwise sharpen the prompt.
- Sharing platters ("for 2 or 3 people"), sides and drinks distort "protein per euro"; that is why there is a course field and the home feed shows mains only.
- Chain menus without prices stay without a price and never appear in price filters.

Health score: an open formula in code (start at 50, plus for protein density, fibre and vegetable share, minus for energy density, saturated fat, sugar, salt and deep frying, range 0 to 100), the same function in the pipeline and the app, details in lane 3's prompt.
It is an editorial rating with an open formula, not a Nutri-Score and not a medical statement.

Refresh: prices and menus change; every record carries its fetch date, the app shows "checked on", and a new Kiez run replaces the data stage by stage.
After the hackathon: a weekly run.

Legal notes (not legal advice):

- No scraping of Google Maps, delivery platforms or Instagram; images from restaurant websites are never copied.
- From websites we take only facts (dish name, price, a short neutral ingredient line) with a source link and date; robots.txt is respected; a restaurant can opt out through the contact in our imprint.
- Every value is visibly an "AI estimate" with range and confidence; footer "Estimate, not lab values, not medical advice".
- No allergen claims; instead the note "Ask the restaurant about allergies".
- No claims such as "low fat" or "high protein" on single dishes (EU regulation 1924/2006 governs such claims); we show numbers and rankings.
- AI dish images are illustrations and must be labeled "AI image", otherwise they look like the restaurant's real dish.
- Prices carry "according to the menu of <date>".
- Location only after a tap on "Near me", never stored; goals stay in the browser.

## 5. Team prompts

Three paste-ready prompts in [`team-prompts/`](team-prompts/), one per lane; sections 1 to 10 are identical in all three (product, rules, layout, API contract, data model, schedule), followed by tasks, definition of done and "what not to touch" per lane.

| File | Lane | Core |
| --- | --- | --- |
| [`vinaynaik432-debug.md`](team-prompts/vinaynaik432-debug.md) | 1 review and QA | 14 fixed quality rules, a phone review page "Correct / Wrong", a release gate per Kiez, a calibration report |
| [`Kalvarez09.md`](team-prompts/Kalvarez09.md) | 2 backend and D1 | schema alignment with the scaffold and the pipeline, migrations 0002 to 0009, `packages/contract/`, the read API (Kieze, map, restaurant, dish), fixture, staging |
| [`Malek1414.md`](team-prompts/Malek1414.md) | 3 app logic | health score, protein per euro, open now, Kiez and near me, ranking and search, events and `/api/numbers`, share links |
| [`README.md`](team-prompts/README.md) | overview | ownership, review plan per Kiez, merge order, Batu's manual steps |

The assignment follows earlier work (Kalvarez09 built the Worker skeleton, Malek1414 events and sharing).
If it should change, only the names in the titles and tables change.

## 6. Schedule until Sunday 21:00

| Time | What |
| --- | --- |
| Sat 18:15 to 18:30 | captain decides the data source (section 1) and the name; pivot message and prompts to the team |
| Sat 18:30 | pipeline wave 1 starts (5 Kieze in parallel); restructure PR merged |
| Sat 19:15 | first small PRs: lane 2 schema and contract, lane 1 QA rules, lane 3 pure logic |
| Sat 20:30 | read API, search and review page as PRs; web app clickable on mock data |
| Sat 21:00 to 22:00 | integration on staging with real data from wave 1, test on real phones |
| Sat 22:00 to 23:00 | team sample per Kiez, release, production after the captain's OK |
| Sat 23:00 | live link; team devices excluded from the numbers; ads submitted for review |
| Sat 23:00 to Sun 01:00 | first users through hackathon participants and team networks; fixes |
| Sun 08:30 to 13:30 | numbers window: ads, posts, running groups and gyms; wave 2 reviewed and released by 12:00; numbers snapshots at 10:00 and 12:00 |
| Sun 13:30 | feature freeze |
| Sun 14:00 | numbers export for the slides |
| Sun 15:15 / 15:30 | team target / submission (live link, 3 slides, real user numbers) |
| Sun 15:30 to 18:00 | pitch and questions; keep the app stable |
| Sun 18:27 | the event's Bedrock key expires; no effect, because the app calls no AI at runtime |
| Sun 18:00 to 21:00 | final numbers export with timestamp, handover notes, thanks to users |

## 7. Getting users

Who wants this tonight and on Sunday in Berlin:

- Hackathon participants and organisers: they eat near the venue tonight and tomorrow at lunch; a QR code on the tables and in the event chat ("Where do I get 40 g of protein under 12 EUR around here?").
- Fitness people: dinner after Saturday's workout, Sunday after the run or the gym.
  Channels: Sunday morning running groups, gym counters with a QR flyer (ask first), team stories.
- Students: the canteen is closed on Sunday; the "protein per euro" ranking is their argument.
  Channels: the teammates' university and Erasmus groups.
- Tourists (the Layla angle): "eat healthily in a strange city"; hostel receptions with a QR code, Sunday brunch.
- Office lunch: weak at the weekend, but the strongest lasting audience from Monday; an outlook for the pitch.

Built-in sharing loop:

1. Share a dish: "approx. 38 g protein, approx. 610 kcal, 11.90 EUR at X, 650 m away" with a link preview; the natural moment is the question "where do we eat".
2. After the tap on "Directions": "Going with someone? Send them the dish."
3. Shareable lists with the filter in the link: "Top 10 protein dishes under 12 EUR in Kreuzberg".
4. Restaurant badge: "No. 1 protein per euro in Neukölln" as a story card; the restaurant has its own reason to share it.
5. Result card after onboarding: "3 dishes that fit my goal today".

150 EUR ad plan (only with the captain's approval):

- Meta's rules on health and body image apply: no before and after images, no copy that implies a negative self-image; the ad only says "dishes with price and nutrition near you".
- Meta (Reels and Stories, Berlin plus 15 km, ages 18 to 40): 110 EUR, of which 20 EUR Saturday 23:00 to 01:00 as a creative test and 90 EUR Sunday 08:30 to 13:30 on the best creative, because Sunday morning is when people decide where to eat.
- Google Search: 40 EUR Sunday 08:30 to 13:30 on queries such as "gesund essen berlin", "high protein restaurant berlin", "kalorienarm essen gehen".
- Submit ads only once production is live, because Meta reviews the landing page.
- Expectation from earlier ad benchmarks (the week before Black Friday is expensive): 75 to 190 clicks; the measure per click is a tap on "Directions" or "Menu".

## 8. What we could do next

Growth and virality:

- Weekly Kiez rankings as shareable pages ("Protein per euro: top 10 Friedrichshain").
- "Report a value" for users, with a visible correction ("checked by people").
- Restaurants can submit their official values and get the label "official".
- Creator lists: a Berlin fitness creator gets their personal top 5 as a link.

Impact on the jury:

- A live number "X people decided where to eat with us" (devices that tapped Directions or Menu).
- An honesty slide: measured error before and after the ingredient method, share of dishes checked by people, cost per restaurant (about 0.09 USD in the spike).
- A "How we calculate" page with formula and sources.
- Clean data provenance as an argument in front of a travel company.

The Layla angle:

- "Eat well in any city": a second city behind the same pipeline as proof (one Kiez in Hamburg or Lisbon).
- A hand-off to Layla on restaurant and Kiez pages: "Plan a trip around good food".
- A "travel mode": enter the hotel address, see the best dishes within a 10-minute walk.
- Later a Layla integration as a data source for trip plans ("3 days in Berlin with 120 g of protein a day under 35 EUR").

## 9. Message to the team

Folks, we are turning the hack idea around.
Plus One is too niche; instead we are building an app that shows Berlin restaurants on a map, with price and nutrition per dish (kcal, protein, carbs, fat as an AI estimate) and a health score.
Home page: "The best protein dishes under 12 EUR near you", so you know right away where to go.
A central pipeline scans the menus per Kiez; you do not scan yourselves.
Your new prompts are in `docs/team-prompts/`; everyone gets their own area (review and QA, backend and D1, app logic with filters and ranking).
Everyone also reviews a sample for one or two Kieze in the review page tonight between 22:00 and 23:00 (correct or wrong).
Goal: first PRs by 19:15, staging 22:00, live 23:00, freeze Sunday 13:30, submission 15:30.
Keys never go into the repo or the chat; Batu sets them.

## 10. Risks

- Data source: while the captain's decision on section 1 is open, the pipeline and web workers build against assumptions that can change.
- Menu hit rate: at only 30 to 40 percent, the volume depends on the pool size; under 15 restaurants a Kiez stays hidden by the gate.
- Estimate quality: without calibration the ranking overstates protein; the gate and ranking on the low end dampen that but do not solve it fully.
- Lane 1 is release-critical: without the review page and the gate no Kiez goes live; if no PR is open by 20:00, another worker should take it over with the same prompt.
- The person assignment (Vinay review and QA, Kalvarez backend and D1, Malek app logic) follows earlier work and can change.
- Places runtime cost: without daily limits the bill is open-ended.
- Time: live at 23:00 leaves only Sunday morning as a real numbers window.

## Open decisions

1. How to handle Google Places data.
   Options: (A, recommended) the compliant design from section 1: Places for finding and for live display through the Places UI Kit, only the place id plus our own data stored, menus from the restaurants' own websites, dish images as AI images; (B) the captain's plan unchanged with menu photos, photo matching and stored Places fields, with the risk of breaching Google's terms.
2. Name.
   Options: Macrohood (recommended), MacroPick, MenuPick, DishFit (conflict with dishfit.app), Makrokarte, Sattfit.
3. Spending.
   (a) Google Cloud billing for Places with daily limits and a budget alert, yes or no; (b) ad budget 150 EUR: 110 EUR Meta plus 40 EUR Google Search (recommended), Meta only, or no ad spend; (c) buy a domain, about 10 to 20 EUR per year per ending, yes or no; (d) a cap on the pipeline's AI cost on the event keys, proposal 12 USD per Kiez and 120 USD in total.

## Sources

- Places policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- EEA FAQ: https://developers.google.com/maps/comms/eea/faq
- Place Photos: https://developers.google.com/maps/documentation/places/web-service/place-photos
- Places UI Kit: https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview
- Main terms (could not be fetched in full): https://cloud.google.com/maps-platform/terms
- BLS 4.0 free of charge: https://heise.de/-11123877 and https://lebensmittelpraxis.de/handel-aktuell/47047-nationale-naehrstoffdatenbank-bundeslebensmittelschluessel-wird-kostenfrei-zugaenglich.html
- menufit (structure only): https://menufit.com/
- Dishfit web product: https://dishfit.app
