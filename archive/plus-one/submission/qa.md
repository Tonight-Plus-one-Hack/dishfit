# Jury Q&A prep (EN)

Honest answers for the Plus One submission.
Rule for every answer: say what is true today, name what is not done yet, and do not round numbers up.
Numbers in square brackets come from `numbers.json`; if a field is still null, say "we do not have that number yet".
Feature answers describe the build plan; before the jury, check each one against the live app and change the answer if a feature did not ship.

## Safety

**How do you stop someone from using this to meet a lone person and hurt them?**
There are no one-on-one meetings in the product.
Every hangout has at least three seats, and it happens at a spot from our curated list of public places, so there is no way to enter a private address or a free-text location.
Nobody's profile is searchable, you only see nicknames inside a hangout you joined.
That reduces risk, it does not remove it, and we say that on every hangout page: meet in public, tell a friend where you are, keep your drink in sight.

**What happens when someone behaves badly?**
Every hangout and every message has report and block.
A message with two reports is hidden, a hangout with three reports is hidden, a member reported in three different hangouts is removed, and our team sees reports in an admin view.
There is also a per-device rate limit and a simple word filter, with optional AI moderation that falls back to the filter if the AI is down.
What we do not have yet: verified identities, a 24/7 moderation team, or a way to permanently ban a determined bad actor who changes device.
That is the main thing to fix before scaling beyond a hackathon.

**Is this safe for women going out alone?**
It is designed so you are never alone with one stranger and never at a private place, and you can leave or block at any time.
We would like to add women-only hangouts and trusted hosts next, and we want to test that with real users before claiming it works.

**How do you check age?**
An 18+ self-confirmation before joining.
That is a self-declaration, not verification, and we are honest that it is not enough for a large launch.

**Do you track location?**
No.
You pick a city, the app never asks for GPS, and we do not store location.
The only identifiers are a nickname and a device key.

## Legal and data

**GDPR?**
We collect very little: a nickname, an optional one-line bio, the hangouts you join, your messages, and anonymous usage events for the numbers on slide 2.
No email, no phone number, no location.
Hangouts expire at 06:00 local time the next morning.
There is an Impressum and a privacy page on the live site.
Everything runs on Cloudflare (Workers, D1, Durable Objects); AI calls go through Cloudflare AI Gateway and keys live only as Cloudflare secrets.
A proper data protection review, a retention policy for messages and a processor agreement with Cloudflare are open items.

**Where does the spot data come from? Is it legal?**
OpenStreetMap, exported once per city through the Overpass API, under the ODbL licence, with visible "© OpenStreetMap contributors" attribution.
We did not scrape Google Maps, Yelp, Luma or Resident Advisor.
Short spot descriptions are generated from the OSM facts only, there are no invented ratings.

**Are you allowed to link to Layla and Expedia brands?**
The hand-off is plain outbound links to a search for the city, counted with our own click redirect.
We do not have an affiliate or partnership agreement today; that would be the first conversation with Layla and Expedia.

**Who is liable if something happens at a hangout?**
Today the honest answer is: this is a hackathon prototype, and liability is not solved.
Before a real launch we need proper terms of service, legal advice on platform liability in Germany, and the moderation work above.

## Cold start

**A meetup app with no people is empty. How do you solve cold start?**
Three ways.
One: we start city by city, Berlin first, and seed real hangouts ourselves with partners who already have new-in-town people: hostels, Erasmus and ESN groups, university channels.
Two: every hangout needs people to fill, so the person who starts it has a reason to share the link; that is the growth loop, and shares per user on slide 2 measures it.
Three: even an empty city page is useful, because the spots page shows the best public places to meet.
Berlin is complete first; other cities follow once they have spots and a local partner.

**Is 3-8 people the right size?**
It is a guess we are testing.
The share of hangouts that reach three or more people ([REACHED3%]) tells us whether groups form at all, and how many filled every seat tells us whether eight is too big.

**What did the numbers actually measure?**
Every number on slide 2 comes from our own events table in the live app and from the ad dashboard, in the window shown on the slide.
Team and test devices are excluded.
"People joined" counts unique people who joined at least one hangout.
"Hangouts with 3+ people" is the share of started hangouts that reached at least three members; how many filled every seat is in the note under it.

**Did people actually meet in real life?**
We only know what the app logs, for example the "I'm here" button if people used it.
We do not claim more than that.

## Product and market

**How is this different from Luma, Meetup, Bumble BFF or Timeleft?**
Luma and Meetup are for events someone organises in advance.
Bumble BFF is one-on-one matching with profiles.
Timeleft matches strangers for dinners you book in advance.
Plus One is for tonight, for people who are alone in a city right now, in small groups at public spots, with no account.

**Why would someone come back?**
Travelers come back when they arrive in the next city, which is also when they need Layla and Expedia again.
Locals new in town come back on the next weekend.
We have not measured repeat use yet; week-over-week repeat joins is one of our next-30-day metrics.

**How do you make money?**
Ideas, not validated:
commission on stays booked through the Expedia hand-off;
Layla as the trip planner after the first night out;
venue partners that pay to be listed, always labeled as promoted;
hostels, student networks and universities as paying city partners.

**Why does Layla or Expedia care?**
New-in-town people are planning the rest of their stay right now.
The first night out is when someone decides whether they like a city; that is a good moment to help them plan, book a longer stay or the next trip.
Slide 2 shows how many people clicked through to Layla and Expedia brands during the launch window: [BRAND CLICKS].

## Build

**What did you build this weekend versus before?**
All product code was written during the event, starting Saturday 14:00.
The brand kit (name, logo, artwork) was also made during the event.

**What is the stack?**
React, Vite and TypeScript on the web client.
Cloudflare Workers for the API, D1 for data, Durable Objects for real-time group chat, KV, R2 and Queues where needed, all on the Cloudflare free tier.
No login in the MVP: a nickname and a device id.
AI through Cloudflare AI Gateway.

**Where is AI used?**
Spot descriptions and vibe tags generated once from OpenStreetMap facts, and optional moderation of messages that falls back to the word filter.
The app keeps working without AI.

**What would you do with more time?**
Moderation and trust first: trusted hosts, better reporting, verified age for larger launches.
Then more cities with local partners, and real attribution with Layla and Expedia.
