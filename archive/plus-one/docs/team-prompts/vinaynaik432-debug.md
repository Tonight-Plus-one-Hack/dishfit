# Lane 2 (vinaynaik432-debug): real-time group chat and safety

You are the coding agent for GitHub user `vinaynaik432-debug` on the hackathon team.
Paste-ready brief: read all of it before you start, then work through section 12 in order.
Your lane makes groups of strangers feel safe enough to show up: live group chat per hangout on Durable Objects, plus report, block, bans, rate limits, word filter, AI moderation, 18+ enforcement and expiry.
You can start right now in your own folders; you do not need to wait for lane 1's skeleton.
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
| `fm/t3-chat-safety:lib/moderation/word-filter.ts` | Port verbatim to `apps/api/src/safety/word-filter.ts` (pure TypeScript, 6 languages, leetspeak, spaced letters, casual swearing allowed) |
| `fm/t3-chat-safety:lib/moderation/moderation.test.ts` | Word filter and AI moderation test cases |
| `fm/t3-chat-safety:lib/moderation/ai.ts` | System prompt (verbatim), `parseVerdict`, Bedrock request body, fail-open flow, 2.5 s deadline |
| `fm/t3-chat-safety:lib/moderation/sigv4.ts` | SigV4 signing without the AWS SDK (works in Workers with `nodejs_compat`; or switch `createHmac`/`createHash` to `crypto.subtle`); its comment mentions `sigv4.test.ts`, which is not on the branch, so add a test against a published AWS SigV4 example before relying on it |
| `fm/t3-chat-safety:lib/moderation/moderate.ts`, `guard.ts`, `chat.ts`, `safety.ts` | Order of checks: filter first, AI only for allowed members, membership and rate limit before paying for AI |
| `fm/t3-chat-safety:supabase/migrations/0003_chat_safety.sql` | Rate limit numbers (`safety_guard`), report thresholds and person removal (`safety_report`, `safety_remove_device`), block semantics (`safety_block`), visibility rules (`chat_list_messages`), arrived check-in (`chat_post_message`), admin actions (`admin_list_reports`, `admin_moderate`) |
| `fm/t3-chat-safety:lib/moderation/chat-safety.test.ts` | Chat, blocking, reports, thresholds and privilege test cases to port as specs |
| `fm/t3-chat-safety:lib/contract.ts` | Message kinds and the `PostMessageRequest` union (lane 1 ports them into the shared contract) |

Read them with, for example, `git show origin/fm/t3-chat-safety:lib/moderation/word-filter.ts`.
Note for zsh users: quote the argument (`"origin/fm/t3-chat-safety:lib/..."`), because `:l` is a zsh modifier.

## 12. Your tasks

### Task A: start now, before the skeleton lands (branch `be/l2-chat-safety`)

Work only in `apps/api/src/safety/`, `apps/api/src/chat/`, `apps/api/migrations/0020_safety.sql` and `apps/api/test/safety*.test.ts`, `apps/api/test/chat*.test.ts`.

1. Port the word filter and its tests.
   Until lane 1's test config exists, run pure tests with `bunx vitest run apps/api/test/safety-pure.test.ts` (no config needed, nothing installed into `package.json`).
2. Write `apps/api/src/safety/ai.ts`: moderation through Cloudflare AI Gateway (details in Task D), with the prompt and `parseVerdict` from `fm/t3-chat-safety`, a deadline, and an injectable `fetch` so tests use a fake.
3. Write `apps/api/migrations/0020_safety.sql`:
   ```sql
   CREATE TABLE reports (
     id TEXT PRIMARY KEY,
     reporter_device_id TEXT NOT NULL CHECK (length(reporter_device_id) BETWEEN 16 AND 64),
     target_type TEXT NOT NULL CHECK (target_type IN ('hangout', 'message', 'member')),
     target_id TEXT NOT NULL,
     hangout_id TEXT NOT NULL REFERENCES hangouts (id) ON DELETE CASCADE,
     target_device_id TEXT,                 -- resolved server-side; lets thresholds count across hangouts
     reason TEXT NOT NULL CHECK (reason IN ('harassment', 'spam', 'unsafe', 'inappropriate', 'other')),
     details TEXT CHECK (details IS NULL OR length(details) <= 500),
     snapshot TEXT NOT NULL DEFAULT '{}',   -- JSON copy of the reported content for moderators
     resolved_at INTEGER,
     created_at INTEGER NOT NULL,
     UNIQUE (reporter_device_id, target_type, target_id)
   );
   CREATE INDEX reports_target_idx ON reports (target_type, target_id);
   CREATE INDEX reports_target_device_idx ON reports (target_device_id);
   CREATE INDEX reports_reporter_idx ON reports (reporter_device_id, created_at);

   CREATE TABLE blocks (
     blocker_device_id TEXT NOT NULL,
     blocked_device_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (blocker_device_id, blocked_device_id),
     CHECK (blocker_device_id <> blocked_device_id)
   );

   CREATE TABLE device_bans (
     device_id TEXT PRIMARY KEY,
     reason TEXT NOT NULL CHECK (reason IN ('auto_reports', 'admin')),
     created_at INTEGER NOT NULL
   );

   -- A banned device can never join or host a hangout again.
   CREATE TRIGGER members_reject_banned BEFORE INSERT ON members
   BEGIN
     SELECT RAISE(ABORT, 'device_banned')
      WHERE EXISTS (SELECT 1 FROM device_bans WHERE device_id = NEW.device_id);
   END;
   ```
4. Write the `ChatRoom` Durable Object class in `apps/api/src/chat/room.ts` (Task B) and its pure helpers.
5. Commit as you go; do not open the PR before you have rebased onto the merged skeleton.

### Task B: real-time chat on Durable Objects

Design (follow it; it keeps validation, rate limits and moderation in one place):

- One `ChatRoom` Durable Object per hangout: `env.CHAT.get(env.CHAT.idFromName(hangoutId))`.
  It must be a SQLite-backed class, the only kind the Workers Free plan allows: in `wrangler.jsonc`, on your pre-placed lines, add `durable_objects.bindings: [{ name: "CHAT", class_name: "ChatRoom" }]` and `migrations: [{ tag: "v1", new_sqlite_classes: ["ChatRoom"] }]`, top level and in both envs.
- The Durable Object stores messages in its own SQLite (`this.ctx.storage.sql`): `messages(id TEXT PRIMARY KEY, member_id TEXT NOT NULL, author_nickname TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)` plus an index on `(created_at, id)` and on `(member_id, created_at)`.
  No device ids ever enter the Durable Object; it only knows member ids.
- Use the WebSocket Hibernation API (`this.ctx.acceptWebSocket(ws)`, `webSocketMessage`, `webSocketClose`, `ws.serializeAttachment({ memberId, blockedMemberIds })`), so idle rooms cost nothing; see https://developers.cloudflare.com/durable-objects/best-practices/websockets/.
- Expose RPC methods called by the Worker (Durable Object RPC on the stub): `init(hangoutId, expiresAt)`, `post(input): Message` (rate limit per member: at most 6 messages in 10 seconds and 150 per hour, ported from `safety_guard`; throws a typed `rate_limited`), `list({ after, limit, excludeMemberIds, excludeMessageIds })`, `getMessage(id)`, `hide(id)`, `hideMember(memberId)`, `broadcast(frame)`, `setBlocked(memberId, blockedMemberIds)`, `close()`.
- `post` broadcasts `{ type: "message" }` to every socket except those whose attachment blocks the author; `hide` broadcasts `{ type: "hidden" }`.
- The "Ich bin da" check-in is a message with `kind: "arrived"` and body `"arrived"`; it is idempotent per member (a second tap returns the first one), and the Worker also sets `members.arrived_at` in D1 (the only write lane 2 makes to lane 1's `members` table besides bans).
- Expiry: `init` sets an alarm at `expiresAt`; the alarm broadcasts `{ type: "closed" }`, closes all sockets and sets a second alarm 24 hours later that calls `this.ctx.storage.deleteAll()` (chat content does not outlive the night by more than a day).

Worker routes in `apps/api/src/chat/routes.ts`:

1. `GET /api/hangouts/:id/messages?after=`: the caller must be a member (D1 `members` by device; 403 `forbidden` otherwise, 404 if the hangout is missing or hidden).
   Exclude hidden messages, messages from members whose device the caller blocked, and messages the caller reported.
   Without `after`: the latest 200, oldest first; with `after`: up to 200 newer ones.
   Still readable after expiry (until the purge), gone when the hangout is hidden.
2. `POST /api/hangouts/:id/messages`: members only; 409 `hangout_closed` after expiry or when not open.
   Text: trim, 1 to 500 chars, word filter first (422 `content_rejected`, nothing stored), then `post` to the room.
   Then run the AI check in `ctx.waitUntil`: on `block`, call `hide(id)` (everyone gets `{ type: "hidden" }`) and log `console.log("moderation_hidden")` without the text.
   This keeps chat instant while the AI still removes what the filter misses.
   Arrived: `{ kind: "arrived" }` as above.
   Then `hooks.track(env, ctx, { name: kind === "arrived" ? "member_arrived" : "message_send", deviceId, hangoutId })`.
   Respond 201 `{ message }`.
3. `GET /api/hangouts/:id/live`: requires `Upgrade: websocket`; members only (403 before upgrading otherwise).
   The Worker computes `blockedMemberIds` for this hangout from D1 and forwards the upgrade to the room with the member id and that list (for example in internal headers the Worker sets; the room must ignore those headers on any request that did not come from the Worker, so strip them from the incoming request first).
   On connect the room sends `{ type: "hello", messages }` (latest 50, filtered for this viewer).
4. `hooks.broadcast` (installed by you): `ctx.waitUntil(stub.broadcast(frame))`, used by lane 1 for `member_joined`.

### Task C: safety (reports, blocks, bans, rate limits, 18+)

In `apps/api/src/safety/` (`routes.ts`, `reports.ts`, `blocks.ts`, `guard.ts`, `register.ts`):

1. `guard(env, deviceId, action)` (installed as `hooks.guard`): banned device gives 403 `forbidden`; per-device limits ported from `safety_guard` as D1 count queries: `hangout_create` at most 4 per hour and 10 per day (hosted memberships), `hangout_join` at most 12 per hour, `report` at most 10 per 10 minutes and 40 per day, `block` at most 20 per hour; over the limit gives 429 `rate_limited`.
2. `screenText(env, text)` (installed as `hooks.screenText`) for nicknames and about lines: word filter, then the AI check with a 2 second deadline; `block` means false; unavailable, slow or broken AI means true (fail open, the filter's verdict stands).
3. `POST /api/report` (`ReportRequest`), ported from `safety_report`:
   - `guard(..., "report")` first; the hangout must exist.
   - Hangout reports: anyone with a device.
     Message and member reports: the reporter must be a member of that hangout; the target must belong to that hangout (message via `getMessage`, member via D1); resolve `target_device_id` server-side.
   - Reporting yourself gives 400 `bad_request`.
   - Insert with `ON CONFLICT DO NOTHING` (one report per device and target; repeats are a no-op and still return `{ ok: true }`).
   - Thresholds (count open reports from distinct devices): a message is hidden at `MESSAGE_HIDE_REPORT_THRESHOLD` (2); a hangout gets `status = 'hidden'` at `HANGOUT_HIDE_REPORT_THRESHOLD` (3) and its room broadcasts `closed`; a person reported (message or member reports) by `MEMBER_REMOVE_REPORT_THRESHOLD` (3) distinct devices across all hangouts is removed: insert into `device_bans` (`auto_reports`), hide hangouts they host, delete their memberships in hangouts that have not expired, and `hideMember` in those rooms.
   - Store a `snapshot` (message body and nickname, or member nickname and about) for moderators.
   - `hooks.track(..., { name: "report_submit", ... })` with the reason only, never the text.
4. `POST /api/block` (`{ memberId }`): `guard(..., "block")`; the member must exist; blocking yourself gives 400; insert ignore into `blocks`; then `setBlocked` on the current hangout's room for the blocker's sockets.
   The blocked person is never told.
   `hooks.track(..., { name: "block_submit", ... })`.
5. 18+: joining requires `ageConfirmed: true` (lane 1 validates it); you own the test that proves a join without it never creates a member and that `age_confirmed` is stored as 1.
6. Stretch (after everything above is merged): team moderation `GET /api/admin/reports` and `POST /api/admin/moderate` (`hide`, `unhide`, `remove`, `unban`, `resolve`) behind `Authorization: Bearer <ADMIN_TOKEN>` with a constant-time compare, ported from `admin_list_reports` and `admin_moderate`; it never returns device ids.

`apps/api/src/safety/register.ts` exports `chatRoutes`, `safetyRoutes`, `installSafetyHooks(hooks)` and `ChatRoom`; then uncomment your `[lane2]` lines in `src/index.ts`, `wrangler.jsonc`, `.dev.vars.example` and `packages/shared/src/index.ts` (only if you created `chat-safety.ts`).

### Task D: AI moderation through Cloudflare AI Gateway (Bedrock)

Facts, checked against Cloudflare's docs (https://developers.cloudflare.com/ai-gateway/usage/providers/bedrock/, updated 2026-09-10):

- AI Gateway supports Amazon Bedrock.
  Base URL: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/aws-bedrock`.
  InvokeModel through the gateway: `.../aws-bedrock/bedrock-runtime/{region}/model/{model}/invoke`.
- With an AWS access key pair the request must be SigV4-signed against the original host (`https://bedrock-runtime.{region}.amazonaws.com/model/{model}/invoke`) and then sent to the gateway URL with those headers (port `sigv4.ts`).
- With a Bedrock API key (bearer token) the documented gateway path is the Anthropic Messages endpoint `.../aws-bedrock/bedrock-mantle/{region}/anthropic/v1/messages` with `Authorization: Bearer <key>`; it needs the IAM permission `bedrock-mantle:CreateInference`, which the event key may not have.
- Stored provider keys (BYOK) exist but need dashboard access; do not depend on them.

Steps:

1. Human step: ask Batu which kind of key the event gave (bearer API key or access key pair), the region, and for the gateway: Batu creates it in the Cloudflare dashboard (AI, AI Gateway, Create gateway, name `wohin`) and sends you the account id and gateway id (not secrets).
2. Put the key only into `apps/api/.dev.vars` (`AWS_BEARER_TOKEN_BEDROCK=...` or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`); vars `AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_ID`, `BEDROCK_REGION`, `BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-6"` go into `wrangler.jsonc` on your pre-placed line.
   If Batu turns on "Authenticated Gateway", the token is the secret `CF_AIG_TOKEN`, sent as `cf-aig-authorization: Bearer <token>`.
3. With a one-off `curl` from your terminal (never commit it, never paste the key anywhere), find the first path that answers `ALLOW` for "hi, red jacket at the bar":
   (a) bearer key: gateway `bedrock-runtime` invoke URL with `Authorization: Bearer`; (b) bearer key: gateway `bedrock-mantle` Messages URL; (c) access key pair: gateway `bedrock-runtime` with SigV4; (d) last resort, outside the gateway: `https://bedrock-runtime.{region}.amazonaws.com/model/{model}/invoke` directly (what `fm/t3-chat-safety` did).
   Implement exactly the path that worked, and write which one and why into `docs/decisions/0020-lane2-ai-moderation-path.md`.
4. Request: `max_tokens: 5`, the system prompt from `ai.ts` verbatim, the user text wrapped in `<text>` tags with `</text>` removed from the input; parse with `parseVerdict` (a `refusal` stop reason or anything other than ALLOW/BLOCK is "unavailable").
5. Fail open everywhere: missing config, non-2xx, timeout, bad JSON, or the key expiring (Sunday 22 Nov 2026, 18:27) all mean "unavailable", and the word filter decides.
   Log only the provider name and status, never the text or the key.
6. Batu sets the staging secret himself: `npx wrangler secret put AWS_BEARER_TOKEN_BEDROCK --env staging` (or the key pair names).

### Tests (in `apps/api/test/chat.test.ts`, `safety.test.ts`, `safety-pure.test.ts`)

Port the cases from `fm/t3-chat-safety:lib/moderation/moderation.test.ts` and `chat-safety.test.ts`; route tests go through `SELF.fetch`, room internals through `runInDurableObject`.

- Word filter: slurs, threats and harassment in de, en, es, fr, it, tr are blocked; leetspeak and spaced letters are caught; casual swearing ("Scheiße", "fuck yeah") passes.
- Moderation: the AI is never called when the filter rejects; the AI verdict is followed; errors, timeouts, refusals and garbage fail open; no config means no AI call; the gateway URL and headers are built as decided in Task D (fake `fetch`).
- Chat: reading and posting are members-only (403); messages match `MessageSchema` and contain no device id; `?after=` paging works; the arrived check-in is idempotent and sets `arrivedAt`; posting after expiry gives 409 but reading still works; a hidden hangout's chat is gone (404); a filtered word gives 422 and stores nothing; a burst of 7 messages in 10 seconds gives 429 on the 7th.
- WebSocket: a member connects and gets `hello`; a `POST` reaches every connected member as a `message` frame; a non-member upgrade gets 403; a `member_joined` broadcast arrives; after the expiry alarm the socket receives `closed`.
- Blocking: the blocked person's messages disappear for the blocker only, in every hangout, in both the HTTP list and live frames.
- Reports: a message is hidden at 2 distinct reporters (the same reporter twice counts once); a hangout is hidden at 3; message and member reports need membership; self reports are rejected; a person reported by 3 distinct devices across hangouts is removed and banned, and a banned device gets 403 on join and create.
- 18+: a join without `ageConfirmed: true` is rejected and creates no member.
- Privacy: no JSON response and no WebSocket frame contains any device id (assert against the cookie values used in the test).

## 13. Acceptance

- `bun run check` and `bun run test` green after rebasing onto the merged skeleton.
- Manual check against `wrangler dev`: two browser profiles (or `websocat`/`wscat` plus `curl` cookie jars) in the same hangout see each other's messages live; reporting one message from two devices hides it live for everyone; blocking hides a person only for the blocker.
- The AI path from Task D works locally with your `.dev.vars`, and with the key removed the app still works (filter only).
- The PR body lists every route with one `curl` example, the WebSocket frame examples, the decision file for the AI path, and the secrets Batu must set on staging (names only).

## 14. Time box

- Now until the skeleton is merged: Task A (word filter, AI client, migration, room class).
- Saturday 19:00: PR open with chat and safety (Tasks B and C) and the AI path (Task D), tests green.
- Saturday 19:30 to 20:30: integration with Batu's frontend and staging smoke test (live chat between two phones on the staging URL).
- Stretch (admin moderation) only after that, and only until Sunday 13:30 (feature freeze).
- If you are stuck on one thing for more than 20 minutes, post in the team chat with what you tried and move on; the AI part is optional for launch, the word filter is not.

## 15. What not to touch

- `apps/web/`, `brand/`, `launch/`, `submission/`: Batu's.
- `apps/api/src/hangouts/`, `src/lib/`, `src/hooks.ts`, `packages/shared/src/contract.ts`, `migrations/0001-0019`: lane 1 (ask in the team chat for changes).
  Your only writes to lane 1's tables are `members.arrived_at` and deleting a banned person's memberships.
- `apps/api/src/catalog/`, `src/share/`, `src/numbers/`, `seed/`, `scripts/`, `data/spots/`, `migrations/0040-0059`: lane 3.
- Production: no `--env production` deploys or secrets, no `--remote` commands against the production database.
- No AWS SDK, no Anthropic SDK, no new dependencies without asking.
