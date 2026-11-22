const labels = {
  bar: 'Bar',
  pub: 'Pub',
  nightclub: 'Nightclub',
  biergarten: 'Beer garden',
};

const quotas = { bar: 12, pub: 10, nightclub: 6, biergarten: 4 };
const addressFields = [
  'street', 'housenumber', 'housename', 'unit', 'place', 'postcode', 'quarter', 'suburb',
  'district', 'city', 'state', 'country', 'full', 'conscriptionnumber', 'streetnumber',
];
const publicAccess = new Set(['yes', 'public', 'permissive', 'customers']);
const collator = new Intl.Collator('en');
const excludedVenues = new Set([
  'node/558494289', // Celo Privat Bar, stale listing flagged as permanently closed
  'node/3826452472', // Privatclub The Jaxx, mapped as a cruising venue with restricted clientele
  'node/2721723184', // Drake's Cruising, venue with restricted clientele
  'node/5328215659', // Partyraum Köln, private event rental
]);
const excludedFromShortlist = new Set([
  'node/3826455881', // Pussy Cat, suggested hours last checked in 2024
]);
const monthSpecificHours = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const closedComment = /^"[^"\n]*\b(?:closed|geschlossen|gesloten|cerrado|fechado|zavřeno)\b[^"\n]*"$/iu;

function clean(value) {
  return value?.replace(/\s+/g, ' ').trim();
}

function distanceKm(first, second) {
  const averageLatitude = (first.lat + second.lat) * Math.PI / 360;
  const north = (first.lat - second.lat) * 111.2;
  const east = (first.lng - second.lng) * 111.2 * Math.cos(averageLatitude);
  return Math.hypot(north, east);
}

function readWebsite(tags) {
  for (const value of [tags.website, tags['contact:website']]) {
    const candidate = clean(value);
    if (!candidate || /\s/.test(candidate)) continue;
    const url = URL.parse(candidate);
    if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return candidate;
  }
}

function parseVenue(element) {
  const tags = element.tags ?? {};
  const name = clean(tags.name);
  const category = tags.amenity;
  const id = `${element.type}/${element.id}`;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!name || excludedVenues.has(id) || !Object.hasOwn(labels, category)
    || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const openingHours = clean(tags.opening_hours);
  const closed = openingHours && (closedComment.test(openingHours)
    || openingHours.split(';').every((rule) => /\b(?:closed|off)\.?\s*$/i.test(rule)));
  const inactive = ['disused', 'abandoned', 'demolished', 'was'].some((prefix) =>
    tags[prefix] === 'yes' || tags[`${prefix}:amenity`] === category,
  );
  if (closed || inactive || (tags.access && !publicAccess.has(tags.access))) return;

  const address = Object.fromEntries(addressFields.map((key) => [key, clean(tags[`addr:${key}`])]).filter(([, value]) => value));
  const website = readWebsite(tags);
  const spot = { id, name, lat, lng, category };
  if (openingHours) spot.opening_hours = openingHours;
  if (website) spot.website = website;
  if (Object.keys(address).length) spot.address = address;

  const outdoor = tags.outdoor_seating === 'yes';
  const liveMusic = tags.live_music === 'yes' || tags['music:live'] === 'yes'
    || /\b(?:live music|livemuziek)\b/i.test(tags.description ?? '');
  const jazzNights = /\bjazz nights\b/i.test(tags.description ?? '');
  const culture = liveMusic || jazzNights || tags.music === 'jazz' || /\bjazz\b/i.test(name);
  const mappedSchedule = /\d{1,2}:\d{2}|24\/7/.test(openingHours ?? '');
  const quality = (mappedSchedule ? 3 : 0) + (address.street ? 1 : 0)
    + (website ? 1 : 0) + (outdoor ? 0.5 : 0);
  const nameKey = name.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const genericName = /^(?:bar|pub|nightclub|club|biergarten|beergarden)$/i.test(nameKey);
  const seasonal = (tags.seasonal && tags.seasonal !== 'no') || monthSpecificHours.test(openingHours ?? '');
  const adultEntertainment = tags.adult === 'yes' || tags.darkroom === 'yes' || tags.cruising === 'yes'
    || tags.nightclub === 'stripclub' || tags.club === 'stripclub';
  const eligible = !genericName && !seasonal && !adultEntertainment
    && tags.reservation !== 'required' && !excludedFromShortlist.has(id);
  return { spot, nameKey, quality, outdoor, liveMusic, jazzNights, culture, eligible };
}

function uniqueVenues(candidates) {
  const byName = new Map();
  const unique = [];
  candidates.sort((a, b) => b.quality - a.quality || collator.compare(a.spot.id, b.spot.id));
  for (const candidate of candidates) {
    const { nameKey, spot } = candidate;
    const sameName = byName.get(nameKey) ?? [];
    if (sameName.some((other) => distanceKm(other.spot, spot) < 0.045)) continue;
    sameName.push(candidate);
    byName.set(nameKey, sameName);
    unique.push(candidate);
  }
  return unique;
}

function featureVenue({ spot, outdoor, liveMusic, jazzNights, culture }) {
  const { category, address } = spot;
  const vibes = [category === 'nightclub' ? 'club' : category === 'biergarten' ? 'chill' : 'bar'];
  if (outdoor && vibes[0] === 'bar') vibes.push('chill');
  if (culture) vibes.push('culture');

  const street = address?.street ? ` on ${address.street}` : '';
  const features = [];
  if (outdoor && category !== 'biergarten') features.push('outdoor seating');
  if (liveMusic) features.push('live music');
  else if (jazzNights) features.push('jazz nights');
  const details = features.length ? ` with ${features.join(' and ')}` : '';
  const description = `${labels[category]}${street}${details}`.replace(/\.?$/, '.');
  return { ...spot, curated: true, vibes, description };
}

export function curate(elements, districts) {
  const venues = uniqueVenues(elements.map(parseVenue).filter(Boolean));
  const remaining = new Set();
  for (const venue of venues.filter(({ eligible }) => eligible)) {
    const distances = districts.map(([lat, lng]) => distanceKm(venue.spot, { lat, lng }));
    const nearest = Math.min(...distances);
    if (nearest > 3) continue;
    remaining.add({ ...venue, district: distances.indexOf(nearest), rank: venue.quality - 2 * nearest });
  }

  const featured = [];
  const featuredIds = new Set();
  const districtCounts = districts.map(() => 0);
  const categoryCounts = { bar: 0, pub: 0, nightclub: 0, biergarten: 0 };
  let cultureCount = 0;
  const limit = Object.values(quotas).reduce((total, count) => total + count, 0);
  const score = (venue) => venue.rank - 0.35 * districtCounts[venue.district];
  const withinQuota = ({ spot }) => categoryCounts[spot.category] < quotas[spot.category];
  while (featured.length < limit && remaining.size) {
    const ranked = [...remaining].sort((a, b) =>
      score(b) - score(a) || collator.compare(a.spot.id, b.spot.id),
    );
    const culturePick = cultureCount < 2 && ranked.find((venue) => venue.culture && withinQuota(venue));
    const next = culturePick || ranked.find(withinQuota) || ranked[0];
    remaining.delete(next);
    featuredIds.add(next.spot.id);
    districtCounts[next.district] += 1;
    categoryCounts[next.spot.category] += 1;
    if (next.culture) cultureCount += 1;
    featured.push(featureVenue(next));
  }

  const uncurated = venues.filter(({ spot }) => !featuredIds.has(spot.id))
    .map(({ spot }) => ({ ...spot, curated: false }))
    .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id));
  return [...featured, ...uncurated];
}
