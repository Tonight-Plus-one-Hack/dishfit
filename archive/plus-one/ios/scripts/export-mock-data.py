"""Copy the curated OpenStreetMap spots into the iOS mock data layer, in the API contract shape.

Source: data/spots/*.json (PR https://github.com/Tonight-Plus-one-Hack/wohin/pull/3). When data/spots/ is not
checked out yet, the script reads the files from the git ref given with --ref (default origin/fm/t1-spots).
The mapping matches lane 3's seed (apps/api/scripts/seed-lib.ts) so the mock returns what GET /api/cities/:slug/spots
will return: curated rows only, `node/123` -> `osm-node-123`, category -> kind, street + number -> address,
suburb -> neighborhood (null when OpenStreetMap has none), description -> descriptionEn.

Usage: python3 apps/ios/scripts/export-mock-data.py [--ref origin/fm/t1-spots]
"""

import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "apps" / "ios" / "PlusOne" / "Resources" / "MockData"
SPOT_KINDS = {"bar", "pub", "nightclub", "biergarten", "cafe", "venue"}
GERMAN_CITY_NAMES = {
    "berlin": "Berlin",
    "hamburg": "Hamburg",
    "munich": "München",
    "cologne": "Köln",
    "amsterdam": "Amsterdam",
    "barcelona": "Barcelona",
    "lisbon": "Lissabon",
    "prague": "Prag",
}


def read(ref: str, relative: str):
    local = ROOT / relative
    if local.exists():
        return json.loads(local.read_text())
    blob = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{relative}"], check=True, capture_output=True)
    return json.loads(blob.stdout)


def text(value):
    value = (value or "").strip()
    return value or None


def website(raw):
    value = text(raw)
    if not value or len(value) > 300:
        return None
    return value if urlparse(value).scheme in ("http", "https") else None


def spot_id(osm_id: str) -> str:
    match = re.fullmatch(r"(node|way|relation)/(\d+)", osm_id)
    if not match:
        raise ValueError(f"Unexpected OpenStreetMap id: {osm_id}")
    return f"osm-{match[1]}-{match[2]}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", default="origin/fm/t1-spots")
    args = parser.parse_args()

    cities = []
    spots = []
    for index, city in enumerate(read(args.ref, "data/spots/cities.json")):
        slug = city["slug"]
        cities.append({
            "slug": slug,
            "name": GERMAN_CITY_NAMES[slug],
            "nameEn": city["name"],
            "countryCode": city["country"].upper(),
            "timezone": city["timezone"],
            "lat": city["lat"],
            "lng": city["lng"],
            "sortOrder": index + 1,
        })
        for row in read(args.ref, f"data/spots/{slug}.json"):
            if row.get("curated") is not True or row.get("category") not in SPOT_KINDS:
                continue
            address = row.get("address") or {}
            street = text(address.get("street"))
            spots.append({
                "id": spot_id(row["id"]),
                "citySlug": slug,
                "name": row["name"].strip(),
                "kind": row["category"],
                "vibes": row.get("vibes") or [],
                "descriptionDe": None,
                "descriptionEn": text(row.get("description")),
                "address": " ".join(p for p in (street, text(address.get("housenumber"))) if p) if street else None,
                "neighborhood": text(address.get("suburb")),
                "lat": row["lat"],
                "lng": row["lng"],
                "openingHours": text(row.get("opening_hours")),
                "website": website(row.get("website")),
                "source": "osm",
            })

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "cities.json").write_text(json.dumps(cities, ensure_ascii=False, indent=2) + "\n")
    (OUT / "spots.json").write_text(json.dumps(spots, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(cities)} cities, {len(spots)} curated spots -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
