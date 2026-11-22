# Plus One: build plan (city app)

Working name: "Plus One" (final name open; proposals come with the brand kit).
Event: Layla / Expedia Group "5K Build & Launch" hackathon, Berlin, Sat 21 Nov 2026 14:00 to Sun 22 Nov 2026 15:30.
Submission: live link, 3 slides, real user numbers.

## Product in one sentence

Pick a city, see who is alone tonight and wants to go out, join or start a small group (3 to 8 people) at a public spot, and find the best spots to meet.

## Roles

- Frontend, landing page, brand kit, logo, logo video: Batu (with agents).
- Backend: Kalvarez09, vinaynaik432-debug, Malek1414, following the prompts in `docs/team-prompts/` (added when ready).

## Stack

We follow https://github.com/blakeandersonw/ai-app-playbook (read its `AGENTS.md` and `playbook/`).
- Web client: React + Vite + TypeScript.
- Backend: Cloudflare Workers, D1 (SQL), KV, R2, Durable Objects for real-time group chat, Queues.
- Auth: per playbook (Better Auth); the MVP is no-login (nickname + device id), so auth may be anonymous sessions only.
- Analytics: Tinybird or a plain events table in D1.
- AI: through Cloudflare AI Gateway; keys only as Cloudflare secrets, never in the repo.
- Not used: Vercel, Supabase, Next.js, Firebase, Clerk, PostHog, ORMs.
- Deploy: Cloudflare free tier.

## Order of work

1. Frontend prototype without backend (React + Vite, mock data), clickable end to end.
2. Backend in parallel by the team (D1 schema, hangouts API, chat, safety, spots API, share links, numbers).
3. Swap mock data for the real API, deploy, launch Saturday evening.

## MVP (live Saturday evening)

1. Landing page.
2. City picker like Luma Discover (Berlin complete first, then more cities).
3. City page "tonight": open hangouts with time, spot, vibe (bar, club, chill, culture), seats left, language, attendee avatars and "x going".
4. Start a hangout in about 20 seconds: spot from the curated list, time, vibe, size 3 to 8, language.
5. Join: one question per screen (nickname, mood, 18+ confirmation), then the hangout page with group chat and an "I'm here" check-in.
6. Spots page: map with pins plus large spot cards (name, type, neighborhood, save), filter chips.
7. Share: every hangout and city page has a link with a preview image (WhatsApp, Instagram story, copy link), plus a "bring a friend" seat.
8. Travelers new in town: hand-off to Hotels.com, Vrbo, Expedia city search and "Continue with Layla".
9. Public `/numbers` page, imprint and privacy pages.

## Safety and trust (required in the MVP)

- Groups only (minimum 3 seats), no 1:1 meetings, no browsable private profiles.
- Only public spots from the curated list, no private addresses, no free-text location.
- No location tracking; the city is chosen, never detected.
- Report and block on every hangout and message; a message is hidden after 2 reports, a hangout after 3, a member removed after 3 reports across hangouts; admin view for the team.
- 18+ confirmation and safety hints on every hangout page (meet in public, tell a friend, watch your drink, leave anytime).
- Rate limits per device, simple word filter, optional AI moderation that fails open to the filter.
- Hangouts expire at 06:00 local time the next morning.
- No phone numbers or emails required.

## Spot data

- OpenStreetMap via the Overpass API (bars, pubs, nightclubs, beer gardens), licensed ODbL, attribution "© OpenStreetMap contributors" shown in the app.
- Exported once per city into JSON (see `data/spots/` from the spots PR), with a curated top list per city.
- No ratings or photos are invented; no scraping of Google Maps, Yelp, Luma or Resident Advisor.

## Built-in sharing loop

- A hangout needs people, so whoever starts it shares the link to fill it ("3 seats left").
- "Bring a friend" seat and a story card ("Going out with 5 new people tonight").
- City page as a shareable live counter.
- After the night: "Start the next one".

## Design references

- Thayon (https://thayon.com/): overall visual style, landing page and app, logo style; own copy, own images, own name.
- Luma: structure (Discover, city display, lists by day, clear event cards, one-tap join, share link).
- Cal AI: clarity and onboarding (one question per screen, thin progress bar, big headlines, full-width pill buttons).
- Resy: spots and map (pins on top, large spot cards, filter chips).
- Nothing is copied: no logos, texts or images from these products.

## Growth (150 EUR ad budget, needs team approval before any spend or posting)

- Meta Reels/Stories, Berlin, 18 to 32, travelers, Erasmus, nightlife, expats, English and German.
- Free channels: the hackathon attendees and organizers (live demo tonight), Erasmus/ESN groups, hostel receptions with QR codes, team networks, Berlin micro-creators.
- All user numbers on the slides are measured from our own events table, with team and test devices excluded.

## Metrics for the slides

Cities active, hangouts created, people joined, share of hangouts reaching 3+ people, messages, shares per user, hand-off clicks per brand, cost per joined user from ads, all with a timestamp.

## Rules

- All product code is written during the event.
- Never commit secrets or `.env` files.
- Small PRs, one owner per folder, main always deployable.
