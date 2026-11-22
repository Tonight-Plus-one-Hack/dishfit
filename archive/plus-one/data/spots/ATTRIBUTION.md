# Spot data attribution

[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

The venue data comes from [OpenStreetMap](https://www.openstreetmap.org/copyright), is retrieved through the public Overpass API, and is licensed under the [Open Database License 1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
Export date (UTC) is 2026-11-21.
The Overpass instance reported an OpenStreetMap data timestamp of 2026-11-20 at 21:21:21 UTC.
Display the linked attribution wherever the application presents these spots.

Each city JSON file contains the qualifying extract inside that city's OpenStreetMap administrative boundary.
Rows with `curated: true` are the suggested meetup spots and appear first.
The shortlist favors central nightlife districts, mapped opening hours, and a mix of venue categories.
Vibe tags use mapped venue types, outdoor seating, and music information.
Opening hours are OpenStreetMap values as of the export date and may change.

Run `node scripts/spots/export.mjs` to refresh all eight cities or specify city slugs to refresh a subset, for example `node scripts/spots/export.mjs berlin`.
Use Node.js 22.1 or newer and run one instance at a time.
The exporter queries each selected city once, waits five seconds between calls, and stops on API errors.
Use `--cache-dir /path/to/raw` to save the Overpass responses outside the repository and add `--offline` to regenerate from them locally.
Update the export date and OpenStreetMap data timestamp when refreshing the checked-in snapshots.
