# Demo script

Two versions: 2 minutes for the semifinal, 4 minutes for the final.
Both are in English.
The live demo is the room itself starting a hangout for tonight.

Every number on stage comes from `{APP_URL}/numbers` at the moment we present.
Fill the `{...}` placeholders right before going on stage and say them exactly as measured.
If a number is small, say it anyway; real and small beats big and invented.

## Before going on stage (checklist)

- Laptop on the projector, browser at full screen, zoom at 125 %.
- Tab 1: `{APP_URL}/berlin` (city page).
- Tab 2: the demo hangout, already created by us, at a public spot near the venue, for tonight, max 8, "Bar" vibe.
  Title: "After the final: drinks with the hackathon".
- Tab 3: `{APP_URL}/numbers`.
- Full-screen QR slide for the demo hangout in the brand look: off-white canvas `#fcfcfd`, ink `#1c2024`, headline in Source Serif 4, the primary logo from `brand/assets/logo-primary.svg` in a corner.
  Generate the QR with:
  `node launch/make-qr.mjs "{HANGOUT_URL}" --source team --medium event --campaign final-demo --ecc Q --out /tmp/demo-qr`
- Phone (presenter 2) already joined, so the group starts at 2 and the room sees it move.
- Backup: a 30 second screen recording of a group filling up, in case the venue Wi-Fi fails.
- Ask the organisers once that inviting the room is okay.

## Semifinal: 2 minutes

**0:00 to 0:20, the problem**

"Hands up if you've ever been in a new city on a Friday night, on your own, and ended up staying in."
(Pause.)
"Going out alone is hard.
Going out with five people you met an hour ago is easy, if someone organises it.
That's Plus One."

**0:20 to 0:50, the product (Tab 1, then Tab 2)**

"You pick a city, like on Luma.
You see who's going out tonight: small groups of 3 to 8, at public bars and clubs from a curated list.
You join with a nickname in 20 seconds, no account.
Or you start your own, and share the link until it's full."

**0:50 to 1:25, live demo (QR on screen)**

"So let's do it.
This is a real group for tonight, after the final, at {SPOT}.
Scan this, pick a nickname, and you're in."
(Switch to Tab 2 and let the member count climb on screen.)
"{JOINED_LIVE} of you just joined.
That's a real plan for tonight."

**1:25 to 1:45, traction (Tab 3)**

"We went live on Saturday at {LIVE_TIME}.
Since then: {USERS} people joined a group, {HANGOUTS} groups were started across {CITIES} cities, and {MET_UP} people tapped 'I'm here' at a real spot."

**1:45 to 2:00, why Layla and Expedia**

"The people who need this most are travelers.
Every city page has 'New here? Plan your stay', straight into Hotels.com, Vrbo and Expedia, and 'Continue with Layla' for the rest of the trip.
Plus One: there's room for one more tonight."

## Final: 4 minutes

**0:00 to 0:30, the problem, made personal**

"Hands up if you've been in a new city on your own, wanted to go out, and stayed in."
(Pause, look at the hands.)
"Event apps tell you where to go.
They don't give you people to go with.
Going out alone is hard; going out with a small group is easy, if someone gets it started."

**0:30 to 1:15, the product (Tab 1, Tab 2)**

"Plus One works like Luma for nights out.
Pick a city.
See tonight's open groups: time, spot, vibe, how many places are left, which language.
Every group meets at a public spot from a curated list built on OpenStreetMap data.
Join in three quick screens: a nickname, your mood, and an 18+ check.
Inside the group there's a simple chat and an 'I'm here' button for when you arrive."

**1:15 to 2:15, live demo (QR on screen)**

"Let's make a plan for tonight, right now.
This group is for after this final, at {SPOT}, a few minutes from here.
Scan the code and join."
(Switch to Tab 2.
Read the count out loud as it climbs.)
"It started at 2.
It's at {JOINED_LIVE}.
That's how every group fills up: whoever starts it shares the link."
(If the group fills, say "Full.
Someone start the next one."
Then show the 'Start a group' button.)

**2:15 to 2:50, safety (Tab 2, scroll to the safety box)**

"We designed for safety from the first hour.
Groups only, at least 3 places, never 1:1.
Public spots only, no private addresses, no location tracking: you pick the city, we never locate you.
Report and block on every group and every message.
A message is hidden after 2 reports, a group after 3, and a person is removed after 3 reports across groups; the team reviews every report.
Groups expire at 6 in the morning."

**2:50 to 3:30, traction (Tab 3)**

"We went live on Saturday at {LIVE_TIME}.
Since then: {USERS} people joined a group, {HANGOUTS} groups were started across {CITIES} cities, {PCT_3PLUS} % of groups reached 3 or more people, and {MET_UP} people checked in at a real spot.
Most of them came from {TOP_SOURCE}.
{ONE_REAL_STORY}"
(Only tell a story that happened, with the people's okay; otherwise skip the line.)

**3:30 to 4:00, Layla, Expedia, and what's next**

"Our core users are travelers: Erasmus students, expats, backpackers, people on business trips.
Every city page links to Hotels.com, Vrbo and Expedia for the stay, and to Layla to plan the rest of the trip.
Next: more cities, each with its own curated spot list and its first hosts.
Tonight, {JOINED_LIVE} of you aren't going out alone.
Thank you."

## Likely questions (short answers)

- **"Isn't this a dating app?"**
  No.
  Groups of at least 3, public places, no 1:1 and no browsable profiles.
- **"How do you stop bad actors?"**
  Report and block everywhere, automatic hiding at 2 reports per message and 3 per group, removal after 3 reports across groups, a word filter, rate limits per device, and team review.
- **"How do you get to the next city?"**
  The city infrastructure is already there; each city needs a curated spot list and a first group of hosts, which is what ESN sections and hostels give us.
- **"How do you make money?"**
  Booking hand-offs to Expedia brands for travelers, and later venue partnerships for groups.
  We haven't tested either yet, and we'll say so if asked.
- **"Were those users real?"**
  Yes, and the numbers page shows how we count them: a joined user is a unique device that joined or started a group, with team and test devices excluded.
- **"How is it built?"**
  React, Vite and TypeScript on the client; Cloudflare Workers, D1 and Durable Objects for the real-time group chat on the backend, all on Cloudflare's free tier.
  Spots come from OpenStreetMap, credited in the app.
