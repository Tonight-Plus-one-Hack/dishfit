#!/usr/bin/env bash
# Repeatable production release on the Workers Free plan (docs/deploy.md). Needs `npx wrangler login` once.
# Safe to re-run after every merge: install, check, build with cards, make sure the photo KV namespace exists,
# migrate D1, sync changed pipeline rows, deploy with secrets, smoke test. Creates only free resources.
#
#   npm run deploy:production                     everything
#   SKIP_CHECK=1 npm run deploy:production        skip lint, type-check and tests (the build still type-checks)
#   SKIP_SEED=1 npm run deploy:production         keep the D1 data as it is (migrations still apply)
#   FORCE_SEED=1 npm run deploy:production        reseed even when seed/real.sql is unchanged
#   DEPLOY_ENV_DIR=<dir> npm run deploy:production  source every <dir>/*.env first (keys stay out of the repo)
#   npm run deploy:production -- --enable-places  build with the Places UI Kit on (default: always off)
#
# Inputs, from the environment or DEPLOY_ENV_DIR:
#   VITE_PLACES_ENABLED is ignored here: the build forces it to 0 unless --enable-places is passed.
#   VITE_GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_MAPS_BROWSER_KEY)  browser Maps key, baked into the web bundle.
#   OPENAI_API_KEY is never uploaded here: it must already be a Worker secret (checked first); set it by hand.
#   ANTHROPIC_API_KEY                                            optional, uploaded as a Worker secret when set.
# Generated once and kept: ADMIN_TOKEN and DEVICE_COOKIE_SECRET. A new ADMIN_TOKEN is written to
# worker/.dev.vars.production (gitignored, mode 600) and never printed.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORKER="$ROOT/worker"
WRANGLER=(npx wrangler)
PLACES_ENABLED=0
for arg in "$@"; do
  case "$arg" in
    --enable-places) PLACES_ENABLED=1 ;;
    *) echo "Unknown argument: $arg"; exit 2 ;;
  esac
done
step() { printf '\n== %s\n' "$*"; }

if [[ -n "${DEPLOY_ENV_DIR:-}" ]]; then
  for f in "$DEPLOY_ENV_DIR"/*.env; do
    [[ -e "$f" ]] || continue
    set -a
    # shellcheck disable=SC1090
    . "$f"
    set +a
  done
fi
unset OPENAI_API_KEY
export VITE_PLACES_ENABLED=$PLACES_ENABLED
step "Scan secret (OPENAI_API_KEY on the Worker)"
if ! DEPLOYED=$(cd "$WORKER" && "${WRANGLER[@]}" secret list --env production --format json 2>/dev/null); then
  echo "Could not list the Worker secrets; nothing was changed."
  exit 1
fi
if ! printf '%s' "$DEPLOYED" | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.exit(JSON.parse(s).some((x) => x.name === "OPENAI_API_KEY") ? 0 : 1))'; then
  echo "The Worker has no OPENAI_API_KEY secret: production scans (SCAN_AI_MODE=openai) would fail. Set it once with 'npx wrangler secret put OPENAI_API_KEY --env production'; nothing was changed."
  exit 1
fi
export VITE_GOOGLE_MAPS_API_KEY="${VITE_GOOGLE_MAPS_API_KEY:-${VITE_GOOGLE_MAPS_BROWSER_KEY:-}}"

step "Cloudflare account"
(cd "$WORKER" && "${WRANGLER[@]}" whoami 2>&1 | grep -E "Account ID|│ .* │ [0-9a-f]{32} │" || true)

if [[ -z "${SKIP_INSTALL:-}" ]]; then
  step "Install"
  (cd "$ROOT" && npm ci --no-audit --no-fund && npm ci --prefix apps/web --no-audit --no-fund && npm ci --prefix pipeline --no-audit --no-fund)
fi

step "Web build"
(cd "$ROOT" && npm run build --prefix apps/web)
step "Share cards"
(cd "$ROOT" && npm run cards)

if [[ -z "${SKIP_CHECK:-}" ]]; then
  step "Lint, type-check, tests"
  (cd "$ROOT" && npm run lint && npm run check && npm test && npm test --prefix apps/web && npm run check --prefix pipeline)
fi

step "Photo store (KV namespace wohin-photos)"
bash "$WORKER/scripts/ensure-photos-kv.sh"

step "D1 migrations (remote)"
(cd "$WORKER" && CI=1 "${WRANGLER[@]}" d1 migrations apply DB --env production --remote)

d1() { (cd "$WORKER" && "${WRANGLER[@]}" d1 execute DB --env production --remote --yes "$@"); }
if [[ -z "${SKIP_SEED:-}" ]]; then
  # Skip an unchanged seed altogether. A changed seed upserts only rows that need updates.
  step "D1 real-data seed (remote, syncs changed pipeline rows)"
  (cd "$WORKER" && npm run seed:build)
  SEED_SHA=$(shasum -a 256 "$WORKER/seed/real.sql" | cut -d' ' -f1)
  LIVE_SHA=$(d1 --json --command "CREATE TABLE IF NOT EXISTS deploy_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); SELECT value FROM deploy_meta WHERE key = 'seed_sha256'" 2>/dev/null \
    | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).at(-1)?.results?.[0]?.value ?? ""))')
  if [[ "$SEED_SHA" == "$LIVE_SHA" && -z "${FORCE_SEED:-}" ]]; then
    echo "seed unchanged ($SEED_SHA), skipped"
  else
    SEED_RESULT=$(d1 --file seed/real.sql)
    grep -E '"rows_written"' <<< "$SEED_RESULT" || true
    d1 --command "INSERT INTO deploy_meta (key, value) VALUES ('seed_sha256', '$SEED_SHA') ON CONFLICT (key) DO UPDATE SET value = excluded.value" >/dev/null
    echo "seeded $SEED_SHA"
  fi
fi

step "Secrets"
SECRETS=$(mktemp)
trap 'rm -f "$SECRETS"' EXIT
chmod 600 "$SECRETS"
# Keep what is set. A missing Worker (first deploy) has none; any other failure stops here, because
# regenerating DEVICE_COOKIE_SECRET would sign every guest out of their profile.
if ! EXISTING=$(cd "$WORKER" && "${WRANGLER[@]}" secret list --env production --format json 2>"$SECRETS"); then
  grep -q 'not found' "$SECRETS" || { cat "$SECRETS"; echo "Could not list the Worker secrets; nothing deployed."; exit 1; }
  EXISTING='[]'
fi
# shellcheck disable=SC2016 # JavaScript, not shell
EXISTING="$EXISTING" ADMIN_OUT="$WORKER/.dev.vars.production" node --input-type=module -e '
  import { randomBytes } from "node:crypto";
  import { writeFileSync, appendFileSync, existsSync } from "node:fs";
  let have = [];
  try { have = JSON.parse(process.env.EXISTING).map((s) => s.name); } catch {}
  const out = {};
  for (const k of ["ANTHROPIC_API_KEY"]) if (process.env[k]) out[k] = process.env[k];
  for (const k of ["ADMIN_TOKEN", "DEVICE_COOKIE_SECRET"]) {
    if (have.includes(k)) continue;
    out[k] = randomBytes(32).toString("base64url");
    if (k === "ADMIN_TOKEN") {
      const f = process.env.ADMIN_OUT;
      (existsSync(f) ? appendFileSync : writeFileSync)(f, `ADMIN_TOKEN=${out[k]}\n`, { mode: 0o600 });
    }
  }
  writeFileSync(process.argv[1], JSON.stringify(out));
  console.log("uploading: " + (Object.keys(out).join(", ") || "none (all kept)") + "; kept: " + (have.join(", ") || "none"));
' "$SECRETS"

step "Deploy"
mkdir -p "$WORKER/.wrangler"
(cd "$WORKER" && "${WRANGLER[@]}" deploy --env production --secrets-file "$SECRETS" 2>&1 | tee "$WORKER/.wrangler/last-deploy.log")
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$WORKER/.wrangler/last-deploy.log" | head -1)

step "Smoke test $URL"
# A first deploy can take a minute until workers.dev answers.
for _ in $(seq 1 24); do
  [[ $(curl -s -o /dev/null -w '%{http_code}' "$URL/api/health") == 200 ]] && break
  sleep 5
done
check() { # path expected-status
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL$1")
  printf '%-48s %s\n' "$1" "$code"
  [[ "$code" == "$2" ]]
}
fail=0
for p in / /map /impressum /datenschutz /api/health /api/kieze "/api/dishes/top?limit=3" /api/submissions/config; do
  check "$p" 200 || fail=1
done
curl -s "$URL/api/health"; echo
# Photo uploads need the PHOTOS binding; "daily_limit" is fine (the day's soft KV write budget is used up).
if curl -s "$URL/api/submissions/config" | grep -q '"uploadsPaused":"unavailable"'; then
  echo "Photo uploads are unavailable: the PHOTOS KV binding is missing"
  fail=1
fi
[[ $fail == 0 ]] || { echo "Smoke test failed"; exit 1; }
echo "Live: $URL"
