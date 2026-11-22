import type { LatLng } from "./model";

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters (haversine), rounded to the meter. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** A box that contains every point within radiusM of center, for a cheap SQL prefilter. */
export function boundingBox(center: LatLng, radiusM: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusM / METERS_PER_DEGREE;
  // Longitude degrees are shortest at the box edge nearest a pole, so size the box there.
  const edgeLat = Math.min(89.9, Math.abs(center.lat) + dLat);
  const dLng = radiusM / (METERS_PER_DEGREE * Math.cos(toRad(edgeLat)));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

/** Grams of protein per euro, one decimal; null without a positive price. */
export function proteinPerEuro(proteinG: number, priceCents: number | null): number | null {
  if (priceCents === null || priceCents <= 0) return null;
  return Math.round((proteinG * 1000) / priceCents) / 10;
}
