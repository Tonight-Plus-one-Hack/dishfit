// The only module screens read data from. Each function mirrors one Workers route from docs/team-prompts
// and resolves to the contract response shape, so swapping a mock body for fetch() is a local change.
// The mock keeps this device's joins and hosted plans in localStorage, standing in for the wohin_device cookie and D1.
import { now } from '../lib/clock'
import { nextMorning } from '../lib/time'
import { CITIES } from './cities'
import { HANGOUTS, MEMBERS, MESSAGES, demoUuid } from './hangouts'
import { SPOTS } from './spots'
import {
  ABOUT_MAX,
  HANGOUT_LANGUAGES,
  MAX_GROUP_SIZE,
  MEMBER_PREVIEW_MAX,
  MESSAGE_MAX,
  MIN_GROUP_SIZE,
  NICKNAME_MAX,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  REPORT_TARGETS,
  VIBES,
  type BlockRequest,
  type City,
  type ClientEventName,
  type CreateHangoutRequest,
  type CreateHangoutResponse,
  type CityTonightResponse,
  type Hangout,
  type HangoutDetail,
  type HangoutSummary,
  type JoinHangoutRequest,
  type JoinHangoutResponse,
  type JoinProfile,
  type ListCitiesResponse,
  type ListMessagesResponse,
  type ListSpotsResponse,
  type MeResponse,
  type Member,
  type MemberRole,
  type Message,
  type OkResponse,
  type PostMessageRequest,
  type PostMessageResponse,
  type ReportRequest,
} from './types'

export type ApiErrorCode =
  | 'bad_request'
  | 'forbidden'
  | 'not_found'
  | 'hangout_full'
  | 'hangout_closed'
  | 'already_member'

export class ApiError extends Error {
  code: ApiErrorCode
  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

// ---------- Mock device state (replaced by the Worker and D1) ----------

interface StoredMembership {
  memberId: string
  nickname: string
  about: string | null
  joinedAt: string
  role?: MemberRole
  arrivedAt?: string | null
}

const DEVICE_KEY = 'plusone.mock-device.v2'
const HOSTED_KEY = 'plusone.mock-hosted.v1'
const MESSAGES_KEY = 'plusone.mock-messages.v1'
const BLOCKED_KEY = 'plusone.mock-blocked.v1'
const REPORTS_KEY = 'plusone.mock-reports.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the change lasts for this page view only.
  }
}

const readDevice = () => readJson<Record<string, StoredMembership>>(DEVICE_KEY, {})
const writeDevice = (next: Record<string, StoredMembership>) => writeJson(DEVICE_KEY, next)

/** Demo plans plus the ones this device started. */
function allHangouts(): Hangout[] {
  return [...HANGOUTS, ...readJson<Hangout[]>(HOSTED_KEY, [])]
}

function viewerMember(hangoutId: string): Member | null {
  const stored = readDevice()[hangoutId]
  if (!stored) return null
  return {
    id: stored.memberId,
    hangoutId,
    nickname: stored.nickname,
    about: stored.about,
    role: stored.role ?? 'member',
    arrivedAt: stored.arrivedAt ?? null,
    joinedAt: stored.joinedAt,
  }
}

/** Visitors see initials only (PROPOSED for the Worker, from the security review); about lines are members-only. */
function asSeenBy(member: Member, isMember: boolean): Member {
  if (isMember) return member
  return { ...member, nickname: initial(member.nickname), about: null }
}

function initial(nickname: string): string {
  return (nickname.trim().charAt(0) || '?').toUpperCase()
}

function checkProfile(profile: JoinProfile): string {
  const nickname = profile.nickname.trim()
  if (profile.ageConfirmed !== true || nickname.length === 0 || nickname.length > NICKNAME_MAX)
    throw new ApiError('bad_request', 'Nickname and age confirmation are required')
  if ((profile.about ?? '').length > ABOUT_MAX) throw new ApiError('bad_request', 'About is too long')
  return nickname
}

// ---------- Read helpers ----------

function requireCity(slug: string): City {
  const city = CITIES.find((c) => c.slug === slug)
  if (!city) throw new ApiError('not_found', `Unknown city: ${slug}`)
  return city
}

function membersOf(hangoutId: string): Member[] {
  const members = MEMBERS.filter((m) => m.hangoutId === hangoutId)
  const viewer = viewerMember(hangoutId)
  return viewer ? [...members, viewer] : members
}

function isLive(h: Hangout) {
  return h.status === 'open' && Date.parse(h.expiresAt) > now().getTime()
}

function summarize(h: Hangout): HangoutSummary {
  const spot = SPOTS.find((s) => s.id === h.spotId)!
  const members = membersOf(h.id)
  return {
    ...h,
    spot: { id: spot.id, name: spot.name, kind: spot.kind, address: spot.address, neighborhood: spot.neighborhood },
    memberCount: members.length,
    spotsLeft: Math.max(0, h.maxSize - members.length),
    // Public lists carry initials only.
    memberPreview: members
      .slice()
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .slice(0, MEMBER_PREVIEW_MAX)
      .map((m) => ({ nickname: initial(m.nickname) })),
  }
}

function tonight(slug: string): HangoutSummary[] {
  return allHangouts().filter((h) => h.citySlug === slug && isLive(h))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(summarize)
}

// ---------- Routes ----------

/** GET /api/cities */
export async function listCities(): Promise<ListCitiesResponse> {
  return {
    cities: CITIES.map((city) => {
      const hangouts = tonight(city.slug)
      return {
        ...city,
        openHangouts: hangouts.length,
        peopleTonight: hangouts.reduce((sum, h) => sum + h.memberCount, 0),
      }
    }),
  }
}

/** GET /api/cities/:slug */
export async function getCityTonight(slug: string): Promise<CityTonightResponse> {
  const city = requireCity(slug)
  const hangouts = tonight(slug)
  return { city, hangouts, peopleTonight: hangouts.reduce((sum, h) => sum + h.memberCount, 0) }
}

/** GET /api/cities/:slug/spots */
export async function listSpots(slug: string): Promise<ListSpotsResponse> {
  const city = requireCity(slug)
  return { city, spots: SPOTS.filter((s) => s.citySlug === slug) }
}

/** GET /api/hangouts/:id */
export async function getHangout(id: string): Promise<HangoutDetail> {
  const hangout = allHangouts().find((h) => h.id === id && h.status !== 'hidden')
  if (!hangout) throw new ApiError('not_found', `Unknown hangout: ${id}`)
  const spot = SPOTS.find((s) => s.id === hangout.spotId)!
  const viewer = viewerMember(id)
  const members = membersOf(id).map((m) => asSeenBy(m, Boolean(viewer)))
  return { hangout: summarize(hangout), spot, members, viewerMemberId: viewer?.id ?? null }
}

/** POST /api/hangouts (201). The host joins as the first member. */
export async function createHangout(request: CreateHangoutRequest): Promise<CreateHangoutResponse> {
  const city = requireCity(request.citySlug)
  const spot = SPOTS.find((s) => s.id === request.spotId && s.citySlug === city.slug)
  if (!spot) throw new ApiError('bad_request', 'Pick a spot from the list')
  if (!VIBES.includes(request.vibe) || !HANGOUT_LANGUAGES.includes(request.language))
    throw new ApiError('bad_request', 'Unknown vibe or language')
  if (!Number.isInteger(request.maxSize) || request.maxSize < MIN_GROUP_SIZE || request.maxSize > MAX_GROUP_SIZE)
    throw new ApiError('bad_request', `Groups have ${MIN_GROUP_SIZE} to ${MAX_GROUP_SIZE} people`)
  const startsAt = Date.parse(request.startsAt)
  const expiresAt = nextMorning(city.timezone)
  if (Number.isNaN(startsAt) || startsAt < now().getTime() - 5 * 60_000 || startsAt >= Date.parse(expiresAt))
    throw new ApiError('bad_request', 'Pick a time later tonight')
  const nickname = checkProfile(request.host)
  const createdAt = now().toISOString()
  const hangout: Hangout = {
    id: crypto.randomUUID(),
    citySlug: city.slug,
    spotId: spot.id,
    startsAt: new Date(startsAt).toISOString(),
    vibe: request.vibe,
    maxSize: request.maxSize,
    language: request.language,
    status: 'open',
    expiresAt,
    createdAt,
  }
  writeJson(HOSTED_KEY, [...readJson<Hangout[]>(HOSTED_KEY, []).filter(isLive), hangout])
  writeDevice({
    ...readDevice(),
    [hangout.id]: {
      memberId: crypto.randomUUID(),
      nickname,
      about: request.host.about?.trim() || null,
      joinedAt: createdAt,
      role: 'host',
    },
  })
  return { hangout: summarize(hangout), member: viewerMember(hangout.id)! }
}

/** POST /api/hangouts/:id/join (201 new member, 200 when this device already is a member). */
export async function joinHangout(id: string, request: JoinHangoutRequest): Promise<JoinHangoutResponse> {
  const { hangout, members } = await getHangout(id)
  const existing = viewerMember(id)
  if (existing) return { hangout, member: existing }
  const nickname = checkProfile(request)
  if (!isLive(hangout)) throw new ApiError('hangout_closed', 'This hangout is over')
  if (members.length >= hangout.maxSize) throw new ApiError('hangout_full', 'This group is full')
  const joinedAt = now().toISOString()
  const stored: StoredMembership = {
    memberId: demoUuid(`${id}:viewer:${joinedAt}`),
    nickname,
    about: request.about?.trim() || null,
    joinedAt,
  }
  writeDevice({ ...readDevice(), [id]: stored })
  return { hangout: (await getHangout(id)).hangout, member: viewerMember(id)! }
}

// ---------- Chat and safety (lane 2 routes) ----------

function requireMember(hangoutId: string): Member {
  const viewer = viewerMember(hangoutId)
  if (!viewer) throw new ApiError('forbidden', 'Join the hangout to see the chat')
  return viewer
}

const readMessages = () => readJson<Record<string, Message[]>>(MESSAGES_KEY, {})

/** GET /api/hangouts/:id/messages?after= (members only). Oldest first, without blocked members. */
export async function listMessages(id: string, after?: string): Promise<ListMessagesResponse> {
  await getHangout(id)
  requireMember(id)
  const blocked = new Set(readJson<string[]>(BLOCKED_KEY, []))
  const cutoff = now().toISOString()
  const messages = [...MESSAGES.filter((m) => m.hangoutId === id), ...(readMessages()[id] ?? [])]
    .filter((m) => m.createdAt <= cutoff && !blocked.has(m.memberId) && (!after || m.createdAt > after))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { messages }
}

/** POST /api/hangouts/:id/messages (members only). `{ kind: 'arrived' }` is idempotent. */
export async function postMessage(id: string, request: PostMessageRequest): Promise<PostMessageResponse> {
  const { hangout } = await getHangout(id)
  const me = requireMember(id)
  if (!isLive(hangout)) throw new ApiError('hangout_closed', 'This hangout is over')
  const stored = readMessages()
  const mine = stored[id] ?? []
  if (request.kind === 'arrived') {
    const existing = mine.find((m) => m.kind === 'arrived' && m.memberId === me.id)
    if (existing) return { message: existing }
  }
  const body = request.kind === 'arrived' ? 'is here' : request.body.trim()
  if (body.length === 0 || body.length > MESSAGE_MAX) throw new ApiError('bad_request', 'Messages are 1 to 500 characters')
  const message: Message = {
    id: crypto.randomUUID(),
    hangoutId: id,
    memberId: me.id,
    authorNickname: me.nickname,
    body,
    kind: request.kind === 'arrived' ? 'arrived' : 'text',
    createdAt: now().toISOString(),
  }
  writeJson(MESSAGES_KEY, { ...stored, [id]: [...mine, message] })
  if (message.kind === 'arrived') {
    const device = readDevice()
    writeDevice({ ...device, [id]: { ...device[id], arrivedAt: message.createdAt } })
  }
  return { message }
}

/** POST /api/report. The Worker hides a message after 2 reports and a hangout after 3. */
export async function submitReport(request: ReportRequest): Promise<OkResponse> {
  if (!REPORT_TARGETS.includes(request.targetType) || !REPORT_REASONS.includes(request.reason))
    throw new ApiError('bad_request', 'Pick a reason')
  if ((request.details ?? '').length > REPORT_DETAILS_MAX) throw new ApiError('bad_request', 'Details are too long')
  writeJson(REPORTS_KEY, [...readJson<ReportRequest[]>(REPORTS_KEY, []), request])
  return { ok: true }
}

/** POST /api/block. Their messages disappear for this device everywhere. */
export async function blockMember(request: BlockRequest): Promise<OkResponse> {
  const blocked = readJson<string[]>(BLOCKED_KEY, [])
  if (!blocked.includes(request.memberId)) writeJson(BLOCKED_KEY, [...blocked, request.memberId])
  return { ok: true }
}

/** GET /api/me */
export async function getMe(): Promise<MeResponse> {
  const device = readDevice()
  return {
    memberships: Object.entries(device)
      .filter(([hangoutId]) => allHangouts().some((h) => h.id === hangoutId && isLive(h)))
      .map(([hangoutId, m]) => ({ hangoutId, memberId: m.memberId, role: m.role ?? 'member' })),
  }
}

/**
 * POST /api/events (fire and forget, 202). Lane 3 counts these for /api/numbers.
 * The mock has nowhere to send them; swapping in fetch() with keepalive is the whole change.
 */
export function trackEvent(name: ClientEventName, props: Record<string, string | number | boolean | null> = {}): void {
  void name
  void props
}

// ---------- Client-side compositions (no dedicated endpoint) ----------

/** Tonight's fullest open hangouts across every city, built from GET /api/cities and GET /api/cities/:slug. */
export async function listPopularHangouts(limit = 12): Promise<Array<{ city: City; hangout: HangoutSummary }>> {
  const { cities } = await listCities()
  const perCity = await Promise.all(cities.filter((c) => c.openHangouts > 0).map((c) => getCityTonight(c.slug)))
  return perCity
    .flatMap(({ city, hangouts }) => hangouts.map((hangout) => ({ city, hangout })))
    .filter(({ hangout }) => hangout.spotsLeft > 0)
    .sort(
      (a, b) =>
        b.hangout.memberCount / b.hangout.maxSize - a.hangout.memberCount / a.hangout.maxSize ||
        a.hangout.startsAt.localeCompare(b.hangout.startsAt),
    )
    .slice(0, limit)
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'not_found'
}
