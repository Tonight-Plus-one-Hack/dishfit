# 0001: Repo layout and stack for the restaurant nutrition app

Date: 2026-11-21.

## Decision

- Plus One moves to `archive/plus-one/` with `git mv`; nothing is deleted.
  Unmerged Plus One branches are listed there, and the web prototype, the iOS app and the OSM spots data are copied in so they survive closed PRs.
- The new product follows [ai-app-playbook](https://github.com/blakeandersonw/ai-app-playbook): one Cloudflare Worker with a plain `fetch` handler serves `/api/*` and the web build as static assets, D1 with plain SQL migrations, R2 for files, React + Vite for the web.
- Top-level layout: `worker/` (the Worker and its migrations), `packages/contract/` (shared types and pure helpers), `apps/web/` and `pipeline/` (each built on its own branch).
- npm workspaces instead of bun: bun is not installed on the team machines, and the web app already uses npm.
  `apps/web` and `pipeline` are not in the root workspace yet; they join it once their PRs land, so their own lockfiles do not conflict with this one.
- Migration number ranges: `0001-0009` Worker app tables, `0010-0029` pipeline queue tables, `0030+` per lane as set in the team prompts.
- Google Places: only the place id is stored (`restaurants.google_place_id`), and the Worker never calls the Places API.
  Names, addresses, coordinates and opening hours in D1 are our own data (restaurant website, our geocoding).
  This follows the compliant option A in `docs/plan.md`; adding Places fields later is a new migration if the captain decides otherwise.
- The generic security pieces of the paused lane 2 (hashed-IP rate limiting, word filter, constant-time admin token check, AI usage cost logging) are ported product-neutral into `worker/src/lib/` with their tests.
- The motion system moves to `docs/design/motion/`; the brand kit in `brand/` stays and only its wordmark changes later.

## Not done here

- `apps/web/` and `pipeline/` are owned by their own workers and branches.
- No Cloudflare resources were created and nothing was deployed; staging and production D1 ids are placeholders.
- No `AGENTS.md` or `CLAUDE.md` was added; the playbook's agent guide can be filled in once the product name is final.
