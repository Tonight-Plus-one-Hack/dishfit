import { describe, expect, it } from "vitest";
import {
  boundingBox,
  distanceMeters,
  isKiezSlug,
  isOpenAt,
  KIEZE,
  minuteOfWeek,
  normalizeDishName,
  parseAppRoute,
  parseRestaurantsQuery,
  parseTopDishesQuery,
  proteinPerEuro,
  stripMenuNumber,
  topDishesSearchParams,
  type OpeningHours,
} from "../src";

// 2026-11-23 is a Monday. Berlin is UTC+1 in November.
const berlin = (iso: string) => new Date(`${iso}+01:00`);

describe("opening hours", () => {
  const lunchAndLate: OpeningHours = {
    periods: [
      { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 15, minute: 0 } },
      // Friday 18:00 to Saturday 02:00
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
      // Saturday 22:00 to Sunday 04:00 (wraps the week)
      { open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 4, minute: 0 } },
    ],
  };

  it("reads Berlin local time", () => {
    expect(minuteOfWeek(berlin("2026-11-23T11:30:00"))).toBe(1 * 1440 + 11 * 60 + 30);
    expect(minuteOfWeek(new Date("2026-11-22T23:30:00Z"))).toBe(1 * 1440 + 30);
  });

  it.each([
    ["2026-11-23T11:29:00", false],
    ["2026-11-23T11:30:00", true],
    ["2026-11-23T14:59:00", true],
    ["2026-11-23T15:00:00", false],
    ["2026-11-27T23:00:00", true],
    ["2026-11-28T01:59:00", true],
    ["2026-11-28T02:00:00", false],
    ["2026-11-28T23:00:00", true],
    ["2026-11-29T03:59:00", true],
    ["2026-11-29T04:00:00", false],
  ])("%s open: %s", (at, open) => {
    expect(isOpenAt(lunchAndLate, berlin(at))).toBe(open);
  });

  it("treats a period without close as always open and unknown hours as null", () => {
    expect(isOpenAt({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] }, berlin("2026-11-25T03:00:00"))).toBe(true);
    expect(isOpenAt(null, new Date())).toBeNull();
    expect(isOpenAt({ periods: [] }, new Date())).toBeNull();
  });
});

describe("geo", () => {
  it("measures distances and boxes", () => {
    const alex = { lat: 52.5219, lng: 13.4132 };
    const brandenburgerTor = { lat: 52.5163, lng: 13.3777 };
    expect(distanceMeters(alex, brandenburgerTor)).toBeGreaterThan(2400);
    expect(distanceMeters(alex, brandenburgerTor)).toBeLessThan(2500);
    expect(distanceMeters(alex, alex)).toBe(0);
    const box = boundingBox(alex, 1000);
    expect(box.minLat).toBeLessThan(alex.lat);
    expect(box.maxLng).toBeGreaterThan(alex.lng);
    expect(distanceMeters(alex, { lat: box.maxLat, lng: alex.lng })).toBe(1000);
  });

  it("computes protein per euro", () => {
    expect(proteinPerEuro(42, 1190)).toBe(3.5);
    expect(proteinPerEuro(30, null)).toBeNull();
    expect(proteinPerEuro(30, 0)).toBeNull();
  });
});

describe("query strings", () => {
  it("round-trips the top dishes query", () => {
    const query = { maxPriceCents: 1200, minProteinG: 30, kiez: "kreuzberg" as const, near: { lat: 52.5, lng: 13.4 }, radiusM: 2000, openNow: true, sort: "protein" as const, limit: 10 };
    const parsed = parseTopDishesQuery(topDishesSearchParams(query));
    expect(parsed).toEqual({ ok: true, value: { ...query, maxKcal: undefined } });
  });

  it.each([
    "kiez=atlantis",
    "lat=52.5",
    "lat=91&lng=13",
    "radiusM=500",
    "maxPriceCents=-1",
    "limit=500",
    "sort=random",
  ])("rejects %s", (qs) => {
    expect(parseTopDishesQuery(new URLSearchParams(qs)).ok).toBe(false);
  });

  it("parses restaurant filters", () => {
    expect(parseRestaurantsQuery(new URLSearchParams("kiez=mitte&openNow=1"))).toEqual({
      ok: true,
      value: { kiez: "mitte", near: undefined, radiusM: undefined, openNow: true },
    });
  });

  it("keeps earlier Kieze and accepts the Berlin expansion in catalog queries", () => {
    expect(KIEZE.filter((k) => k.wave === 1).map((k) => k.slug)).toEqual(["mitte", "kreuzberg", "prenzlauer-berg", "friedrichshain", "neukoelln"]);
    expect(KIEZE.filter((k) => k.wave < 5)).toHaveLength(19);
    expect(parseRestaurantsQuery(new URLSearchParams("kiez=marzahn"))).toMatchObject({ ok: true, value: { kiez: "marzahn" } });
    expect(isKiezSlug("neukoelln")).toBe(true);
    expect(isKiezSlug("Neukölln")).toBe(false);
  });
});

describe("stripMenuNumber (real seed dish names)", () => {
  it.each([
    ["13. Sashimi Sass", "Sashimi Sass"],
    ["08. Papaya Paradise", "Papaya Paradise"],
    ["1. Edamame", "Edamame"],
    ["30.Berlin Bowl", "Berlin Bowl"],
    ["789 Spezialsuppe", "Spezialsuppe"],
    ["17A. Scharfer Mango Salat", "Scharfer Mango Salat"],
    ["V5a. Bun Thit Xao Xa Ot", "Bun Thit Xao Xa Ot"],
    ["V3B. Viet Papaya Salat", "Viet Papaya Salat"],
    ["A7 Pho Ha Noi – A. Tofu", "Pho Ha Noi – A. Tofu"],
    ["M1. Chicken Nanban 宮崎名物 チキン南蛮 定食", "Chicken Nanban 宮崎名物 チキン南蛮 定食"],
    ["B4-Tempeh Würfel im Wok geschwenkt", "Tempeh Würfel im Wok geschwenkt"],
    ["h1. red fish", "red fish"],
    ["1 Saté (2 Stk.)", "Saté (2 Stk.)"],
    ["20 Edamame", "Edamame"],
    ["18. PHO CHUA / 20. BUN CHUA", "PHO CHUA / BUN CHUA"],
    ["26. PHO XAO/ 27. MIEN XAO / 700. UDON XAO", "PHO XAO/ MIEN XAO / UDON XAO"],
    ["Nr. 5 Hähnchen Bowl", "Hähnchen Bowl"],
    ["M3 4 Spieße", "4 Spieße"],
    ["4.  Pho Ha Noi – M. Huhn/Rind/Garnelen  ", "Pho Ha Noi – M. Huhn/Rind/Garnelen  "],
  ])("%s -> %s", (raw, expected) => {
    expect(stripMenuNumber(raw)).toBe(expected);
  });

  it.each([
    "3er Kombo vom Rind",
    "5er Spezial-Kombo vom Rind [roh + gegart]",
    "4Stagioni",
    "5 Stk. BBQ Wings",
    "6 Stk. Boneless Bites",
    "2 Eier in pikantem Tomaten-Paprika-Ragout",
    "Beirut-der-70er-Platte",
    "Pho Ha Noi – M. Huhn/Rind/Garnelen",
    "C1",
    "M10",
    "1/2 Ente",
    "1/4 Brandenburger Bauernente",
    "Sake 1/2 Aburi Menü",
    "4 Spieße",
    "3 x Misto alla Griglia",
    "M1 ( 24 Stk. / 24 pcs. )",
    "3 Merguez vom Grill",
    "3 Merguez vom Grill (3 Stk.)",
    "3 PUTENMEDAILLONS",
    "6 St. Crispy Chicken Nuggets",
    "2 für 1 Gyoza Chicken",
  ])("keeps %s", (name) => {
    expect(stripMenuNumber(name)).toBe(name);
  });

  it("dedupes a numbered and an unnumbered copy of one dish", () => {
    expect(normalizeDishName("13. Sashimi Sass")).toBe(normalizeDishName("Sashimi Sass"));
  });
});

describe("app routes", () => {
  it("opens the map at the start page and keeps /map as an alias", () => {
    expect(parseAppRoute("/")).toEqual({ name: "map" });
    expect(parseAppRoute("/map")).toEqual({ name: "map" });
    expect(parseAppRoute("/map/")).toEqual({ name: "map" });
  });

  it("serves Discover at /entdecken", () => {
    expect(parseAppRoute("/entdecken")).toEqual({ name: "home" });
    expect(parseAppRoute("/entdecken/x")).toEqual({ name: "notFound" });
  });
});
