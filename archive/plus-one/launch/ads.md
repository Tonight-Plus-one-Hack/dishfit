# Meta ads: Reels and Stories

Draft only.
No ad account is created, no campaign is set up and no money is spent until the captain says go.

## Setup that applies to all three concepts

- Look: the brand kit in `brand/` (tokens in `docs/design/tokens.json`).
  Off-white canvas `#fcfcfd`, ink `#1c2024`, cobalt `#355eda` and periwinkle `#8391f7` as accents, Source Serif 4 for headlines, Geist for text.
  Use the logo files from `brand/assets/`, never a redrawn one.
- Placements: Instagram Reels, Instagram Stories, Facebook Stories.
  Vertical 9:16, 6 to 15 seconds.
- Location: Berlin plus 15 km radius, "people living in or recently in this location".
- Age: 18 to 32.
- Interests (broad, let Meta expand): travel, Erasmus Programme, expatriates, nightlife, backpacking, bars, electronic music.
- Languages: one ad set in English, one in German.
  English first, because travelers and Erasmus students are the core audience.
- Objective: Traffic, optimised for landing page views (we have no pixel conversion event to optimise for yet).
- Destination: the Berlin city page, not the home page, so people land on open hangouts.
- Frequency cap is not available on Traffic campaigns; watch frequency manually and rotate creative if it climbs past roughly 3 in an evening (rule of thumb).

### Policy risk to keep in mind

Meta treats dating products as a restricted category that needs prior approval.
Plus One is not dating: groups of at least 3, public spots, no 1:1.
Keep every ad clearly about groups and going out, never about meeting one person.
Avoid words like "match", "date", "single" and photos of couples.
Meta reviews every ad before it runs, so submit the creatives as early as possible after the go.

## Budget split (150 EUR total, from the plan)

| Window | Amount | What runs |
| --- | --- | --- |
| Sat 19:00 to 24:00 | 100 EUR | All three concepts, split evenly (about 33 EUR each). EN and DE ad sets per concept. |
| Sun 10:00 to 14:00 | 50 EUR | Only the concept with the lowest cost per joined user on Saturday, re-cut for Sunday plans (brunch, Mauerpark flea market, afternoon walk). |

Saturday kill rule (rule of thumb, not data): once a concept has spent 20 EUR, compare cost per joined user.
If one concept costs more than twice the best one, pause it and move its remaining budget to the best one.

Expectation from the plan, labeled as an estimate: 200 to 500 clicks, 20 to 35 % of them join or start a hangout, so roughly 40 to 170 users from ads.
Treat that as a guess to test against, not a target we report.

## Concept 1: "New in Berlin?"

Format: 6 second slow zoom on `brand/assets/city-berlin.webp` (original generated artwork, no people), headline set in Source Serif 4 on the off-white canvas, logo lockup at the end.

- Headline (EN): New in Berlin?
  You don't have to go out alone tonight.
- Headline (DE): Neu in Berlin?
  Heute Abend nicht allein.
- Primary text (EN): See who else wants to go out tonight and join a small group at a public bar or club.
  3 to 8 people, no account, 20 seconds to join.
- Primary text (DE): Sieh, wer heute noch rausgehen will, und tritt einer kleinen Runde in einer Bar oder einem Club bei.
  3 bis 8 Leute, ohne Konto, in 20 Sekunden.
- CTA button: Learn more (EN) / Mehr dazu (DE).
- Audience emphasis: Erasmus, expats, travel.
  This is the Layla/Expedia angle: travelers arriving in a new city.
- `utm_content`: `new-in-city-en`, `new-in-city-de`.

## Concept 2: "5 strangers, 1 bar, 9 pm"

Format: Reel on the brand night background `#111113` with `#edeef0` type in Source Serif 4, three beats of about 2 seconds each, then the app's city page and the light logo lockup.
Beat 1: "5 strangers."
Beat 2: "1 bar."
Beat 3: "9 pm."
Then: "Join a group tonight."

- Headline (EN): 5 strangers, 1 bar, 9 pm.
- Headline (DE): 5 Fremde, 1 Bar, 21 Uhr.
- Primary text (EN): Small groups going out in Berlin tonight.
  Pick one, say hi, show up.
  Public spots only, everyone 18+.
- Primary text (DE): Kleine Runden, die heute Abend in Berlin rausgehen.
  Eine aussuchen, Hallo sagen, hingehen.
  Nur öffentliche Orte, alle 18+.
- CTA button: Learn more / Mehr dazu.
- Audience emphasis: nightlife, bars, electronic music.
- `utm_content`: `five-strangers-en`, `five-strangers-de`.

## Concept 3: "Watch a group fill up"

Format: 10 to 12 second screen recording of the real app.
A hangout shows "2 of 6", then members join one by one until "6 of 6", then a cut to the city page with more open hangouts.
Record only a real hangout with the members' consent, or one the team itself filled; blur nicknames that are not ours.
End on the last second of `brand/assets/logo-reveal.mp4` (1080 x 1440), centered on the off-white canvas for 9:16.

- Headline (EN): This group was full in 20 minutes.
  Use this line only if it actually happened; otherwise use "Groups are filling up in Berlin tonight."
- Headline (DE): Diese Runde war in 20 Minuten voll.
  Nur verwenden, wenn es wirklich so war; sonst "Heute Abend füllen sich Runden in Berlin."
- Primary text (EN): Start a group at a bar you like, or join one that's still open.
  Share the link, and it fills up.
- Primary text (DE): Starte eine Runde in deiner Lieblingsbar oder tritt einer offenen bei.
  Link teilen, und sie füllt sich.
- CTA button: Learn more / Mehr dazu.
- Audience emphasis: broad within the age and location settings.
- `utm_content`: `fill-up-en`, `fill-up-de`.

## UTM scheme

All links we control carry UTM parameters.
`utm_source` is a closed list so the numbers page can group cleanly.

| Parameter | Allowed values | Meaning |
| --- | --- | --- |
| `utm_source` | `meta`, `whatsapp`, `qr`, `esn`, `team`, `ph` | Where the click came from. `ph` is Product Hunt or similar launch sites, `esn` covers ESN and other Erasmus/student groups, `team` covers our own networks and the hackathon crowd. |
| `utm_medium` | `paid`, `share`, `group`, `poster`, `flyer`, `card`, `event`, `dm`, `email` | How it reached them. |
| `utm_campaign` | kebab-case, for example `launch-berlin`, `sunday-berlin`, `hackathon-room`, `hangout-fill` | Which push. |
| `utm_content` | kebab-case creative or location id, for example `new-in-city-en`, `hostel-1` | Which creative or which poster. |

Meta URL for concept 1, English:

```text
{APP_URL}/berlin?utm_source=meta&utm_medium=paid&utm_campaign=launch-berlin&utm_content=new-in-city-en
```

For Sunday, change only `utm_campaign` to `sunday-berlin`.

## How to measure cost per joined user

What the app needs to record (for whoever owns event logging):

1. On first visit, store the UTM parameters on the device (first touch) and keep them for the session.
2. Attach the stored `utm_source`, `utm_campaign` and `utm_content` to the `join` and `start_hangout` events.
3. Count a "joined user" as a unique device that joined or started at least one hangout.

How we compute it:

- Spend per concept and language comes from Meta Ads Manager (amount spent, by ad).
- Joined users per concept come from our own events table (D1, or Tinybird if we use it), filtered by `utm_source=meta` and grouped by `utm_content`.
- Cost per joined user = Meta spend for that `utm_content` divided by joined users for that `utm_content`.
- Also note cost per landing page view from Ads Manager, to see whether a weak concept fails at the click or on our page.

Check it at 20:30, 22:00 and 23:30 on Saturday, and at 12:00 on Sunday before deciding anything.
Expect our numbers to be lower than Meta's click numbers: some clicks never load the page, and some people decline to join.
Report what we measured, with the date range and the definition, and never mix Meta-reported numbers into our own user count.
