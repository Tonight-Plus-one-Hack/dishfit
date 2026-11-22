/**
 * Berlin Kiez shards. The pipeline works one Kiez at a time (wave 1 first),
 * and the app filters by Kiez.
 */
export const KIEZE = [
  { slug: "mitte", name: "Mitte", wave: 1 },
  { slug: "kreuzberg", name: "Kreuzberg", wave: 1 },
  { slug: "prenzlauer-berg", name: "Prenzlauer Berg", wave: 1 },
  { slug: "friedrichshain", name: "Friedrichshain", wave: 1 },
  { slug: "neukoelln", name: "Neukölln", wave: 1 },
  { slug: "charlottenburg", name: "Charlottenburg", wave: 2 },
  { slug: "schoeneberg", name: "Schöneberg", wave: 2 },
  { slug: "wedding", name: "Wedding", wave: 2 },
  { slug: "moabit", name: "Moabit", wave: 2 },
  { slug: "wilmersdorf", name: "Wilmersdorf", wave: 2 },
  { slug: "pankow", name: "Pankow", wave: 3 },
  { slug: "tempelhof", name: "Tempelhof", wave: 3 },
  { slug: "steglitz", name: "Steglitz", wave: 4 },
  { slug: "zehlendorf", name: "Zehlendorf", wave: 4 },
  { slug: "treptow", name: "Treptow", wave: 4 },
  { slug: "lichtenberg", name: "Lichtenberg", wave: 4 },
  { slug: "spandau", name: "Spandau", wave: 4 },
  { slug: "reinickendorf", name: "Reinickendorf", wave: 4 },
  { slug: "tiergarten", name: "Tiergarten", wave: 4 },
  { slug: "friedenau", name: "Friedenau", wave: 5 },
  { slug: "gesundbrunnen", name: "Gesundbrunnen", wave: 5 },
  { slug: "koepenick", name: "Köpenick", wave: 5 },
  { slug: "lichterfelde", name: "Lichterfelde", wave: 5 },
  { slug: "mariendorf", name: "Mariendorf", wave: 5 },
  { slug: "marzahn", name: "Marzahn", wave: 5 },
  { slug: "tegel", name: "Tegel", wave: 5 },
  { slug: "weissensee", name: "Weißensee", wave: 5 },
] as const;

export type Kiez = (typeof KIEZE)[number];
export type KiezSlug = Kiez["slug"];

const SLUGS: ReadonlySet<string> = new Set(KIEZE.map((k) => k.slug));

export function isKiezSlug(value: string): value is KiezSlug {
  return SLUGS.has(value);
}
