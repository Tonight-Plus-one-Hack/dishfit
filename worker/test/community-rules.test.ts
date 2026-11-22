import { describe, expect, it } from "vitest";
import { metadataBlocks, sniffPhotoType, stripPhotoMetadata } from "../src/community/image";
import { decide, nameSimilarity, REASONS, type History, type MenuReading, type RestaurantFacts } from "../src/community/rules";
import { jpegWithExif, pngWithExif, webpWithExif } from "./community-fixtures";

const reading = (over: Partial<MenuReading> = {}): MenuReading => ({
  isMenu: true,
  nameOnMenu: "Pho Saigon",
  cuisine: "vietnamese",
  faces: false,
  inappropriate: false,
  legibility: "high",
  dishes: [
    { name: "Pho Bo", priceEur: 12.5 },
    { name: "Bun Cha", priceEur: 11.9 },
    { name: "Sommerrollen", priceEur: 6.5 },
    { name: "Curry", priceEur: 13 },
  ],
  ...over,
});
const known = (over: Partial<RestaurantFacts> = {}): RestaurantFacts => ({
  name: "Pho Saigon Restaurant",
  known: true,
  isNew: false,
  cuisines: ["vietnamese"],
  kiez: null,
  nearbySameName: null,
  ...over,
});
const prices = (p: (number | null)[]) => reading({ dishes: p.map((priceEur, i) => ({ name: `Dish ${i}`, priceEur })) });
const fresh: History = { samePhoto: false, overlapShare: 0 };
const ok = { flaggedShare: 0 };

describe("review decision rules", () => {
  it("publishes a clear, matching, new menu with high confidence", () => {
    expect(decide(reading(), known(), fresh, ok)).toEqual({ outcome: "publish", confidence: "high", reason: null, notes: [] });
  });

  it("rejects faces, inappropriate content and photos that are not a menu, with a reason", () => {
    expect(decide(reading({ faces: true }), known(), fresh, ok)).toMatchObject({ outcome: "reject", reason: REASONS.faces });
    expect(decide(reading({ inappropriate: true }), known(), fresh, ok)).toMatchObject({ outcome: "reject", reason: REASONS.inappropriate });
    expect(decide(reading({ isMenu: false }), known(), fresh, ok)).toMatchObject({ outcome: "reject", reason: REASONS.notMenu });
    expect(decide(reading({ dishes: reading().dishes.slice(0, 2) }), known(), fresh, ok)).toMatchObject({ outcome: "reject", reason: REASONS.notMenu });
  });

  it("rejects duplicates: the same photo, or a menu that is already online", () => {
    expect(decide(reading(), known(), { samePhoto: true, overlapShare: 0 }, ok)).toMatchObject({ outcome: "reject", reason: REASONS.samePhoto });
    expect(decide(reading(), known(), { samePhoto: false, overlapShare: 0.8 }, ok)).toMatchObject({ outcome: "reject", reason: REASONS.alreadyOnline });
    expect(decide(reading(), known(), { samePhoto: false, overlapShare: 0.4 }, ok)).toMatchObject({ outcome: "review" });
  });

  it("rejects a menu of another restaurant and asks the team about a partial name match", () => {
    expect(decide(reading({ nameOnMenu: "Burger Palast" }), known(), fresh, ok)).toMatchObject({
      outcome: "reject",
      reason: REASONS.otherRestaurant("Burger Palast"),
    });
    const partial = decide(reading({ nameOnMenu: "Saigon Street Kitchen Mitte" }), known({ name: "Saigon Deli" }), fresh, ok);
    expect(partial.outcome).toBe("review");
    expect(partial.notes.join()).toContain("teilweise");
  });

  it("asks the team when the cuisine does not fit or no name is printed and the cuisine is unknown", () => {
    expect(decide(reading({ cuisine: "pizza" }), known(), fresh, ok)).toMatchObject({ outcome: "review" });
    expect(decide(reading({ nameOnMenu: null }), known(), fresh, ok)).toMatchObject({ outcome: "publish" });
    expect(decide(reading({ nameOnMenu: null, cuisine: null }), known(), fresh, ok)).toMatchObject({ outcome: "review" });
  });

  it("checks prices: mostly implausible rejects, some odd or few prices go to the team", () => {
    expect(decide(prices([0.1, 250, 300, 12]), known(), fresh, ok)).toMatchObject({ outcome: "reject", reason: REASONS.prices });
    expect(decide(prices([120, 12, 11, 10]), known(), fresh, ok)).toMatchObject({ outcome: "review" });
    expect(decide(prices([null, null, null, 10]), known(), fresh, ok)).toMatchObject({ outcome: "review", confidence: "medium" });
  });

  it("sends flagged nutrition, low legibility, unknown and new restaurants to the team", () => {
    expect(decide(reading(), known(), fresh, { flaggedShare: 0.5 })).toMatchObject({ outcome: "review" });
    expect(decide(reading({ legibility: "low" }), known(), fresh, ok)).toMatchObject({ outcome: "review", confidence: "low" });
    expect(decide(reading(), known({ known: false }), fresh, ok).notes).toContain("Restaurant nicht in der Datenbank");
    const added = decide(reading(), known({ known: false, isNew: true, kiez: "mitte", nearbySameName: "Pho Saigon" }), fresh, ok);
    expect(added.outcome).toBe("review");
    expect(added.notes.join()).toContain("Neues Restaurant");
  });

  it("rejects a new restaurant outside our Kieze", () => {
    expect(decide(reading(), known({ known: false, isNew: true, kiez: null }), fresh, ok)).toMatchObject({ outcome: "reject", reason: REASONS.outsideKieze });
  });

  it("compares names without accents, legal forms and filler words", () => {
    expect(nameSimilarity("Café Müller GmbH", "cafe muller")).toBe(1);
    expect(nameSimilarity("Pho Saigon", "Burger Palast")).toBe(0);
  });
});

describe("photo checks", () => {
  it("detects the type from magic bytes", () => {
    expect(sniffPhotoType(jpegWithExif())).toBe("image/jpeg");
    expect(sniffPhotoType(pngWithExif())).toBe("image/png");
    expect(sniffPhotoType(webpWithExif())).toBe("image/webp");
    expect(sniffPhotoType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });

  it("strips Exif/GPS blocks from JPEG, PNG and WebP and keeps the image data", () => {
    for (const [type, bytes] of [
      ["image/jpeg", jpegWithExif()],
      ["image/png", pngWithExif()],
      ["image/webp", webpWithExif()],
    ] as const) {
      expect(metadataBlocks(bytes, type).length).toBeGreaterThan(0);
      const clean = stripPhotoMetadata(bytes, type);
      expect(metadataBlocks(clean, type)).toEqual([]);
      expect(new TextDecoder().decode(clean)).not.toContain("GPS");
      expect(new TextDecoder().decode(clean)).toContain("PIXELS");
      expect(sniffPhotoType(clean)).toBe(type);
    }
  });

  it.each([
    ["image/jpeg", jpegWithExif()],
    ["image/png", pngWithExif()],
    ["image/webp", webpWithExif()],
  ] as const)("rejects an incomplete %s container", (type, bytes) => {
    expect(() => stripPhotoMetadata(bytes.subarray(0, bytes.length - 2), type)).toThrow();
  });

  it("rejects a PNG whose dimensions exceed the photo limit", () => {
    const bytes = pngWithExif();
    new DataView(bytes.buffer).setUint32(16, 10_000);
    expect(() => stripPhotoMetadata(bytes, "image/png")).toThrow("Unsupported photo dimensions");
  });

  it("removes JPEG bytes that are appended after the end marker", () => {
    const photo = jpegWithExif();
    const suffix = new TextEncoder().encode("trailing metadata");
    const full = new Uint8Array(photo.length + suffix.length);
    full.set(photo);
    full.set(suffix, photo.length);
    expect(stripPhotoMetadata(full, "image/jpeg")).toEqual(stripPhotoMetadata(photo, "image/jpeg"));
  });

  it("removes JPEG annotations found after the first scan", () => {
    const photo = jpegWithExif();
    const comment = new Uint8Array([0xff, 0xfe, 0, 5, 65, 66, 67]);
    const full = new Uint8Array(photo.length + comment.length);
    full.set(photo.subarray(0, -2));
    full.set(comment, photo.length - 2);
    full.set(photo.subarray(-2), full.length - 2);
    expect(stripPhotoMetadata(full, "image/jpeg")).toEqual(stripPhotoMetadata(photo, "image/jpeg"));
  });
});
