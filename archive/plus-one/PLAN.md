# Proposal: "Find my group" agent (on top of docs/plan.md, needs Batu's OK)

The product, stack, lanes and safety rules are in [docs/plan.md](docs/plan.md) and
[docs/team-prompts/](docs/team-prompts/). This adds one feature, owned by Malek after lane 3's core.

## What it does

Before joining, a person can chat for 60 seconds with their own agent: music, energy, language, budget for tonight,
who they want to meet. It turns that into a persona card and ranks the open hangouts in their city, with the reason
("3 others into techno, all English, budget bar"). If nothing fits, it suggests starting one at a matching spot.

## Why

- It is Layla's identity-first idea applied to tonight: the jury will see their own thesis.
- It makes the app AI-native beyond moderation.
- The persona card is a story people share, which brings users.

## How (fits the existing stack)

- Folder `apps/api/src/agent/`, migrations `0060-0069`, test `agent.test.ts`; nothing in other lanes' folders.
- `POST /api/agent/interview` `{answer?}` -> next question with tap options, or the persona (stored per device).
- `GET /api/agent/match?city=` -> `[{hangoutId, score, reason}]` from open hangouts and spot vibes.
- Model: Claude through Cloudflare AI Gateway, fails open to a plain vibe filter.
  The event's Bedrock key is reserved for moderation (lane 2); if it cannot be shared, the match runs on the
  vibe filter alone. No paid keys.
- Frontend: Batu decides whether it is a screen or a button on the city page.

## Timing

Only after lane 3 tasks A to D are in a PR. Target: staging with the rest at about 20:30.
