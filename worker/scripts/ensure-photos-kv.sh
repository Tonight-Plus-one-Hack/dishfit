#!/usr/bin/env bash
# Makes sure the production photo store exists: the Workers KV namespace "wohin-photos" (binding PHOTOS,
# worker/src/lib/photo-store.ts). Idempotent and free: KV is part of the Workers Free plan, and this only
# lists namespaces or creates this one. Called by deploy-production.sh; safe to run alone after `npx wrangler login`.
#
# - Namespace missing: creates it.
# - wrangler.jsonc still has the placeholder id: writes the real id into env.production (commit that change).
# - wrangler.jsonc has another id: stops, because the Worker would bind a namespace that is not "wohin-photos".
set -euo pipefail

WORKER=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CONFIG="$WORKER/wrangler.jsonc"
TITLE="${PHOTOS_KV_TITLE:-wohin-photos}"
PLACEHOLDER="<production-photos-kv-id>"
WRANGLER=(npx wrangler)

# The id of the namespace with this exact title, or nothing.
namespace_id() {
  (cd "$WORKER" && "${WRANGLER[@]}" kv namespace list) |
    TITLE="$TITLE" node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const list = JSON.parse(s.slice(s.indexOf("[")));
      console.log(list.find((n) => n.title === process.env.TITLE)?.id ?? "");
    })'
}

# The PHOTOS id in env.production of wrangler.jsonc (the first PHOTOS binding after "production").
config_id() {
  awk '/"production": *\{/ { prod = 1 } prod && /"binding": *"PHOTOS"/ { match($0, /"id": *"[^"]*"/); s = substr($0, RSTART, RLENGTH); sub(/"id": *"/, "", s); sub(/"$/, "", s); print s; exit }' "$CONFIG"
}

ID=$(namespace_id)
if [[ -z "$ID" ]]; then
  echo "creating KV namespace $TITLE (Workers Free, no cost)"
  (cd "$WORKER" && CI=1 "${WRANGLER[@]}" kv namespace create "$TITLE" >/dev/null)
  ID=$(namespace_id)
  [[ -n "$ID" ]] || { echo "KV namespace $TITLE was not created; nothing deployed."; exit 1; }
else
  echo "KV namespace $TITLE exists ($ID)"
fi

CURRENT=$(config_id)
if [[ "$CURRENT" == "$ID" ]]; then
  echo "wrangler.jsonc binds PHOTOS to $TITLE"
elif [[ "$CURRENT" == "$PLACEHOLDER" ]]; then
  # shellcheck disable=SC2016 # JavaScript, not shell
  ID="$ID" PLACEHOLDER="$PLACEHOLDER" node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(`"${process.env.PLACEHOLDER}"`, `"${process.env.ID}"`));
  ' "$CONFIG"
  [[ $(config_id) == "$ID" ]] || { echo "Could not write the PHOTOS id into wrangler.jsonc; nothing deployed."; exit 1; }
  echo "wrote the PHOTOS id into worker/wrangler.jsonc (env.production): commit it"
else
  echo "wrangler.jsonc binds PHOTOS to $CURRENT, but $TITLE is $ID; fix env.production in worker/wrangler.jsonc. Nothing deployed."
  exit 1
fi
