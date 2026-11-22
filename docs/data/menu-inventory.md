# Berlin menu inventory

The 22 November local catalog contains 385 source menus and 12,710 first-party dishes. The healthy rule accepts 5,944 dishes across 384 listed restaurants. Each listed restaurant has a Google Place ID. Logo tiles are assigned to 260 restaurants, with first-party source URLs in the logo manifest.

The OSM snapshot contains 10,124 named restaurants, cafés and fast-food venues inside Berlin's 97 Ortsteil boundaries. Of those, 4,412 have a website tag. A free IDs-only grid across all 97 Ortsteile returned 8,379 distinct Google Place IDs. A Place ID match is required before a restaurant can enter the public catalog.

The live matching pass in Friedrichshain, Neukölln and Prenzlauer Berg assessed 2,010 OSM candidates and linked 1,183 to a Google Place ID. Of those, 1,086 met the existing rating threshold. The 158 Enterprise calls logged $5.53 at list price and stayed within the tracked free quota.

The crawl checked 48 newly matched restaurant sites. It verified first-party menus from Myxa, 21 gramm and Easy Peasy, producing 54 dishes with nutrition estimates and classifications. Fourteen passed the healthy rule. The local API listed Myxa and 21 gramm, both with confirmed Google photos. Easy Peasy's seven dishes are in the inventory. The expanded local D1 database holds 388 menus, 12,764 items, 5,958 healthy items and 386 listed restaurants.

A fresh Kreuzberg pilot read six official menus and loaded 609 items into a separate local D1 inventory. All 609 have nutrition estimates and classifications, and 306 passed the healthy rule. Across the nine fresh menu extractions and their nutrition and classification calls, the ledger recorded $1.59 in OpenAI usage.

## Expected D1 writes

Measurements used the generated seed and a local SQLite database with the Worker migrations.

| Starting catalog | Inventory migration | Incremental seed |
| --- | ---: | ---: |
| Current branch base, 385 menus | 12,710 inventory inserts | 260 logo URL updates |
| Older local copy, 310 menus | 10,153 inventory inserts | 5,469 table writes, plus index writes on newly seeded catalog rows |
| Rerun of the same seed | 0 | 0 |

Allow about **13,000 writes** when the deployed catalog already matches the branch base. The older local copy would require up to about **29,000 writes** including catalog indexes. The `menu_items` table has no secondary index, and the logo sync updates an unindexed column. Allow room for other D1 traffic before applying the migration and seed. [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

## Photos, logos and reviews

Google photos and reviews load in the existing Places UI Kit panel with Google attribution. The 22 November availability check confirmed at least one Google photo for each of the 384 places listed in the bundled seed. The interface uses the app's type and surface tokens through the UI Kit's supported styling properties. The restaurant records hold the Place ID. First-party logo tiles are deployed as static WebP assets. Existing dish confirmations use **Hat das gestimmt?**. [Google Places UI Kit styling](https://developers.google.com/maps/documentation/javascript/places-ui-kit/custom-styling)
