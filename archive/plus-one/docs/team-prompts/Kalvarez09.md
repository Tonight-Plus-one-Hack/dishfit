# Lane 1 (Kalvarez09): backend skeleton, D1 data model, hangouts and join API

You are the coding agent for GitHub user `Kalvarez09` on the hackathon team.
Paste-ready brief: read all of it before you start, then work through section 12 in order.
Your lane is the foundation the other two backend lanes build on, so the first 30 minutes matter most: ship the skeleton PR fast and small, then build the hangouts API.
Work autonomously; ask your human only for things this brief marks as a human step.

## 1. Product and why it matters

The app (working brand name "Plus One", code and repo name `wohin`) is a Luma-like city app for people who are alone tonight.
A person picks a city, sees open groups ("hangouts", 3 to 8 people) at curated public spots tonight, and joins one or starts one in about 20 seconds.
There is no login: a person is a nickname plus an anonymous device id.
Travellers are a core audience, so the app hands off to Expedia, Hotels.com, Vrbo and Layla for stays and trip planning.

We build it at the Layla x Expedia "5K Build & Launch" hackathon in Berlin.
Build window: Saturday 21 Nov 2026 from 14:00 to the submission on Sunday 22 Nov 2026 at 15:30 (team target 15:15).
Feature freeze is Sunday 13:30.
The submission is a live link, 3 slides and real user numbers.
We expect real users to weigh most: unique visitors, people who joined a group, groups that reached 3 people, messages sent, shares and partner clicks, read live from our public `/numbers` endpoint.
Every backend decision should serve one thing: strangers can find, join and fill a group tonight, safely, and we can prove it with honest numbers.
The MVP must be live on staging by Saturday about 20:30 and in production (after Batu's approval) by about 21:00, so real people can use it tonight.

## 2. Team and lanes

Batu (GitHub `BatuCani`) builds the frontend, the brand and the logo, and is the merge and deploy authority.
Three backend lanes run in parallel, one person and one coding agent each:

| Lane | Owner | Scope |
| --- | --- | --- |
| 1 | `Kalvarez09` | Backend skeleton (first 30 minutes), D1 data model and migrations, shared contract package, device identity, hangouts and join API |
| 2 | `vinaynaik432-debug` | Real-time group chat (Durable Objects, WebSockets), safety: report, block, bans, rate limits, word filter, AI moderation, 18+ enforcement, expiry |
| 3 | `Malek1414` | Cities and spots data (seed from OpenStreetMap snapshots) and its read API, share and invite links with link previews, partner hand-off links, analytics events and the `/numbers` endpoint |

The full team overview lives in `docs/team-prompts/README.md`.

## 3. Hard rules (read before writing any code)

1. Code only from the event start.
   Every line of product code must be written during the event window (from Saturday 21 Nov 2026, 14:00).
   Do not paste in code you or anyone wrote before the event or for another project.
   Porting from this repo's own branches (`fm/t0-foundation`, `fm/t1-spots`, `fm/t2-hangouts`, `fm/t3-chat-safety`, `fm/t4-share-numbers`) is allowed because all of it was written today inside the window.
2. Stack: the one in https://github.com/blakeandersonw/ai-app-playbook (read its `AGENTS.md`, `playbook/02-backend-cloudflare.md`, `playbook/03-database.md`, `playbook/13-security-privacy-compliance.md` and `templates/worker.ts`, `templates/wrangler.jsonc`).
   That means one Cloudflare Worker with a plain `fetch` handler, D1 with plain SQL via `prepare().bind()`, Durable Objects (SQLite-backed) for real-time chat, KV only for flags, Cron Triggers if needed.
   Never use Vercel, Netlify, Supabase, Firebase, Next.js, Hono, Express, Drizzle, Prisma or any ORM, Clerk, Auth0, PostHog or Sentry.
   The only runtime dependency is `zod` (shared contract); dev dependencies are `wrangler`, `typescript`, `vitest`, `@cloudflare/vitest-pool-workers`.
   Ask in the team chat before adding anything else.
3. Secrets never go into git.
   Local secrets live only in `apps/api/.dev.vars` (gitignored; copy from `apps/api/.dev.vars.example`, which holds names only).
   Deployed secrets are Cloudflare Worker secrets, set with `npx wrangler secret put NAME --env staging` (and `--env production` only by Batu).
   Never paste a key into a prompt, a PR, an issue, a log line, a test fixture or the chat.
   If a key leaks, tell Batu immediately so it can be rotated.
4. Deploys: you run everything locally (`wrangler dev` with local D1 and Durable Objects).
   Deploy only to the `staging` environment, and only if Batu gave you access to the Cloudflare account; otherwise Batu deploys.
   Never deploy to production, never apply migrations to the production database and never touch production data; that is Batu's call.
   Stay on the Cloudflare Free plan: never upgrade the plan, never add a payment method, never create R2 buckets, Queues, paid add-ons, custom domains or anything that can bill.
   D1, KV, Durable Objects (SQLite-backed), Cron Triggers, AI Gateway and `workers.dev` subdomains are fine.
5. Stay in your lane.
   Edit only the paths your lane owns (section 5).
   Do not touch `apps/web/` (Batu's frontend prototype, React + Vite), `brand/`, `launch/`, `submission/` or another lane's folders.
   If you need something in another lane's files, ask that lane's owner in the team chat; do not edit it yourself.
6. Privacy and safety are product features, not extras.
   A device id is a secret: it never appears in a response body, a URL, a WebSocket frame, a log line or an analytics property sent anywhere outside D1.
   Public shapes never contain a device id.
   Groups only (3 to 8 people), never 1:1; curated public spots only, never free-text places or private addresses; no location tracking (the city is chosen); 18+ confirmation on join.
7. Done means: `bun run check` and `bun run test` pass, you exercised your endpoints with `curl` against `wrangler dev`, and the PR says exactly how you verified.

## 4. Starting point

Repository: https://github.com/Tonight-Plus-one-Hack/wohin
Start from `origin/main`.
Do not build on PR https://github.com/Tonight-Plus-one-Hack/wohin/pull/4 (Next.js + Supabase): the team switched stacks and that PR will not be merged.
Its logic is the reference you port from (exact files listed in your lane tasks); read them with `git show origin/<branch>:<path>`, never merge those branches.

```sh
git clone https://github.com/Tonight-Plus-one-Hack/wohin.git
cd wohin
git fetch origin
git switch -c <your-branch> origin/main
# Bun is the playbook's package manager and script runner:
curl -fsSL https://bun.sh/install | bash   # skip if `bun --version` works
```

Lane 1 creates the skeleton (section 5) within about 30 minutes and opens it as a small PR that Batu merges right away.
Lanes 2 and 3 start immediately on self-contained modules in their own folders (pure TypeScript plus their own migration file and their own tests), then rebase onto `origin/main` as soon as the skeleton is merged and wire their routes in.

## 5. Repository layout and ownership

```
apps/
  api/                              Cloudflare Worker (backend)
    wrangler.jsonc                  lane 1 (lanes 2 and 3 edit only their pre-placed lines)
    package.json, tsconfig.json     lane 1
    vitest.config.ts                lane 1
    .dev.vars.example               lane 1 (lanes add secret NAMES on their pre-placed lines)
    migrations/
      0001_core.sql ... 0019_*.sql  lane 1 (cities, spots, hangouts, members)
      0020_safety.sql ... 0039_*    lane 2 (reports, blocks, device_bans)
      0040_events.sql ... 0059_*    lane 3 (events, numbers exclusions)
    seed/                           lane 3 (generated spots seed SQL)
    scripts/                        lane 3 (seed generator)
    src/
      index.ts                      lane 1 (router; lanes 2 and 3 uncomment only their pre-placed lines)
      env.ts, hooks.ts              lane 1
      lib/                          lane 1 (http helpers, device cookie, time, ids)
      hangouts/                     lane 1
      chat/                         lane 2 (ChatRoom Durable Object, message routes)
      safety/                       lane 2 (word filter, moderation, reports, blocks, bans, rate limits)
      catalog/                      lane 3 (cities and spots read API)
      share/                        lane 3 (/go/:brand, share links, link-preview meta tags)
      numbers/                      lane 3 (events, /api/numbers)
    test/
      hangouts.test.ts, core.test.ts   lane 1
      chat.test.ts, safety.test.ts     lane 2
      catalog.test.ts, share.test.ts, numbers.test.ts   lane 3
  web/                              Batu (frontend prototype). DO NOT TOUCH.
packages/
  shared/src/contract.ts            lane 1 (the API contract, zod schemas and types)
  shared/src/index.ts               lane 1 (pre-placed re-export lines for lanes 2 and 3)
  shared/src/chat-safety.ts         lane 2 (only new shapes lane 2 needs beyond contract.ts)
  shared/src/catalog-share-numbers.ts   lane 3 (only new shapes lane 3 needs beyond contract.ts)
data/spots/                         lane 3 (copied from branch fm/t1-spots)
docs/decisions/                     anyone (one file per decision, name prefixed with your lane)
docs/team-prompts/                  read only
package.json (root, bun workspaces) lane 1; if Batu's frontend PR already created it, extend it, never replace it
```

Migration numbers are pre-allocated per lane (lane 1: 0001-0019, lane 2: 0020-0039, lane 3: 0040-0059) so nobody collides.
Never edit a migration that is already merged; add a new numbered file instead.
Migrations may reference tables from another lane's lower-numbered migration (SQLite checks foreign keys at write time, not at create time).

### Cross-lane wiring without merge conflicts

`apps/api/src/index.ts` (lane 1) routes requests through a list of route tables and has commented, pre-placed lines for lanes 2 and 3:

```ts
import { hangoutRoutes } from "./hangouts/routes";
// [lane2] import { chatRoutes, safetyRoutes, installSafetyHooks, ChatRoom } from "./safety/register";
// [lane3] import { catalogRoutes, shareRoutes, numbersRoutes, installNumbersHooks, handleDocument } from "./numbers/register";
// [lane2] export { ChatRoom };
// [lane2] installSafetyHooks(hooks);
// [lane3] installNumbersHooks(hooks);

const routes: Route[] = [
  ...coreRoutes,        // GET /api/health, GET /api/me
  ...hangoutRoutes,
  // [lane2] ...chatRoutes, ...safetyRoutes,
  // [lane3] ...catalogRoutes, ...shareRoutes, ...numbersRoutes,
];

// In fetch(), after no route matched and before serving the frontend:
// [lane3] const doc = await handleDocument(request, env, ctx); if (doc) return doc;
return env.ASSETS.fetch(request);
```

Each lane uncomments only its own lines, so the three PRs never conflict.
Lane 2 exports its entry points from `src/safety/register.ts`; lane 3 exports its entry points from `src/numbers/register.ts` (that file may re-export from `src/catalog/` and `src/share/`).
`wrangler.jsonc` and `.dev.vars.example` follow the same pattern with `// [lane2]` and `// [lane3]` comment lines.

`apps/api/src/hooks.ts` (lane 1) is how lanes call each other without importing each other's folders:

```ts
export type GuardedAction = "hangout_create" | "hangout_join" | "message" | "report" | "block";
export type Hooks = {
  /** Lane 2: ban check and rate limit. Returns an error to send, or null to go on. */
  guard(env: Env, deviceId: string, action: GuardedAction): Promise<{ code: ApiErrorCode; status: number } | null>;
  /** Lane 2: word filter plus AI check on nicknames, about lines and messages. false means reject with 422 content_rejected. */
  screenText(env: Env, text: string): Promise<boolean>;
  /** Lane 2: push a live frame to everyone connected to a hangout's chat (for example a new member). Never throws. */
  broadcast(env: Env, ctx: ExecutionContext, hangoutId: string, frame: LiveFrame): void;
  /** Lane 3: record an analytics event. Never throws, never blocks the response (use ctx.waitUntil). */
  track(env: Env, ctx: ExecutionContext, event: TrackedEvent): void;
};
export const hooks: Hooks = {
  guard: async () => null,
  screenText: async () => true,
  broadcast: () => {},
  track: () => {},
};
```

The defaults are no-ops so lane 1 works alone; lanes 2 and 3 replace them in their `install*Hooks(hooks)` functions.
`TrackedEvent` is `{ name: EventName; deviceId: string | null; citySlug?: string; hangoutId?: string; props?: EventProps; request?: Request }`.

## 6. Architecture decisions (already made; follow them)

- One Worker serves both the API and Batu's built frontend (Workers static assets, `assets.directory = "../web/dist"`, `not_found_handling: "single-page-application"`, `run_worker_first` for `/api/*` and `/go/*`, extended by lane 3 for link previews).
  Same origin means the device cookie just works, there is no CORS, and `workers.dev` third-party-cookie problems never appear.
  In local dev Batu's Vite server proxies `/api` and `/go` to `http://localhost:8787`.
- Identity: no Better Auth for the MVP.
  The product is no-login (nickname plus device), and the playbook's Better Auth anonymous sessions would add four auth tables, a session layer and a dependency on the critical path for no user-visible gain tonight.
  Instead the Worker issues a random device id (`crypto.randomUUID()`) in the cookie `wohin_device` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`) on the first `/api` request that lacks a valid one, and uses it for that same request.
  It is unguessable and server-issued, so it works like a bearer session id without custom crypto.
  Lane 1 records this in `docs/decisions/0001-lane1-device-id-instead-of-better-auth.md`, including the post-hackathon path (Better Auth `anonymous` plugin, map `device_id` to `user.id`).
- Timestamps: D1 columns store epoch milliseconds (UTC) as `INTEGER`; the API speaks ISO 8601 strings (`new Date(ms).toISOString()`).
- Ids: `crypto.randomUUID()` for hangouts, members, messages, reports; spot ids are stable OSM ids like `osm-node-966975630`.
- Errors: every non-2xx JSON response is `{ "error": { "code": ApiErrorCode, "message": string } }`.
  Status mapping: `bad_request` 400, `no_device` 401, `forbidden` 403, `not_found` 404, `hangout_full` 409, `hangout_closed` 409, `already_member` 409, `content_rejected` 422, `rate_limited` 429, `not_implemented` 501, `internal` 500.
- Validation: parse every request body and query with the zod schema from `packages/shared` before touching D1; parse every response with its schema in tests.
- "Tonight": a night runs until the next 06:00 local time in the city's IANA timezone; hangouts start inside the current night and expire at its end (port `lib/hangouts/time.ts` from branch `fm/t2-hangouts`).
- Analytics stay in D1 for the hackathon (an `events` table read by `/api/numbers`), not Tinybird: the numbers must be live tonight with zero extra accounts.
  This deviation from the playbook is recorded by lane 3 in `docs/decisions/`.
- AI: the event provides an AWS Bedrock key that works only with model `us.anthropic.claude-sonnet-4-6` and expires Sunday 22 Nov 2026 at 18:27.
  It is used only for chat and profile moderation (lane 2), through Cloudflare AI Gateway, and every AI call fails open to the word filter.

## 7. The API contract

The single source of truth is `packages/shared/src/contract.ts`.
Lane 1 creates it in the skeleton by porting `lib/contract.ts` from branch `fm/t0-foundation` (read it: `git show origin/fm/t0-foundation:lib/contract.ts`) and applying the deltas below.
After the skeleton is merged, only lane 1 edits `contract.ts`; lanes 2 and 3 put any new shape in their own file under `packages/shared/src/` and uncomment their re-export line in `packages/shared/src/index.ts`.
Adding an optional field is fine; renaming or removing a field needs Batu's OK because the frontend mock module mirrors these shapes.

Deltas on top of the `fm/t0-foundation` contract (lane 1 applies all of them in the skeleton):

- Keep `SpotSchema.neighborhood` (the WIP branches dropped it by accident; the frontend's spot cards need it).
- Add `MESSAGE_KINDS = ["text", "arrived"]`, `MessageKindSchema`, `MessageSchema.kind` (required in responses), and `PostMessageRequestSchema = union([{ kind: "arrived" }, { kind?: "text", body }])` (from branch `fm/t3-chat-safety`).
- Add `MEMBER_REMOVE_REPORT_THRESHOLD = 3` (from `fm/t3-chat-safety`).
- Add `"handoff_click"` to `EVENT_NAMES`, `hangout` to `GoQuerySchema`, `ShareEventSchema`, the optional `NumbersSchema` fields, `NumbersSubmissionSchema`, `byUtmSource` and `submission` (from `fm/t4-share-numbers`; `git show origin/fm/t4-share-numbers:lib/contract.ts`).
- Add `HangoutSummarySchema.memberPreview`: optional array of at most 5 `{ nickname }` (avatar stack "N going" on the city page).
- Add `CitySchema.lat` and `CitySchema.lng` (nullable numbers; map centring).
- Add `LiveFrameSchema` (WebSocket frames, section 7.2), `MeResponseSchema`, `ListSpotsResponseSchema = { city, spots }`, `SpotResponseSchema = { spot }`, `ShareLinksResponseSchema = { url, text, whatsappUrl }`, `ClientEventRequestSchema = { name, props? }`.
- Do not add new error codes: use `forbidden` (403) for "not a member" and for banned devices, so the error enum stays stable.

### 7.1 Routes

| Method and path | Owner | Request | Success response |
| --- | --- | --- | --- |
| `GET /api/health` | 1 | - | `{ ok: true }` |
| `GET /api/me` | 1 | - | `MeResponse = { memberships: { hangoutId, memberId, role }[] }` for open, unexpired hangouts of this device |
| `GET /api/cities` | 3 | - | `ListCitiesResponse = { cities: CityListItem[] }` (with `openHangouts`, `peopleTonight`) |
| `GET /api/cities/:slug` | 1 | - | `CityTonightResponse = { city, hangouts: HangoutSummary[], peopleTonight }`, hangouts sorted by `startsAt` |
| `GET /api/cities/:slug/spots` | 3 | `?vibe=&kind=` optional filters | `ListSpotsResponse = { city, spots: Spot[] }` (curated, active) |
| `GET /api/spots/:id` | 3 | - | `SpotResponse = { spot }` |
| `POST /api/hangouts` | 1 | `CreateHangoutRequest` | 201 `CreateHangoutResponse = { hangout, member }` |
| `GET /api/hangouts/:id` | 1 | - | `HangoutDetail = { hangout, spot, members, viewerMemberId }` (`about` lines only visible to members) |
| `POST /api/hangouts/:id/join` | 1 | `JoinHangoutRequest = { nickname, about?, ageConfirmed: true }` | 201 new member, 200 if this device already is a member: `JoinHangoutResponse = { hangout, member }` |
| `GET /api/hangouts/:id/messages` | 2 | `?after=<ISO timestamp>` | `ListMessagesResponse = { messages }`, oldest first, members only |
| `POST /api/hangouts/:id/messages` | 2 | `PostMessageRequest` (text or `{ kind: "arrived" }`) | 201 `PostMessageResponse = { message }`, members only |
| `GET /api/hangouts/:id/live` | 2 | WebSocket upgrade, members only | server frames per section 7.2 |
| `POST /api/report` | 2 | `ReportRequest` | `{ ok: true }` |
| `POST /api/block` | 2 | `BlockRequest = { memberId }` | `{ ok: true }` |
| `GET /api/admin/reports`, `POST /api/admin/moderate` | 2 | `Authorization: Bearer <ADMIN_TOKEN>` | team moderation (stretch) |
| `GET /api/share/hangout/:id`, `GET /api/share/city/:slug` | 3 | - | `ShareLinksResponse = { url, text, whatsappUrl }` |
| `POST /api/events` | 3 | `ClientEventRequest` (client-allowed names only) | 202 `{ ok: true }` |
| `GET /go/:brand` | 3 | `?city=&hangout=&from=` | 302 to Expedia, Hotels.com, Vrbo or Layla |
| `GET /api/numbers` | 3 | - | `NumbersResponse` (public, aggregate only) |
| `POST /api/numbers/exclude-me` | 3 | `Authorization: Bearer <ADMIN_TOKEN>` | `{ ok: true }` (team devices leave the numbers) |

Frontend page paths assumed for links and previews: `/`, `/c/:slug`, `/c/:slug/spots`, `/h/:id`, `/new`, `/numbers`.
Lane 3 checks them against Batu's router in `apps/web` once it is on `main` and tells Batu about any mismatch.

### 7.2 Live chat frames (`GET /api/hangouts/:id/live`)

Server to client, JSON text frames, validated by `LiveFrameSchema` (a discriminated union on `type`):

- `{ "type": "hello", "messages": Message[] }` right after connect (latest 50, filtered for this viewer).
- `{ "type": "message", "message": Message }` for each new text or arrived message.
- `{ "type": "hidden", "messageId": string }` when a message is hidden by reports or moderation.
- `{ "type": "member_joined", "member": Member }` when someone joins (sent by lane 1 through `hooks.broadcast`).
- `{ "type": "closed" }` when the hangout expired or was hidden; the server then closes the socket.

Client to server: only `{ "type": "ping" }` (answered with `{ "type": "pong" }`, outside the schema).
Posting always goes through `POST /api/hangouts/:id/messages`, so validation, rate limits and moderation live in one place.

## 8. Data model (lane 1 creates `apps/api/migrations/0001_core.sql` exactly like this)

```sql
CREATE TABLE cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  name_en TEXT CHECK (name_en IS NULL OR length(name_en) BETWEEN 1 AND 80),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  timezone TEXT NOT NULL,
  lat REAL,
  lng REAL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE spots (
  id TEXT PRIMARY KEY,                       -- 'osm-node-966975630'
  city_slug TEXT NOT NULL REFERENCES cities (slug) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  kind TEXT NOT NULL CHECK (kind IN ('bar', 'pub', 'nightclub', 'biergarten', 'cafe', 'venue')),
  vibes TEXT NOT NULL DEFAULT '[]',          -- JSON array of 'bar' | 'club' | 'chill' | 'culture'
  description_de TEXT CHECK (description_de IS NULL OR length(description_de) <= 400),
  description_en TEXT CHECK (description_en IS NULL OR length(description_en) <= 400),
  address TEXT CHECK (address IS NULL OR length(address) <= 200),
  neighborhood TEXT CHECK (neighborhood IS NULL OR length(neighborhood) BETWEEN 1 AND 80),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  opening_hours TEXT CHECK (opening_hours IS NULL OR length(opening_hours) <= 200),
  website TEXT CHECK (website IS NULL OR length(website) <= 300),
  source TEXT NOT NULL DEFAULT 'osm',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX spots_city_idx ON spots (city_slug, is_active);

CREATE TABLE hangouts (
  id TEXT PRIMARY KEY,
  city_slug TEXT NOT NULL REFERENCES cities (slug) ON DELETE CASCADE,
  spot_id TEXT NOT NULL REFERENCES spots (id) ON DELETE RESTRICT,
  starts_at INTEGER NOT NULL,
  vibe TEXT NOT NULL CHECK (vibe IN ('bar', 'club', 'chill', 'culture')),
  max_size INTEGER NOT NULL CHECK (max_size BETWEEN 3 AND 8),
  language TEXT NOT NULL CHECK (language IN ('de', 'en', 'es', 'fr', 'it', 'tr', 'any')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled', 'hidden')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (expires_at > starts_at)
);
CREATE INDEX hangouts_city_open_idx ON hangouts (city_slug, status, expires_at, starts_at);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  hangout_id TEXT NOT NULL REFERENCES hangouts (id) ON DELETE CASCADE,
  device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 16 AND 64),
  nickname TEXT NOT NULL CHECK (length(trim(nickname)) BETWEEN 1 AND 24),
  about TEXT CHECK (about IS NULL OR length(about) <= 140),
  age_confirmed INTEGER NOT NULL CHECK (age_confirmed = 1),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'member')),
  arrived_at INTEGER,
  joined_at INTEGER NOT NULL,
  UNIQUE (hangout_id, device_id)
);
CREATE INDEX members_hangout_idx ON members (hangout_id);
CREATE INDEX members_device_idx ON members (device_id);

-- Integrity guard ported from 0001_init.sql (enforce_hangout_capacity).
-- D1 runs writes one at a time per database, so this check cannot race.
-- NEW.joined_at is the request time, which keeps the trigger deterministic in tests.
CREATE TRIGGER members_enforce_capacity BEFORE INSERT ON members
BEGIN
  SELECT RAISE(ABORT, 'hangout_not_found')
   WHERE NOT EXISTS (SELECT 1 FROM hangouts WHERE id = NEW.hangout_id);
  SELECT RAISE(ABORT, 'hangout_closed')
   WHERE EXISTS (SELECT 1 FROM hangouts
                  WHERE id = NEW.hangout_id AND (status <> 'open' OR expires_at <= NEW.joined_at));
  SELECT RAISE(ABORT, 'hangout_full')
   WHERE (SELECT count(*) FROM members WHERE hangout_id = NEW.hangout_id)
      >= (SELECT max_size FROM hangouts WHERE id = NEW.hangout_id);
END;
```

D1 surfaces a `RAISE(ABORT, 'x')` as an error whose message contains `x`; map it with `message.includes("hangout_full")` and so on.
Access rules that RLS enforced in Postgres become Worker rules, because only the Worker can reach D1:

- Public reads return only active cities, active spots of active cities, and hangouts with `status = 'open' AND expires_at > now`.
- `members.device_id`, every `reports`, `blocks`, `device_bans` and `events` row are private: they never leave the Worker.
- Member `about` lines are visible only to members of the same hangout; nicknames are visible to everyone who can see the hangout.

Lane 2 adds `0020_safety.sql` (reports, blocks, device_bans, a ban trigger on `members`) and lane 3 adds `0040_events.sql` (events, numbers_excluded_devices); their prompts define those tables.

## 9. Tooling and commands

```sh
bun install                                   # at the repo root (bun workspaces)
cd apps/api
bun run dev                                   # wrangler dev on http://localhost:8787, local D1 and Durable Objects
bun run db:migrate:local                      # wrangler d1 migrations apply DB --local
bun run db:seed:local                         # lane 3's seed file into local D1
bun run check                                 # wrangler types && tsc --noEmit
bun run test                                  # vitest with @cloudflare/vitest-pool-workers (real workerd, local D1, DOs)
bun run deploy:staging                        # builds ../web if present, then wrangler deploy --env staging (only with Batu's OK)
```

Tests run inside workerd through `@cloudflare/vitest-pool-workers`; apply migrations in a setup file with `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` (see https://developers.cloudflare.com/workers/testing/vitest-integration/ and the D1 recipe there).
Use `SELF.fetch("https://example.com/api/...")` for end-to-end route tests and `runInDurableObject` for Durable Object internals.
Check the current docs for exact config keys; Cloudflare's agent index is https://developers.cloudflare.com/llms.txt.

## 10. Git, PRs and handoff

- One branch per task, named `be/<lane>-<topic>` (for example `be/l2-chat`), always from fresh `origin/main`.
- Commit small and often with plain messages; no AI co-author lines.
- Before opening a PR: `git fetch origin && git rebase origin/main`, then `bun run check && bun run test`.
- Open the PR against `main` with `gh pr create` (title starts with `[lane N]`), and fill the body with: what it does, the routes and migrations it adds, how you verified (exact commands and their output, `curl` examples), and anything another lane must know.
- Post the PR URL in the team chat (stem or WhatsApp) and tag Batu; Batu reviews and merges.
  Do not merge your own PR unless Batu says so.
- If your PR changes a shared shape, say so in the first line of the PR body.
- Handoff at the end of your time box: push everything (draft PR if unfinished), and write in the PR body what works, what does not, and the next three steps.

## 11. What to port (read these first, do not merge them)

| Source (branch:path) | Use it for |
| --- | --- |
| `fm/t0-foundation:lib/contract.ts` | Port into `packages/shared/src/contract.ts` with the deltas from section 7 |
| `fm/t0-foundation:supabase/migrations/0001_init.sql` | Data model, check constraints and the capacity trigger (already translated to D1 in section 8) |
| `fm/t0-foundation:docs/ARCHITECTURE.md` | Device-id flow, access rules, safety rules |
| `fm/t0-foundation:lib/device.ts`, `proxy.ts` | Device cookie behaviour (rewrite as a Worker helper) |
| `fm/t2-hangouts:lib/hangouts/time.ts` and `time.test.ts` | "Tonight", night end at 06:00 local, start-time check, start slots: port verbatim (pure `Intl`, works in Workers) |
| `fm/t2-hangouts:lib/hangouts/service.ts` | Create, join and read logic, row-to-contract mapping, error mapping table |
| `fm/t2-hangouts:supabase/migrations/0002_hangout_functions.sql` | Exact semantics of `wohin_create_hangout` (max 3 open hosted hangouts per device), `wohin_join_hangout` (idempotent per device), `wohin_city_tonight`, `wohin_hangout_detail` |
| `fm/t2-hangouts:lib/hangouts/service.test.ts` and `time.test.ts` | Test cases to port as specs |

Read them with, for example, `git show origin/fm/t2-hangouts:lib/hangouts/service.ts`.

## 12. Your tasks

### Task A: the skeleton PR (target: open within 30 minutes, branch `be/l1-skeleton`)

Keep it small so Batu can merge it in minutes; it unblocks lanes 2 and 3.

1. Root `package.json` with bun workspaces `["apps/*", "packages/*"]` (if `main` already has one from Batu's frontend, add the workspaces and scripts, do not replace it), root `.gitignore` additions: `node_modules`, `.wrangler`, `.dev.vars` and `.dev.vars.*` except `!.dev.vars.example`, `dist`.
   Commit `apps/api/worker-configuration.d.ts` (generated by `wrangler types`) so typecheck works on a fresh clone.
2. `packages/shared/` (`package.json` name `@wohin/shared`, `src/contract.ts`, `src/index.ts`) with the full contract from section 7 including every delta, and the pre-placed comment lines in `index.ts`:
   ```ts
   export * from "./contract";
   // [lane2] export * from "./chat-safety";
   // [lane3] export * from "./catalog-share-numbers";
   ```
3. `apps/api/` from the playbook templates (`templates/worker.ts`, `templates/wrangler.jsonc`), minus Better Auth, billing and AI:
   - `wrangler.jsonc`: `name: "wohin-api"`, `main: "src/index.ts"`, a current `compatibility_date`, `compatibility_flags: ["nodejs_compat"]`, `observability.enabled: true`, D1 binding `DB` with `migrations_dir: "migrations"`, `assets` (`directory: "../web/dist"`, `binding: "ASSETS"`, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*", "/go/*"]`), vars `APP_ENV`, `PUBLIC_ORIGIN` (`http://localhost:8787` locally), and `env.staging` plus `env.production` blocks with their own D1 database names (`wohin-db-staging`, `wohin-db`) and `database_id: "TODO-batu"` placeholders.
   - Pre-placed comment lines in `wrangler.jsonc`: `// [lane2] durable_objects + migrations for ChatRoom` (top level and in each env), `// [lane2] AI gateway vars`, `// [lane3] triggers / extra run_worker_first paths`.
   - `package.json` scripts: `dev` (`mkdir -p ../web/dist && wrangler dev`), `check` (`wrangler types && tsc --noEmit`), `test` (`vitest run`), `db:migrate:local`, `db:seed:local` (`wrangler d1 execute DB --local --file seed/spots.sql`), `deploy:staging` (`(test -f ../web/package.json && bun --cwd ../web run build || true) && wrangler deploy --env staging`).
     No `deploy:production` script: production is Batu's manual step.
   - `.dev.vars.example` with names only: `ADMIN_TOKEN=` and the pre-placed lines `# [lane2] AWS_BEARER_TOKEN_BEDROCK=`, `# [lane2] AWS_ACCESS_KEY_ID=`, `# [lane2] AWS_SECRET_ACCESS_KEY=`, `# [lane2] CF_AIG_TOKEN=`.
   - `vitest.config.ts` with `@cloudflare/vitest-pool-workers`, reading `wrangler.jsonc`, plus a setup file that applies all D1 migrations before tests.
   - `src/index.ts`: the router with route tables and the pre-placed lane lines from section 5, a top-level `try/catch` that returns `internal` (500) and logs `console.error` without request bodies, and the fallthrough: non-`/api` and non-`/go` requests go to `env.ASSETS.fetch(request)`.
   - `src/lib/http.ts`: `json(data, status)`, `apiError(code, message, status)`, `parseJson(request, schema)` (400 `bad_request` with the first zod issue), `route(method, pathname)` helper on `URLPattern`.
   - `src/lib/device.ts`: `getDevice(request): { deviceId, setCookie: string | null }` and `withDeviceCookie(response, setCookie)`; mint a new `crypto.randomUUID()` when the cookie is missing or not a UUID.
   - `src/lib/time.ts`: verbatim port of `fm/t2-hangouts:lib/hangouts/time.ts`.
   - `src/hooks.ts`: exactly the shape in section 5 with no-op defaults.
   - `src/hangouts/routes.ts`: exports `hangoutRoutes` (start with the routes answering 501 `not_implemented` but with real input validation).
   - `GET /api/health` returning `{ ok: true }` and `GET /api/me`.
   - `migrations/0001_core.sql`: exactly section 8.
4. `docs/decisions/0001-lane1-device-id-instead-of-better-auth.md` (5 to 10 lines: decision, why, what we give up, post-hackathon path).
5. Verify: `bun install`, `bun run check`, `bun run test` (health test plus one migration smoke test), `bun run dev` then `curl -i localhost:8787/api/health`.
6. Open the PR titled `[lane 1] Backend skeleton: Worker, D1 core schema, shared contract` and post the URL to the team chat immediately with one line: "Skeleton is up, rebase onto main once merged."

Acceptance for Task A:
- A fresh clone runs `bun install && cd apps/api && bun run check && bun run test` green.
- `curl localhost:8787/api/health` returns `{"ok":true}` and sets a `wohin_device` cookie.
- `wrangler d1 migrations apply DB --local` applies `0001_core.sql` cleanly.
- Lanes 2 and 3 can wire in by uncommenting only their own lines.

### Task B: hangouts and join API (branch `be/l1-hangouts`, after the skeleton PR is open)

Implement in `apps/api/src/hangouts/` (`routes.ts`, `service.ts` for SQL, `map.ts` for row-to-contract mapping):

1. `GET /api/cities/:slug`: the city (404 `not_found` if missing or inactive), its open unexpired hangouts sorted by `starts_at` with `HangoutSummary` (spot `{ id, name, kind, address }`, `memberCount`, `spotsLeft = maxSize - memberCount`, `memberPreview` of the first 5 nicknames by `joined_at`), and `peopleTonight` (members across those hangouts).
   One or two SQL statements total, no N+1 queries (use `GROUP BY` and `json_group_array` where useful).
2. `POST /api/hangouts`:
   - Validate with `CreateHangoutRequestSchema`.
   - The spot must be an active spot of that active city (400 `bad_request` "The spot must be a curated spot of this city.").
   - `checkStartsAt(startsAt, now, city.timezone)`: reject past times (more than 30 minutes ago) and times at or after the night end (400 with the messages from `service.ts`); `expires_at` is the night end.
   - `await hooks.guard(env, deviceId, "hangout_create")` and `await hooks.screenText(env, nickname + "\n" + about)` before writing (422 `content_rejected` when false).
   - At most 3 open, unexpired hangouts hosted by the same device (429 `rate_limited` "You already host 3 open groups tonight.").
   - Insert the hangout and the host member (`role = 'host'`, `age_confirmed = 1`) atomically with `env.DB.batch([...])`.
   - `hooks.track(env, ctx, { name: "hangout_create", deviceId, citySlug, hangoutId })`.
   - Respond 201 with `{ hangout, member }`.
3. `GET /api/hangouts/:id`: 404 when missing, hidden, cancelled or expired.
   `members` sorted by `joined_at`; `about` is `null` for viewers who are not members of this hangout; `viewerMemberId` is the caller's member id or `null`.
   Include the full `spot`.
4. `POST /api/hangouts/:id/join`:
   - Validate with `JoinHangoutRequestSchema` (`ageConfirmed` must be literally `true`; anything else is 400).
   - If this device already is a member, return 200 with the existing membership (idempotent, no second insert).
   - Otherwise `hooks.guard(..., "hangout_join")`, `hooks.screenText(...)`, insert with `joined_at = now`, and map trigger errors: `hangout_full` to 409 `hangout_full`, `hangout_closed` to 409 `hangout_closed`, `hangout_not_found` and hidden hangouts to 404, a concurrent `UNIQUE` violation to "return the existing membership", `device_banned` (from lane 2's trigger) to 403 `forbidden`.
   - On success: `hooks.broadcast(env, ctx, hangoutId, { type: "member_joined", member })` and `hooks.track(..., { name: "hangout_join", ... })`; respond 201.
5. `GET /api/me`: the caller's memberships in open, unexpired hangouts (powers "my groups" in the frontend).
6. Stretch, only if everything above is merged: `POST /api/hangouts/:id/leave` (members only; the host leaving cancels the hangout when nobody else is in it).

Tests in `apps/api/test/hangouts.test.ts` and `apps/api/test/core.test.ts` (port the cases from `fm/t2-hangouts:lib/hangouts/service.test.ts` and `time.test.ts`), each through `SELF.fetch` so they cover routing, cookies and SQL together.
Seed a fixture city and two spots in a `beforeEach`.
Pass a fixed "now" by making `service.ts` take `now: number` and having routes pass `Date.now()`; tests call the service directly for time-sensitive cases.

- Creates a hangout and its host atomically; `expiresAt` is 06:00 local next morning (Europe/Berlin), including the case "it is 01:30, the night ends today at 06:00".
- Rejects a spot from another city, an inactive spot and a past start time; rejects a start at or after the night end.
- A device can host at most 3 open hangouts.
- Join is idempotent per device (second call returns 200 and the same member id, member count stays the same).
- Capacity: with `maxSize = 3`, the 4th distinct device gets 409 `hangout_full`, and the count never exceeds 3.
- Joining an expired or hidden hangout gives 409 `hangout_closed` or 404.
- `ageConfirmed: false` or missing gives 400.
- City page counts only open, unexpired hangouts, and `peopleTonight` sums their members.
- No response body anywhere contains a device id (assert the cookie value never appears in any JSON you return).
- Non-members see `about: null`; members see it.
- Every response parses with its contract schema.

Acceptance for Task B:
- All tests green; `bun run check` clean.
- Manual run against `wrangler dev` with lane 3's seed (or your fixture SQL): create a hangout with one cookie jar, join it with three other cookie jars (`curl -c/-b`), the fifth join on a size-4 group returns 409.
- The PR lists every route with one example `curl` and its response.

### Task C: integration (Saturday 19:30 to 20:30, together with lanes 2 and 3 and Batu)

1. Once Batu's frontend is on `main` (`apps/web`, branch `fm/proto-web`), open its typed mock module and compare every field with `packages/shared/src/contract.ts`.
   Post the differences to Batu as a short list (field, mock name, contract name, proposal); prefer adding optional fields to the contract over renaming.
2. Help Batu deploy staging (Batu owns the Cloudflare account): Batu runs `npx wrangler d1 create wohin-db-staging`, you put the returned `database_id` into `wrangler.jsonc` (ids are not secrets), then `bunx wrangler d1 migrations apply DB --env staging --remote` and `bun run deploy:staging`.
3. Smoke-test staging with the same `curl` flow as Task B and post the result.

## 13. Time box

- 30 minutes after you start: skeleton PR open (Task A).
- Saturday 19:00: Task B PR open with tests green.
- Saturday 19:30 to 20:30: integration and staging smoke test (Task C).
- If you are stuck on one thing for more than 20 minutes, post in the team chat with what you tried and move to the next task.
- Sunday 13:30 feature freeze: after that, only bug fixes that Batu approves.

## 14. What not to touch

- `apps/web/`, `brand/`, `launch/`, `submission/`: Batu's.
- `apps/api/src/chat/`, `apps/api/src/safety/`, `migrations/0020-0039`: lane 2.
- `apps/api/src/catalog/`, `apps/api/src/share/`, `apps/api/src/numbers/`, `apps/api/seed/`, `apps/api/scripts/`, `data/spots/`, `migrations/0040-0059`: lane 3.
- Production: no `--env production` deploys, no `--remote` commands against the production database.
- No new dependencies beyond section 3 without asking in the team chat.
