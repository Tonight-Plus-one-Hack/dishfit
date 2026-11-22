// DEMO DATA. Every hangout, nickname and line below is invented for the prototype.
// Spots are real OpenStreetMap venues from ./spots.ts; nothing here claims those venues host these plans.
import { CITIES } from './cities'
import { SPOTS } from './spots'
import { nextMorning, nightAt } from '../lib/time'
import type { Hangout, HangoutLanguage, Member, Message, Vibe } from './types'

const NICKNAMES = [
  'Mara', 'Jonas', 'Aylin', 'Theo', 'Sofia', 'Kenji', 'Lea', 'Omar', 'Noor', 'Felix', 'Ines', 'Luca',
  'Priya', 'Mateo', 'Hanna', 'Yusuf', 'Clara', 'Ravi', 'Elif', 'Nils', 'Zoe', 'Marco', 'Amara', 'Ben',
  'Saskia', 'Tomás', 'Yara', 'Emil', 'Julia', 'Kofi', 'Mina', 'Arjun', 'Lotte', 'Pablo', 'Freya', 'Sami',
]

/** The lines members pick in the join flow; stored as Member.about. */
export const ABOUT_LINES = [
  'Up for chill drinks',
  'Here for good talks',
  'Ready to dance later',
  'Open for anything',
] as const

/** Deterministic UUID-shaped ids so demo links stay stable across reloads. */
export function demoUuid(key: string): string {
  const hex: string[] = []
  let h = 2166136261
  for (let round = 0; hex.join('').length < 32; round++) {
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i) + round
      h = Math.imul(h, 16777619)
    }
    hex.push((h >>> 0).toString(16).padStart(8, '0'))
  }
  const x = hex.join('').slice(0, 32).split('')
  x[12] = '4'
  x[16] = '89ab'[parseInt(x[16], 16) % 4]
  const s = x.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

interface Seed {
  id: string
  spot: string
  title: string
  time: string
  max: number
  members: number[]
  vibe: Vibe
  language: HangoutLanguage
  note: string
}

const SEEDS: Record<string, Seed[]> = {
  berlin: [
    {
      id: 'berlin-manifest-starter',
      spot: 'Manifest Taproom',
      title: 'Craft beer, slow start',
      time: '18:45',
      max: 6,
      members: [2, 10, 14, 18, 22, 30],
      vibe: 'chill',
      language: 'en',
      note: 'A relaxed first round on Oderberger Straße before everyone heads their own way. No crawl, no pressure.',
    },
    {
      id: 'berlin-maclaren-afterwork',
      spot: 'MacLaren',
      title: 'After-work pints in Friedrichshain',
      time: '18:30',
      max: 8,
      members: [5, 9, 13, 21, 27],
      vibe: 'chill',
      language: 'en',
      note: 'Just finished work, new in town or both. We grab the long table by the window and keep it easy.',
    },
    {
      id: 'berlin-bijou-first-night',
      spot: 'Bijou Bar',
      title: 'First night in Berlin? Start here',
      time: '19:00',
      max: 6,
      members: [1, 4, 8, 12],
      vibe: 'bar',
      language: 'en',
      note:
        'For anyone who landed this week. Swap tips on neighborhoods, flats and where to go next, right by Monbijoupark.',
    },
    {
      id: 'berlin-lerchen-language',
      spot: 'Lerchen & Eulen',
      title: 'Language swap: English, German, Spanish',
      time: '19:30',
      max: 8,
      members: [17, 3, 25, 29, 33],
      vibe: 'bar',
      language: 'any',
      note: 'Half the evening in the language you are learning, half in the one you know. Beginners welcome.',
    },
    {
      id: 'berlin-platzwart-kicker',
      spot: 'Platzwart Kickerbar',
      title: 'Table football and a cold one',
      time: '20:00',
      max: 6,
      members: [6, 16, 24],
      vibe: 'culture',
      language: 'en',
      note: 'Mixed teams, nobody keeps score for long. If you have never played, even better.',
    },
    {
      id: 'berlin-vin-aqua-wine',
      spot: 'Vin Aqua Vin',
      title: 'Natural wine and long conversations',
      time: '20:30',
      max: 5,
      members: [11, 19, 31],
      vibe: 'bar',
      language: 'en',
      note: 'A small table on Weserstraße, a couple of bottles to share and room for two more people.',
    },
    {
      id: 'berlin-frannz-live',
      spot: 'Frannz Club',
      title: 'Live music, then see where the night goes',
      time: '21:00',
      max: 8,
      members: [7, 15, 20, 23, 28, 34],
      vibe: 'culture',
      language: 'en',
      note: 'We catch the band at Frannz and decide together what comes after. Leave whenever you like.',
    },
    {
      id: 'berlin-clarchens-dance',
      spot: 'Clärchens Ballhaus',
      title: 'Drinks first, dancing later',
      time: '21:30',
      max: 8,
      members: [3, 26, 32, 35],
      vibe: 'club',
      language: 'any',
      note: 'Meet at the bar of the old ballroom, warm up with a drink, then join the dance floor as a group.',
    },
    {
      id: 'berlin-bflat-jazz',
      spot: 'b-flat',
      title: 'Late jazz for the curious',
      time: '22:00',
      max: 6,
      members: [9, 36],
      vibe: 'chill',
      language: 'en',
      note: 'Two of us so far. One more and it happens. No jazz knowledge needed, just ears.',
    },
  ],
  hamburg: [
    {
      id: 'hamburg-le-fonque',
      spot: 'Le Fonque',
      title: 'Schanze warm-up',
      time: '19:30',
      max: 6,
      members: [2, 13, 21, 30],
      vibe: 'chill',
      language: 'en',
      note: 'A drink in the Schanzenviertel before the weekend crowd arrives.',
    },
    {
      id: 'hamburg-molotow',
      spot: 'Molotow',
      title: 'Indie night on the Reeperbahn',
      time: '22:00',
      max: 8,
      members: [7, 18, 23, 28, 34],
      vibe: 'club',
      language: 'en',
      note: 'Meet outside, go in together, dance as much or as little as you want.',
    },
    {
      id: 'hamburg-frau-moller',
      spot: 'Frau Möller',
      title: 'Lange Reihe pub chat',
      time: '20:00',
      max: 5,
      members: [1, 12, 25],
      vibe: 'bar',
      language: 'en',
      note: 'Easy conversation in a classic St. Georg pub.',
    },
  ],
  munich: [
    {
      id: 'munich-viktualienmarkt',
      spot: 'Biergarten am Viktualienmarkt',
      title: 'Early beer garden round',
      time: '18:30',
      max: 8,
      members: [4, 10, 16, 22, 26, 33],
      vibe: 'chill',
      language: 'en',
      note: 'Long tables, a Maß or a Spezi, and people who just moved here.',
    },
    {
      id: 'munich-monchalant',
      spot: 'Monchalant',
      title: 'Cocktails in Haidhausen',
      time: '21:00',
      max: 6,
      members: [5, 17, 29],
      vibe: 'bar',
      language: 'en',
      note: 'A quieter bar for people who want to actually talk.',
    },
  ],
  cologne: [
    {
      id: 'cologne-james-joyce',
      spot: 'James Joyce',
      title: 'Südstadt pub evening',
      time: '19:30',
      max: 6,
      members: [6, 14, 24, 31],
      vibe: 'chill',
      language: 'en',
      note: 'A relaxed start in the Südstadt. Kölsch or anything else.',
    },
    {
      id: 'cologne-bahnhof-ehrenfeld',
      spot: 'Club Bahnhof Ehrenfeld',
      title: 'Ehrenfeld club night',
      time: '23:00',
      max: 8,
      members: [3, 11, 19, 27, 35],
      vibe: 'club',
      language: 'en',
      note: 'Meet at the entrance, go in as a group.',
    },
  ],
  amsterdam: [
    {
      id: 'amsterdam-jazz-alto',
      spot: 'Jazz Cafe Alto',
      title: 'Jazz near Leidseplein',
      time: '21:30',
      max: 6,
      members: [8, 20, 32, 36],
      vibe: 'chill',
      language: 'en',
      note: 'Live sets every night. We grab a corner and listen.',
    },
    {
      id: 'amsterdam-cafe-zwart',
      spot: 'Café Zwart',
      title: 'Brown café on the Dam',
      time: '19:00',
      max: 5,
      members: [1, 9, 15],
      vibe: 'bar',
      language: 'en',
      note: 'One drink, real conversation, no phones on the table.',
    },
  ],
  barcelona: [
    {
      id: 'barcelona-bar-del-pla',
      spot: 'Bar del Pla',
      title: 'Vermouth hour in El Born',
      time: '20:00',
      max: 6,
      members: [2, 12, 22, 26],
      vibe: 'bar',
      language: 'en',
      note: 'Pre-dinner vermouth the local way.',
    },
    {
      id: 'barcelona-cerveseria-jazz',
      spot: 'Cerveseria Jazz',
      title: 'Poble-sec beers',
      time: '22:30',
      max: 8,
      members: [7, 13, 23, 29, 33],
      vibe: 'chill',
      language: 'any',
      note: 'Late start, as is tradition.',
    },
  ],
  lisbon: [
    {
      id: 'lisbon-duque',
      spot: 'Duque Brewpub',
      title: 'Craft beer below Bairro Alto',
      time: '19:30',
      max: 6,
      members: [4, 18, 28],
      vibe: 'chill',
      language: 'en',
      note: 'Small brewpub on the steps of Calçada do Duque.',
    },
    {
      id: 'lisbon-hot-club',
      spot: 'Hot Club Portugal',
      title: 'Jazz at Praça da Alegria',
      time: '22:00',
      max: 6,
      members: [10, 16, 30, 34],
      vibe: 'culture',
      language: 'en',
      note: 'One of the oldest jazz clubs in Europe. We meet at the door.',
    },
  ],
  // Prague has no plans yet, so the demo shows the empty city state that invites the first host.
  prague: [],
}

const MINUTE = 60_000

export const HANGOUTS: Hangout[] = []
export const MEMBERS: Member[] = []

for (const city of CITIES) {
  for (const seed of SEEDS[city.slug] ?? []) {
    const spot = SPOTS.find((s) => s.citySlug === city.slug && s.name === seed.spot)
    if (!spot) throw new Error(`Demo hangout ${seed.id} points at unknown spot ${seed.spot}`)
    const id = demoUuid(seed.id)
    const startsAt = nightAt(city.timezone, seed.time)
    const createdAt = new Date(Date.parse(startsAt) - 5 * 60 * MINUTE).toISOString()
    HANGOUTS.push({
      id,
      citySlug: city.slug,
      spotId: spot.id,
      startsAt,
      vibe: seed.vibe,
      maxSize: seed.max,
      language: seed.language,
      status: 'open',
      expiresAt: nextMorning(city.timezone),
      createdAt,
      title: seed.title,
      note: seed.note,
    })
    seed.members.forEach((n, i) => {
      MEMBERS.push({
        id: demoUuid(`${seed.id}:${n}`),
        hangoutId: id,
        nickname: NICKNAMES[(n - 1) % NICKNAMES.length],
        about: ABOUT_LINES[(n + i) % ABOUT_LINES.length],
        role: i === 0 ? 'host' : 'member',
        arrivedAt: null,
        joinedAt: new Date(Date.parse(createdAt) + i * 17 * MINUTE).toISOString(),
      })
    })
  }
}

// A few demo chat lines per plan, posted by the first members shortly after they joined.
const CHAT_LINES = [
  'Hi all! I’ll grab a table near the bar, look for the green jacket.',
  'Sounds good, see you there.',
  'First time at this place, happy to just follow along.',
  'Might be ten minutes late, keep me a seat.',
]

export const MESSAGES: Message[] = HANGOUTS.flatMap((h) => {
  const members = MEMBERS.filter((m) => m.hangoutId === h.id)
  return members.slice(0, Math.min(members.length, 3)).map((m, i) => ({
    id: demoUuid(`${m.id}:message`),
    hangoutId: h.id,
    memberId: m.id,
    authorNickname: m.nickname,
    body: CHAT_LINES[i],
    kind: 'text' as const,
    createdAt: new Date(Date.parse(m.joinedAt) + 4 * MINUTE).toISOString(),
  }))
})

const DEMO_IDS = new Set(HANGOUTS.map((h) => h.id))

/** Demo plans are labelled as demo in the UI; plans people start are not. */
export function isDemoHangout(id: string): boolean {
  return DEMO_IDS.has(id)
}
