# Backend team prompts

Three paste-ready prompts for the backend teammates, one per lane.
Each teammate pastes their file into their own coding agent (Claude Code or Codex) inside a fresh clone of https://github.com/Tonight-Plus-one-Hack/wohin.
Each prompt is self-contained: product goal, scoring, rules, layout, API contract, data model, tasks, tests, PR path and time box.
The shared sections (1 to 10) are identical in all three files, so every agent sees the same contract.

| File | Teammate | Lane |
| --- | --- | --- |
| `Kalvarez09.md` | `Kalvarez09` | 1: backend skeleton (first 30 minutes), D1 data model, shared contract, device identity, hangouts and join API |
| `vinaynaik432-debug.md` | **built by Batu's AI agent** (not vinaynaik432-debug) | 2: real-time chat on Durable Objects, report, block, bans, rate limits, word filter, AI moderation, 18+, expiry |
| `Malek1414.md` | `Malek1414` | 3: cities and spots data and API, share and invite links with previews, partner hand-off `/go/:brand`, events and `/api/numbers` |

Batu (`BatuCani`) builds the frontend (`apps/web`, React + Vite), the brand and the logo, reviews and merges every PR, and owns the Cloudflare account and every production step.

Lane 2 is being built by an AI agent on Batu's side (branch `fm/lane2-chat-safety`); nobody else should build lane 2 to avoid duplicate work.

## Stack

The stack follows https://github.com/blakeandersonw/ai-app-playbook: one Cloudflare Worker with a plain `fetch` handler, D1 with plain SQL, SQLite-backed Durable Objects for live chat, Workers static assets for the frontend, zod for the shared contract, vitest with `@cloudflare/vitest-pool-workers` for tests, bun as the package manager.
Not used: Vercel, Supabase, Next.js, Firebase, Clerk, PostHog, Hono, any ORM.
Two deliberate deviations from the playbook, each recorded in `docs/decisions/` by the lane that owns it:

1. No Better Auth for the MVP (lane 1).
   The product is no-login (nickname plus device id).
   Better Auth anonymous sessions would also be no-login, but they add four auth tables, a session layer and a dependency on the critical path for no user-visible gain tonight.
   The Worker issues a random, httpOnly device-id cookie instead; after the hackathon the path is the Better Auth `anonymous` plugin with `device_id` mapped to `user.id`.
2. Analytics in a D1 `events` table instead of Tinybird (lane 3).
   `/api/numbers` must be live and honest tonight with zero extra accounts; moving to the playbook's `POST /events` to Queue to Tinybird pipeline is a later step.

AI: the event's AWS Bedrock key (only `us.anthropic.claude-sonnet-4-6`, expires Sunday 22 Nov 2026 at 18:27) is used only for moderation, through Cloudflare AI Gateway, and always fails open to the word filter (lane 2).

## Lane boundaries and folder ownership

| Owner | Paths |
| --- | --- |
| Lane 1 | root `package.json` (extend, never replace), `packages/shared/src/contract.ts`, `packages/shared/src/index.ts`, `apps/api/wrangler.jsonc`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/.dev.vars.example`, `apps/api/src/index.ts`, `apps/api/src/env.ts`, `apps/api/src/hooks.ts`, `apps/api/src/lib/`, `apps/api/src/hangouts/`, `apps/api/migrations/0001-0019`, `apps/api/test/core.test.ts`, `apps/api/test/hangouts.test.ts` |
| Lane 2 | `apps/api/src/chat/`, `apps/api/src/safety/`, `apps/api/migrations/0020-0039`, `packages/shared/src/chat-safety.ts`, `apps/api/test/chat*.test.ts`, `apps/api/test/safety*.test.ts` |
| Lane 3 | `apps/api/src/catalog/`, `apps/api/src/share/`, `apps/api/src/numbers/`, `apps/api/scripts/`, `apps/api/seed/`, `data/spots/`, `scripts/spots/`, `apps/api/migrations/0040-0059`, `packages/shared/src/catalog-share-numbers.ts`, `apps/api/test/catalog.test.ts`, `share*.test.ts`, `numbers.test.ts`, `seed.test.ts` |
| Batu | `apps/web/`, `brand/`, `launch/`, `submission/`, production deploys, production migrations and seeds, Cloudflare account and secrets |

Shared files (`src/index.ts`, `wrangler.jsonc`, `.dev.vars.example`, `packages/shared/src/index.ts`) carry commented, pre-placed `// [lane2]` and `// [lane3]` lines; each lane uncomments only its own lines, so PRs never conflict.
Lanes call each other only through `apps/api/src/hooks.ts` (`guard`, `screenText`, `broadcast` from lane 2; `track` from lane 3), which has no-op defaults so every lane runs alone.
Migration numbers are pre-allocated per lane (0001-0019, 0020-0039, 0040-0059).

## Merge order

1. Lane 1 skeleton PR (`[lane 1] Backend skeleton: ...`), opened within about 30 minutes of starting.
   Batu merges it right away; it contains only scaffolding, the contract and `0001_core.sql`.
2. Lanes 2 and 3 have been working in their own folders since minute zero; they now rebase onto `main` and keep going.
3. Lane 1 hangouts PR (create, join, city tonight, hangout detail, `/api/me`).
4. Lane 3 PR (catalog, seed, share, `/go`, events, numbers): merge it before or together with lane 1's hangouts PR if the frontend needs real cities first; neither depends on the other at runtime.
5. Lane 2 PR (chat, safety, AI moderation).
6. Integration, Saturday 19:30 to 20:30: Batu swaps the frontend mock module for `fetch` calls against the contract, deploys staging, and the team smoke-tests on real phones.
7. Production after Batu's approval, target Saturday about 21:00.

Target times: skeleton merged by about 17:30, all three lane PRs open by 19:00, staging live by 20:30, production by 21:00, feature freeze Sunday 13:30, submission Sunday 15:30 (team target 15:15).

## Batu's human steps (only Batu can do these)

1. Merge the skeleton PR as soon as it is green.
2. Cloudflare (account owner, Free plan only):
   `npx wrangler d1 create wohin-db-staging` and later `npx wrangler d1 create wohin-db`, and send lane 1 the `database_id` values (not secrets).
3. Create the AI Gateway in the dashboard (AI, AI Gateway, Create gateway, name `wohin`) and send lane 2 the account id and gateway id.
4. Tell lane 2 which kind of Bedrock key the event provides (bearer API key or access key pair) and its region, then set the secrets yourself:
   `npx wrangler secret put AWS_BEARER_TOKEN_BEDROCK --env staging` (or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`), and `npx wrangler secret put ADMIN_TOKEN --env staging` (`openssl rand -base64 32`, shared with the team privately).
5. Decide whether teammates get Cloudflare account access for staging deploys; without it, Batu runs `bun run deploy:staging`.
6. Point the Vite dev server's proxy for `/api` and `/go` at `http://localhost:8787`, and keep the frontend's typed mock module aligned with `packages/shared/src/contract.ts` (lane 1 sends the list of differences).
7. Production: migrations (`bunx wrangler d1 migrations apply DB --env production --remote`), seed (`bunx wrangler d1 execute DB --env production --remote --file apps/api/seed/spots.sql`), secrets and `wrangler deploy --env production`, only after the staging smoke test passes.

## What we lose by dropping the Next.js + Supabase foundation

PR https://github.com/Tonight-Plus-one-Hack/wohin/pull/4 and the WIP handoff PRs https://github.com/Tonight-Plus-one-Hack/wohin/pull/6, https://github.com/Tonight-Plus-one-Hack/wohin/pull/7 and https://github.com/Tonight-Plus-one-Hack/wohin/pull/8 were built on Next.js and Supabase Postgres between 14:17 and 16:04 on Saturday.

Transfers almost 1:1 (copy, drop `server-only` and `process.env`, keep the tests as specs):

- The API contract and zod schemas (`lib/contract.ts`), including the T3 and T4 additions.
- "Tonight" time logic (`lib/hangouts/time.ts`, pure `Intl`).
- The multilingual word filter (`lib/moderation/word-filter.ts`), the moderation prompt and verdict parsing (`lib/moderation/ai.ts`), and the dependency-free SigV4 signer (`lib/moderation/sigv4.ts`, works with `nodejs_compat`).
- Partner URL builders and UTM parsing (`lib/partners/urls.ts`, `lib/partners/attribution.ts`).
- All business rules and thresholds: group size 3 to 8, max 3 open hosted groups per device, idempotent join, message hidden at 2 reports, hangout at 3, person banned at 3 reporters across hangouts, the per-device rate limits, expiry at 06:00 local, members-only chat, about lines visible to members only.
- The OpenStreetMap spot snapshots and exporter (PR https://github.com/Tonight-Plus-one-Hack/wohin/pull/3, framework-free), and the launch and submission drafts (PRs https://github.com/Tonight-Plus-one-Hack/wohin/pull/1 and https://github.com/Tonight-Plus-one-Hack/wohin/pull/2), which do not depend on the stack at all.
- The test case lists (48 cases across T2, T3 and T4) as ready-made specs.

Must be rewritten:

- All SQL: about 1,460 lines of Postgres across `0001_init.sql` (247), `0002_hangout_functions.sql` (363), `0003_chat_safety.sql` (675) and `0004_launch_numbers.sql` (177).
  PL/pgSQL functions, enums, arrays, `jsonb` and `timestamptz` become SQLite tables with `CHECK` constraints plus TypeScript service functions; the capacity and ban triggers port to SQLite `RAISE(ABORT, ...)` triggers almost directly.
- Row level security disappears: D1 has no anon role, so access rules become Worker code (only the Worker can reach the database, which is simpler and as safe).
- Chat transport: the planned Supabase Realtime or polling becomes a Durable Object with WebSockets, which is new code but the better fit.
- Next.js route handlers, `proxy.ts` and the device cookie become one Worker router and a small cookie helper.
- The whole UI (pages, components, i18n wiring, OG images via Next) is replaced by Batu's React + Vite prototype; link previews move to `HTMLRewriter` in the Worker.
- Test harness: PGlite migration tests become `@cloudflare/vitest-pool-workers` tests on local D1 and Durable Objects.

Time cost, honestly estimated: PR #4 plus the three WIP branches were about 110 minutes of parallel agent work, and none of the WIP branches was finished.
Reaching the same point on the new stack should take about 2 to 3 hours of wall-clock time with three lanes in parallel, because the logic, rules and test cases are already decided and only the persistence and transport layers are new.
Net, the switch costs roughly 1.5 to 2 hours of the build window, which keeps the Saturday 21:00 live target tight but reachable.
What we gain: one deploy for API and frontend, same-origin cookies, free tier with no second vendor, and a stack the playbook supports end to end.
