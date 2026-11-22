# Berlin Google photo coverage

The D1 photo measurement checks published restaurants from the Kiez JSON files using Google Place Details (New) with the IDs-only fields `id,photos,movedPlaceId`. The web seed count uses the app's own data modules to measure place ID coverage before and after the healthy-dish listing filter. Each visible card requests its live photo from Places UI Kit, which handles Google and photographer attribution.

The baseline was measured on 21 November 2026 at 23:34 UTC, over 15 Kieze. All 309 published D1 restaurants had an existing place ID that resolved and returned at least one photo, with 4,823 healthy dishes listed. The baseline lookup used the free IDs-only SKU.

The new covers layer the Places UI Kit element over the dish's KI-Bild or icon on Entdecken when the browser has a Places UI Kit key and the restaurant has a place ID; the compact map card leaves the photo to the restaurant page. The dish art is a permanent base layer, so it stays visible wherever the element draws no photo: a place without photos, a failed load, no key. The photo shows the restaurant and can be opened with its attribution. The app stores place IDs and fetches photos and other Places content live.

Google documents the field masks, the Places UI Kit, and how the EEA terms apply. [Place Details fields](https://developers.google.com/maps/documentation/places/web-service/place-details) · [Places UI Kit](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details) · [EEA service terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)

## Before and after

The remeasurement finished on 22 November 2026 at 01:51 UTC over 385 D1 restaurants. All 385 place IDs resolved and returned at least one photo. The backfill found zero missing, moved or obsolete IDs, so it made no Text Search calls. The review afterwards removed one restaurant from the shipped data (Huy Khang in Tempelhof, whose only menu source was a delivery platform). The figures below are the 01:51 measurement minus that restaurant and its 9 listed healthy dishes. They were not remeasured, since the removal cannot change the other 384 place IDs.

| Published seed | Before | After |
|---|---:|---:|
| Kieze with restaurants | 15 | 27 |
| Restaurants with a place ID | 309 | 384 |
| Restaurants with at least one Google photo | 309 of 309 | 384 of 384 |
| Healthy dishes listed | 4,823 | 5,944 |

The seed adds 75 restaurants and 1,121 healthy dishes in 12 Kieze. Each added restaurant had a confirmed Google photo before export.

| New Kiez | Restaurants | Healthy dishes |
|---|---:|---:|
| Friedenau | 5 | 86 |
| Gesundbrunnen | 3 | 33 |
| Köpenick | 7 | 68 |
| Lichterfelde | 7 | 128 |
| Mariendorf | 5 | 60 |
| Marzahn | 5 | 108 |
| Moabit | 8 | 120 |
| Pankow | 7 | 97 |
| Tegel | 10 | 149 |
| Tempelhof | 6 | 95 |
| Wedding | 6 | 100 |
| Weißensee | 6 | 77 |

## What the browser serves

The browser bundles 10 hand-checked spike records and the Kiez files. It keeps the spike record when both describe the same OSM element and serves restaurants with at least two healthy dishes. The counts compare the production web seed on `main` with the expanded branch and exclude test fixtures.

| Bundled web restaurant records | Before | After |
|---|---:|---:|
| Spike records | 10 | 10 |
| Kiez-file records | 310 | 385 |
| Kiez-file records dropped because a spike record has the same OSM element | 1 | 1 |
| **Bundled records** | **319** | **394** |
| With a place ID | 309 | 385 |
| Without a place ID | 10 | 9 |
| **Served with a place ID** | **308 of 311** | **384 of 386** |

Feinberg's now takes its verified place ID from the matching Kiez record. The two served records without an ID are Dean & David and Viet Bowl. Lia's Kitchen and six other bundled spike records fall below the healthy-dish listing threshold.

An attempt to look up Dean & David, Lia's Kitchen and Viet Bowl on 22 November 2026 stopped at the quota guard after the daily Text Search Pro budget reached 400 calls. The two served restaurants without an ID retain their dish artwork. The photo-coverage command measures the D1 seed.

Google covers on Karte and Entdecken and the attributed photo lightbox were spot-checked in Chrome with a browser key. A full measurement of rendered photos is unavailable.

## Berlin discovery

The citywide run builds on the wave already shipped under the name Wave 4, so the added Ortsteile are Wave 5. The pipeline selects waves 1-4 by default, Wave 5 with `--wave 5` and all 97 Ortsteile with `--kiez all`. The new discovery boundaries are the 97 Berlin Ortsteile. The IDs-only Text Search probe uses 15 healthy-food search terms and subdivides saturated searches. The live menu run prioritizes the unpublished Ortsteile with the largest OSM venue counts. It matches Google place IDs to OSM positions and names. In a targeted lookup for an unmatched OSM candidate, the name similarity must be at least 0.6 and the distance under 150 m. The paid batch behind the figures below ran those lookups with a 4.5 server-side rating floor and the Pro fields; the pipeline now reads the rating and applies the 4.3 rule, so a rerun can find places rated 4.3 to 4.4 that the batch skipped, and its Enterprise-priced lookups are unmeasured.

The pipeline reads menu pages, PDFs and images from restaurant websites and checks robots.txt before crawling. The existing healthy criteria stay in effect. A full meal must have at most 750 kcal, at least 20 g protein and at least 15% of calories from protein. A restaurant needs at least two passing dishes and the new export requires a live photo on its place ID. Community scans remain available as another source. [© OpenStreetMap-Mitwirkende, ODbL](https://www.openstreetmap.org/copyright)

The field-mask probe covered all 97 Ortsteile. In the 85 Ortsteile outside the live menu batch, it counted 3,740 candidate IDs across Kieze and estimated up to 719 paid search pages (priced at the Pro SKU in the probe, before the Pro term mode was removed, so the Enterprise page count and cost for the same terms are unmeasured) and 2,560 individual OSM lookups for a later pass. Counts can include overlapping search rectangles, and term matches would remove some OSM lookups. A separate Overpass query found 723 cafés with qualifying cuisine or diet tags across Berlin. The paid batch used cached OSM restaurant and fast-food rows, so the café count is discovery evidence only.

## Costs and quota

| Service | Metered calls | Logged USD |
|---|---:|---:|
| OpenAI menu extraction, translation, nutrition, classification and checks | 316 | 18.50 |
| Places Text Search Pro | 400 | 12.80 at list price |
| Places Details Enterprise for restaurant website lookup | 57 | 1.14 at list price |

The ledger figures are the historical spend as observed and still include the menu extraction for Huy Khang, which is no longer in the data. The scan used the configured daily Text Search Pro allowance of 400 calls. The monthly guard stops at 80% of each SKU’s free allowance. Based on tracked usage, the Google calls stayed within the free allowance. IDs-only discovery and photo measurements used free fields. The remaining menu work used the matches already collected, and OpenAI usage and Places list-price estimates went into the shared spend ledger. [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)

## Verification

Verification covers the web build, lint, type checks, unit tests, a local seed load against the Worker migrations, and the desktop and phone end-to-end flows.
