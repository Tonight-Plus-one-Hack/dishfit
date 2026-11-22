# Lane 3 (Malek1414): cities and spots data, share and invite links, partner hand-offs, /numbers

You are the coding agent for GitHub user `Malek1414` on the hackathon team.
Paste-ready brief: read all of it before you start, then work through section 12 in order.
Your lane fills the app with real places in eight cities, makes every group shareable with a good link preview, sends travellers to Expedia, Hotels.com, Vrbo and Layla, and produces the honest live numbers the jury will see.
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
| `fm/t1-spots:data/spots/*.json`, `data/spots/ATTRIBUTION.md` | The spot data itself: copy into this repo unchanged (OpenStreetMap, ODbL; keep the attribution file) |
| `fm/t1-spots:scripts/spots/*.mjs` | The Overpass exporter and curation; copy unchanged so the data stays reproducible |
| `fm/t4-share-numbers:lib/partners/urls.ts` | Partner labels and URL builders for `/go/:brand` (port verbatim) |
| `fm/t4-share-numbers:lib/partners/attribution.ts` | `readAttribution` (UTM parsing) verbatim; the bot and prefetch checks from `isPublicLanding` (rewrite for a plain `Request`) |
| `fm/t4-share-numbers:lib/partners/spot-snapshots.ts` | The id mapping `node/123` to `osm-node-123` |
| `fm/t4-share-numbers:lib/events.ts` | Never-throwing event logging, UTM cookie `wohin_utm` (30 days) |
| `fm/t4-share-numbers:supabase/migrations/0004_launch_numbers.sql` | The exact metric definitions of `/numbers` (port the Postgres CTE to SQLite) |
| `fm/t4-share-numbers:lib/contract.ts` | Numbers, share and go shapes (lane 1 ports them into the shared contract) |
| `fm/t6-submission:submission/numbers.json` | The keys the submission slide reads; `/api/numbers` returns a `submission` block with exactly these keys |

Spot data facts (checked): `cities.json` lists 8 cities (Berlin, Hamburg, Munich, Cologne, Amsterdam, Barcelona, Lisbon, Prague) with `slug`, `name` (English), `country`, `lat`, `lng`, `timezone`.
Each `<city>.json` is an array of rows like `{ "id": "node/966975630", "name": "Frannz Club", "lat": 52.53, "lng": 13.41, "category": "bar", "opening_hours": "...", "website": "http://...", "address": { "street", "housenumber", "postcode", "suburb", "city", "country" }, "curated": true, "vibes": ["bar", "culture"], "description": "English one-liner" }`.
Berlin has 2,072 rows of which 32 are `curated: true`; only curated rows go into the app.

## 12. Your tasks

### Task A: start now, before the skeleton lands (branch `be/l3-catalog-share-numbers`)

Work only in `data/spots/`, `scripts/spots/`, `apps/api/scripts/`, `apps/api/seed/`, `apps/api/src/catalog/`, `apps/api/src/share/`, `apps/api/src/numbers/`, `apps/api/migrations/0040_events.sql` and your test files.

1. `git checkout origin/fm/t1-spots -- data/spots scripts/spots` and commit (pure data, written today).
2. Seed generator `apps/api/scripts/seed-spots.ts` (runs with `bun apps/api/scripts/seed-spots.ts`), writing `apps/api/seed/spots.sql`:
   - Cities: `slug`; `name` in German (`Berlin`, `Hamburg`, `München`, `Köln`, `Amsterdam`, `Barcelona`, `Lissabon`, `Prag`); `name_en` from `cities.json`; `country_code` from `country`; `timezone`; `lat`; `lng`; `sort_order` in file order (Berlin first); active.
   - Spots: only `curated: true`; `id` `node/123` becomes `osm-node-123` (also `way/`, `relation/`); `kind` from `category` (skip rows whose category is not one of `bar, pub, nightclub, biergarten, cafe, venue`); `vibes` as a JSON array; `description_en` from `description`, `description_de` null; `address` = `street housenumber` (null without a street); `neighborhood` = `address.suburb` or null; `opening_hours`; `website` only if it parses as an `http(s)` URL of at most 300 chars; `source = 'osm'`.
   - Validate every row with `SpotSchema` from `packages/shared` before writing; fail loudly with the row id.
   - Idempotent SQL: `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` for cities and spots, then per city `UPDATE spots SET is_active = 0 WHERE city_slug = ? AND id NOT IN (...)`.
   - Escape strings by doubling single quotes; no other string building.
   - Commit the generated `seed/spots.sql` (it is data) and the generator.
3. `apps/api/migrations/0040_events.sql`:
   ```sql
   CREATE TABLE events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,      -- internal only, never exposed
     name TEXT NOT NULL,
     ts INTEGER NOT NULL,
     device_id TEXT,
     city_slug TEXT,
     hangout_id TEXT,
     utm_source TEXT,
     props TEXT NOT NULL DEFAULT '{}'
   );
   CREATE INDEX events_name_ts_idx ON events (name, ts);
   CREATE INDEX events_device_ts_idx ON events (device_id, ts);

   CREATE TABLE numbers_excluded_devices (     -- team devices, so the numbers count only real users
     device_id TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL
   );
   ```
4. Port `urls.ts` and `readAttribution` with their tests (pure; run with `bunx vitest run apps/api/test/share-pure.test.ts` until lane 1's test config exists).

### Task B: cities and spots read API (`apps/api/src/catalog/`)

1. `GET /api/cities`: active cities by `sort_order` with `openHangouts` and `peopleTonight` (open hangouts with `expires_at > now` and the members in them), one SQL statement with `LEFT JOIN` and `GROUP BY`.
   `Cache-Control: no-store` (live counts).
2. `GET /api/cities/:slug/spots?vibe=&kind=`: the city plus its active spots; `vibe` filters with `EXISTS (SELECT 1 FROM json_each(spots.vibes) WHERE value = ?)`; validate both filters against the contract enums (400 otherwise); 404 for an unknown or inactive city.
   `Cache-Control: public, max-age=300`.
3. `GET /api/spots/:id`: one active spot or 404.
4. Map rows to `CitySchema` and `SpotSchema` (`vibes` parsed from JSON, ISO timestamps, `null` for missing values).
5. The OpenStreetMap attribution must stay visible wherever spots are shown: tell Batu the exact text and link from `data/spots/ATTRIBUTION.md` in your PR.

### Task C: share and invite links, link previews, partner hand-off (`apps/api/src/share/`)

1. `GET /api/share/hangout/:id?lang=de|en` and `GET /api/share/city/:slug?lang=de|en` return `{ url, text, whatsappUrl }`:
   - `url` = `${PUBLIC_ORIGIN}/h/<id>` or `/c/<slug>` plus `utm_source=share&utm_medium=invite&utm_campaign=hangout|city`.
   - `text` (German default, English with `lang=en`), short and honest, for example "Heute Abend 21:00 in der Frannz Club Bar, noch 3 Plätze frei. Kommst du mit?"; the time in the city's timezone (reuse lane 1's `src/lib/time.ts` `formatTime`); never nicknames.
   - `whatsappUrl` = `https://wa.me/?text=` plus the encoded text and url.
   - 404 for hidden, cancelled, expired or unknown hangouts.
2. Link previews for WhatsApp, iMessage, Instagram and X: add `/h/*` and `/c/*` (and `/` if the pattern syntax allows the bare root; check https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first) to `run_worker_first` on your pre-placed line.
   For HTML navigations to those paths, fetch the SPA shell from `env.ASSETS` and rewrite the head with `HTMLRewriter`: `<title>`, `og:title`, `og:description`, `og:url`, `og:image`, `twitter:card`.
   Hangout: spot name, city, local start time, "N von M dabei"; city: "Heute Abend in Berlin: N Gruppen".
   Unknown, hidden or expired: the generic app preview, still status 200 (the SPA renders its own not-found state).
   `og:image` points to a static image Batu ships in `apps/web/public/` (ask Batu for the file names; until then use `/og-default.png`).
3. Landing analytics on those same HTML navigations: skip bots, link-preview fetchers and prefetches (port the header checks from `isPublicLanding`), then `hooks.track({ name: "page_view", ... })` with the UTM values from the URL; when UTM values are present, set the `wohin_utm` cookie (30 days, `HttpOnly; Secure; SameSite=Lax`) so later actions are attributed.
4. `GET /go/:brand?city=&hangout=&from=` (port `urls.ts`): 404 for an unknown brand; for `expedia`, `hotels`, `vrbo` set `destination` to the city's English name when `city` is a known slug; `layla` gets no destination; `hooks.track({ name: "handoff_click", props: { brand, from } , citySlug, hangoutId })`; respond 302 with `Cache-Control: no-store`.
   Never invent affiliate ids or claim a partnership in copy.

### Task D: events and `/numbers` (`apps/api/src/numbers/`)

1. `track(env, ctx, event)` (installed as `hooks.track`): validate the name against `EVENT_NAMES` and props against `EventPropsSchema`; take `utm_source` from the props or the `wohin_utm` cookie on `event.request`; insert with `ctx.waitUntil`; on any error log only `console.warn("[analytics] could not record", name)`; never throw.
2. `POST /api/events` for client-side events: allowed names only `city_view`, `spots_view`, `hangout_view`, `share_click`, `lang_switch` (400 otherwise; `page_view`, `hangout_create`, `hangout_join`, `message_send`, `go_click`, `handoff_click` are server-side only, so nobody can inflate them from a browser); `share_click` props must match `ShareEventSchema`; at most 120 client events per device per hour (excess is dropped silently with 202).
3. `GET /api/numbers`: port `launch_numbers` from `0004_launch_numbers.sql` to SQLite (CTEs, `count(*) FILTER (WHERE ...)`, `json_extract` all work in D1), with the same definitions:
   - Activity: visits (`page_view`), shares (`share_click`), hand-offs (`handoff_click`, `go_click`), creates (hangouts, attributed to the host device), joins (all `members` rows), messages (`message_send` events, because messages live in lane 2's Durable Objects).
   - Exclude every device in `numbers_excluded_devices` and hangouts hosted by them.
   - `total` and `last24h`: `uniqueDevices`, `hangoutsCreated`, `membersJoined`, `peopleJoined` (distinct joining devices), `hangoutsReachedThree`, `shareReachedThree`, `messagesSent`, `shares`, `outboundClicks`, `handoffClicksByBrand`, `citiesActive`.
   - `byCity` (`citySlug`, `cityName`, `hangoutsCreated`, `membersJoined`), `byUtmSource` (creates, joins and messages attributed to the device's latest `page_view` UTM source within 30 days before the action).
   - `submission`: exactly the keys of `submission/numbers.json` (`updated_at`, `cities_live`, `unique_visitors`, `people_joined`, `hangouts_started`, `hangouts_filled`, `messages_sent`, `shares`, `brand_clicks: { layla, expedia, hotels_com, vrbo }`).
   - Aggregates only, never a device id; `Cache-Control: public, max-age=30`.
4. `POST /api/numbers/exclude-me` with `Authorization: Bearer <ADMIN_TOKEN>` (constant-time compare; 401 without): adds the caller's device to `numbers_excluded_devices`.
   Every teammate runs it once in every browser they use on staging and production (`fetch("/api/numbers/exclude-me", { method: "POST", headers: { Authorization: "Bearer ..." } })` in the devtools console).
5. `docs/decisions/0040-lane3-analytics-in-d1.md`: why D1 instead of Tinybird for the hackathon, and how to move later (the playbook's `POST /events` to Queue to Tinybird).
6. `apps/api/src/numbers/register.ts` exports `catalogRoutes`, `shareRoutes`, `numbersRoutes`, `installNumbersHooks(hooks)` and `handleDocument` (the HTML preview and landing handler); then uncomment your `[lane3]` lines in `src/index.ts`, `wrangler.jsonc` and `packages/shared/src/index.ts` (only if you created `catalog-share-numbers.ts`).
   `handleDocument(request, env, ctx)` returns a `Response` for HTML navigations it handles and `null` for everything else; lane 1's fallthrough calls it right before `env.ASSETS.fetch`.

### Tests (in `apps/api/test/catalog.test.ts`, `share.test.ts`, `share-pure.test.ts`, `numbers.test.ts`, `seed.test.ts`)

- Seed: the generated SQL loads into D1; 8 cities; only curated spots are active; running it twice changes nothing; a spot that left the curated list becomes inactive; every spot row parses with `SpotSchema`.
- Catalog: cities come in `sort_order`; `openHangouts` and `peopleTonight` count only open, unexpired hangouts (fixtures with expired and hidden ones); spot filters by vibe and kind work; unknown city or spot gives 404; responses parse with their schemas.
- Share: links carry the UTM parameters and `PUBLIC_ORIGIN`; `whatsappUrl` is correctly encoded; the hangout preview HTML contains the spot name in `og:title` and no nickname; hidden or expired hangouts get the generic preview with status 200.
- Go: each brand redirects to the right host; `destination` is set for Expedia, Hotels.com and Vrbo and absent for Layla; an unknown brand gives 404; a `handoff_click` event row is written.
- Events: allowed client names give 202 and a row; server-only names give 400; oversized props are rejected; the UTM cookie is attributed.
- Numbers: a fixture of visits, creates, joins, messages, shares and clicks yields the exact expected counts for `total` and `last24h` (events older than 24 hours only in `total`); excluded devices disappear; `hangoutsReachedThree` and `byCity` are right; `submission` has exactly the slide keys; the JSON contains no device id; `exclude-me` without the token gives 401.

## 13. Acceptance

- `bun run check` and `bun run test` green after rebasing onto the merged skeleton.
- Locally: `bun run db:migrate:local && bun run db:seed:local`, then `curl localhost:8787/api/cities` lists 8 cities and `curl localhost:8787/api/cities/berlin/spots` lists Berlin's curated spots.
- `curl -i "localhost:8787/go/expedia?city=berlin&from=city_page"` redirects with `destination=Berlin`, and `/api/numbers` shows the click.
- A WhatsApp-style fetch (`curl -A "WhatsApp/2.0" localhost:8787/h/<id>`) returns HTML with the right `og:` tags and is not counted as a visit.
- The PR body lists every route with one `curl` example, the share text in both languages, the attribution text for Batu, and the exact command Batu runs to seed staging: `bunx wrangler d1 execute DB --env staging --remote --file apps/api/seed/spots.sql`.

## 14. Time box

- Now until the skeleton is merged: Task A (data, seed generator, migration, URL builders).
- Saturday 19:00: PR open with Tasks B, C and D, tests green.
- Saturday 19:30 to 20:30: integration with Batu's frontend and the staging smoke test (seed staging, check `/api/numbers` live, exclude the team's devices).
- Sunday morning: check that `/api/numbers` on production matches reality before Batu fills `submission/numbers.json`; never type an estimate into it.
- If you are stuck on one thing for more than 20 minutes, post in the team chat with what you tried and move on; link previews are nice to have, `/api/numbers` and `/go` are not.

## 15. What not to touch

- `apps/web/`, `brand/`, `launch/`, `submission/`: Batu's (you only read `submission/numbers.json` for its keys).
- `apps/api/src/hangouts/`, `src/lib/`, `src/hooks.ts`, `packages/shared/src/contract.ts`, `migrations/0001-0019`: lane 1 (ask in the team chat for changes).
- `apps/api/src/chat/`, `src/safety/`, `migrations/0020-0039`: lane 2.
- Production: no `--env production` deploys or seeds, no `--remote` commands against the production database; Batu seeds production after approving it.
- No scraping of Luma, Google Maps, Resident Advisor or Yelp; spots come only from the OpenStreetMap snapshot.
- No new dependencies without asking.
