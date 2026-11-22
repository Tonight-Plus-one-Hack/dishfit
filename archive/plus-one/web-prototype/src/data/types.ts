// Mirrors the API contract (packages/shared/src/contract.ts on be/l1-skeleton). Field names match the contract
// exactly so src/data/api.ts can switch from mocks to fetch() without screen changes.
// Fields marked PROPOSED are not in the contract yet.

export const VIBES = ['bar', 'club', 'chill', 'culture'] as const
export const SPOT_KINDS = ['bar', 'pub', 'nightclub', 'biergarten', 'cafe', 'venue'] as const
export const HANGOUT_LANGUAGES = ['de', 'en', 'es', 'fr', 'it', 'tr', 'any'] as const
/** Travel partners reachable through GET /go/:brand. */
export const BRANDS = ['expedia', 'hotels', 'vrbo', 'layla'] as const
/** Share channels, also sent as utm_medium on shared links. */
export const SHARE_CHANNELS = ['native', 'whatsapp', 'copy', 'story'] as const
export const REPORT_TARGETS = ['hangout', 'message', 'member'] as const
export const REPORT_REASONS = ['harassment', 'spam', 'unsafe', 'inappropriate', 'other'] as const
/** "text" is a chat message; "arrived" is the "I'm here" check-in. */
export const MESSAGE_KINDS = ['text', 'arrived'] as const

export const MIN_GROUP_SIZE = 3
export const MAX_GROUP_SIZE = 8
export const NICKNAME_MAX = 24
export const ABOUT_MAX = 140
export const MESSAGE_MAX = 500
export const REPORT_DETAILS_MAX = 500
/** A message is hidden for everyone once this many devices reported it. */
export const MESSAGE_HIDE_REPORT_THRESHOLD = 2
/** A hangout is hidden once this many devices reported it. */
export const HANGOUT_HIDE_REPORT_THRESHOLD = 3
export const MEMBER_PREVIEW_MAX = 5

export type Vibe = (typeof VIBES)[number]
export type SpotKind = (typeof SPOT_KINDS)[number]
export type HangoutLanguage = (typeof HANGOUT_LANGUAGES)[number]
export type HangoutStatus = 'open' | 'cancelled' | 'hidden'
export type MemberRole = 'host' | 'member'
export type Brand = (typeof BRANDS)[number]
export type ShareChannel = (typeof SHARE_CHANNELS)[number]
export type ReportTarget = (typeof REPORT_TARGETS)[number]
export type ReportReason = (typeof REPORT_REASONS)[number]
export type MessageKind = (typeof MESSAGE_KINDS)[number]
/** Event names the client may send to POST /api/events. */
export type ClientEventName = 'city_view' | 'spots_view' | 'hangout_view' | 'share_click' | 'lang_switch'

export interface City {
  slug: string
  name: string
  nameEn: string | null
  countryCode: string
  /** IANA zone; "tonight" is computed in this zone. */
  timezone: string
  sortOrder: number
  /** Map centre (contract delta: nullable). */
  lat: number | null
  lng: number | null
}

/** A curated, public meeting spot. */
export interface Spot {
  /** Stable OSM id, e.g. osm-node-966975630. */
  id: string
  citySlug: string
  name: string
  kind: SpotKind
  vibes: Vibe[]
  descriptionDe: string | null
  descriptionEn: string | null
  address: string | null
  /** District shown on spot cards, e.g. "Kreuzberg". */
  neighborhood: string | null
  lat: number
  lng: number
  openingHours: string | null
  website: string | null
  source: string
}

export interface Hangout {
  id: string
  citySlug: string
  spotId: string
  /** ISO 8601 with offset. */
  startsAt: string
  vibe: Vibe
  maxSize: number
  language: HangoutLanguage
  status: HangoutStatus
  expiresAt: string
  createdAt: string
  /** PROPOSED optional field: a short headline written by the host. */
  title?: string
  /** PROPOSED optional field: one or two lines from the host about the plan. */
  note?: string
}

/** A hangout as listed on a city page. */
export interface HangoutSummary extends Hangout {
  /** neighborhood is PROPOSED here (the full Spot already has it) so city lists can show the district. */
  spot: Pick<Spot, 'id' | 'name' | 'kind' | 'address'> & { neighborhood?: string | null }
  memberCount: number
  spotsLeft: number
  /** First members by join time, at most 5 (avatar stack). */
  memberPreview?: Array<{ nickname: string }>
}

/**
 * A member as other members see them. Never includes a device id.
 * PROPOSED (security review): visitors who have not joined get only the initial as nickname and no about line.
 */
export interface Member {
  id: string
  hangoutId: string
  nickname: string
  about: string | null
  role: MemberRole
  arrivedAt: string | null
  joinedAt: string
}

export interface Message {
  id: string
  hangoutId: string
  memberId: string
  authorNickname: string
  body: string
  /** "arrived" renders as "<nickname> is here". */
  kind: MessageKind
  createdAt: string
}

export interface CityListItem extends City {
  openHangouts: number
  peopleTonight: number
}

/** GET /api/cities */
export interface ListCitiesResponse {
  cities: CityListItem[]
}

/** GET /api/cities/:slug */
export interface CityTonightResponse {
  city: City
  hangouts: HangoutSummary[]
  peopleTonight: number
}

/** GET /api/cities/:slug/spots */
export interface ListSpotsResponse {
  city: City
  spots: Spot[]
}

/** GET /api/hangouts/:id */
export interface HangoutDetail {
  hangout: HangoutSummary
  spot: Spot
  members: Member[]
  viewerMemberId: string | null
}

/** What a person enters to join or host a hangout. */
export interface JoinProfile {
  nickname: string
  about?: string
  ageConfirmed: true
}

/** POST /api/hangouts */
export interface CreateHangoutRequest {
  citySlug: string
  /** Must be a curated spot of citySlug: no free-text places. */
  spotId: string
  startsAt: string
  vibe: Vibe
  maxSize: number
  language: HangoutLanguage
  host: JoinProfile
}

export interface CreateHangoutResponse {
  hangout: HangoutSummary
  member: Member
}

/** POST /api/hangouts/:id/join */
export type JoinHangoutRequest = JoinProfile

export interface JoinHangoutResponse {
  hangout: HangoutSummary
  member: Member
}

/** GET /api/hangouts/:id/messages?after= (members only), oldest first. */
export interface ListMessagesResponse {
  messages: Message[]
}

/** POST /api/hangouts/:id/messages (members only): a text message, or the idempotent "I'm here" check-in. */
export type PostMessageRequest = { kind: 'arrived' } | { kind?: 'text'; body: string }

export interface PostMessageResponse {
  message: Message
}

/** POST /api/report */
export interface ReportRequest {
  targetType: ReportTarget
  /** Id of the hangout, message or member being reported. */
  targetId: string
  /** The hangout the report was made in (context for moderators). */
  hangoutId: string
  reason: ReportReason
  details?: string
}

/** POST /api/block: the server resolves the member's device. */
export interface BlockRequest {
  memberId: string
}

export interface OkResponse {
  ok: true
}

/** GET /api/me */
export interface MeResponse {
  memberships: Array<{ hangoutId: string; memberId: string; role: MemberRole }>
}
