// The only data entry point for screens. Today every call answers from the seed module (src/data/mock.ts);
// to switch to the Worker, replace each body with the fetch shown next to it. Screens do not change.
// Append-only for screen workers: add functions, do not change existing signatures.
import { translate } from '../i18n'
import type { DishDetail, DishFilters, DishResult, RestaurantDetail, RestaurantSummary } from './contract'
import type { WaitlistCoupon } from '../../../../packages/contract/src/waitlist'
import type { CommunityDish, SubmissionConfig, SubmissionView } from './contract'
import type { BadgeKey, ConfirmationTally, LeaderboardPeriod, LeaderboardView, MeView } from './contract'
import * as mock from './mock'

export { NotFoundError } from './mock'
export * from './contract'

/** Simulated network latency, so loading states get exercised in development. */
const LATENCY_MS = import.meta.env.DEV ? 120 : 0
const later = <T>(fn: () => T): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(fn())
      } catch (error) {
        reject(error)
      }
    }, LATENCY_MS),
  )

/** GET /api/restaurants?{filters}: restaurants with distance, open state and their best matching dish. */
export function listRestaurants(filters: DishFilters = {}): Promise<RestaurantSummary[]> {
  return later(() => mock.listRestaurants(filters))
}

/** GET /api/restaurants/:id: one restaurant and its whole menu. */
export function getRestaurant(id: string): Promise<RestaurantDetail> {
  return later(() => mock.getRestaurant(id))
}

/** GET /api/dishes/:id: one dish, its restaurant and sibling dishes. */
export function getDish(id: string): Promise<DishDetail> {
  return later(() => mock.getDish(id))
}

/** GET /api/dishes?{filters}: ranked dishes across restaurants, e.g. "best protein under 12 EUR near you". */
export function topDishes(query: DishFilters = {}): Promise<DishResult[]> {
  return later(() => mock.topDishes(query))
}

export function isNotFound(error: unknown): boolean {
  return error instanceof mock.NotFoundError
}

/** A record we know but do not show, because the healthy rule hides it (too few healthy dishes, or not healthy). */
export function isHidden(error: unknown): boolean {
  return error instanceof mock.NotFoundError && error.hidden
}

/** Stable cache key for useResource(): same filters, same key. */
export function filtersKey(filters: DishFilters): string {
  const { now: _now, ...rest } = filters
  const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify(sorted)
}

// ---------- Community menu scans: these talk to the Worker directly (vite proxies /api in dev) ----------

/** A failed Worker call with its HTTP status and the API error code. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiRequestError(0, 'network', translate('noConnection'))
  }
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error?: { code?: string; message?: string } }
    | null
  if (!response.ok) {
    const error = body && 'error' in body ? body.error : undefined
    throw new ApiRequestError(response.status, error?.code ?? 'internal', error?.message ?? response.statusText)
  }
  return body as T
}

export function joinWaitlist(signup: { email: string; consent: boolean; website: string }): Promise<WaitlistCoupon> {
  return request('/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signup),
  })
}

/** GET /api/submissions/config: Turnstile site key and upload limits. */
export function submissionConfig(): Promise<SubmissionConfig> {
  return request<SubmissionConfig>('/api/submissions/config')
}

/** POST /api/submissions: one menu photo for an existing or a new restaurant. Answers 202 while the review runs. */
export async function createSubmission(form: FormData): Promise<SubmissionView> {
  return (await request<{ submission: SubmissionView }>('/api/submissions', { method: 'POST', body: form })).submission
}

/** GET /api/submissions/:id: the review state of one photo (never the photo itself). */
export async function getSubmission(id: string): Promise<SubmissionView> {
  return (await request<{ submission: SubmissionView }>(`/api/submissions/${encodeURIComponent(id)}`)).submission
}

/** GET /api/community/dishes?restaurantId=: dishes guests added from menu photos. Empty when the Worker is not reachable. */
export async function communityDishes(restaurantId: string): Promise<CommunityDish[]> {
  try {
    const { dishes } = await request<{ dishes: CommunityDish[] }>(
      `/api/community/dishes?restaurantId=${encodeURIComponent(restaurantId)}`,
    )
    return Array.isArray(dishes) ? dishes : []
  } catch {
    return []
  }
}

// ---------- Community profile, confirmations, Kiez leaderboard (Worker, signed device cookie) ----------

/** GET /api/me: the device profile with contributions and badges; profile is null before the first contribution. */
export function getMe(): Promise<MeView> {
  return request<MeView>('/api/me')
}

/** PATCH /api/me: a custom nickname; '' resets to the generated one. */
export function setNickname(nickname: string): Promise<{ nickname: string; nicknameCustom: boolean }> {
  return request('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) })
}

/** POST /api/me/badges/seen: the thank-you moment for these badges was shown. */
export async function markBadgesSeen(badges: BadgeKey[]): Promise<void> {
  await request('/api/me/badges/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ badges }) })
}

/** GET /api/dishes/:id/confirmations: yes/no counts and the caller's own verdict. */
export function getConfirmations(dishId: string): Promise<ConfirmationTally> {
  return request<ConfirmationTally>(`/api/dishes/${encodeURIComponent(dishId)}/confirmations`)
}

/** POST /api/dishes/:id/confirmations: one changeable verdict per device, with an optional correction on "no". */
export function confirmDish(
  dishId: string,
  input: { verdict: 'yes' | 'no'; correction?: string; dishName?: string; restaurantId?: string },
): Promise<ConfirmationTally> {
  return request<ConfirmationTally>(`/api/dishes/${encodeURIComponent(dishId)}/confirmations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** GET /api/leaderboard: scanners ranked by published menu photos, per Kiez (or all of Berlin) and period. */
export function getLeaderboard(kiez: string | null, period: LeaderboardPeriod): Promise<LeaderboardView> {
  const query = new URLSearchParams({ period })
  if (kiez) query.set('kiez', kiez)
  return request<LeaderboardView>(`/api/leaderboard?${query}`)
}
