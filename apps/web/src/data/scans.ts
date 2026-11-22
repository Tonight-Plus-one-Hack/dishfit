// Private camera scans against the Worker (vite proxies /api in dev; the Worker answers in mock mode
// locally). Kept apart from api.ts so the community upload (PR #33) and this file merge cleanly.
import { translate } from '../i18n'
import { photoFileName } from '../lib/photo'
import { createSubmission } from './api'

export interface Range {
  value: number
  low: number
  high: number
}
export interface Nutrients {
  kcal: Range
  protein: Range
  carbs: Range
  fat: Range
}
export interface PlateReading {
  name: string
  items: string[]
  nutrients: Nutrients
  confidence: 'low' | 'medium' | 'high'
  note: string | null
}
export interface MenuDish {
  name: string
  description: string | null
  descriptionEn?: string | null
  priceEur: number | null
  nutrients: Nutrients
}
export interface MenuReading {
  restaurantName: string | null
  dishes: MenuDish[]
}

/** The scan's photo, kept privately for this device for 30 days: the Worker URL and when it deletes itself. */
export interface ScanPhoto {
  url: string
  expiresAt: string
}

interface ScanBase {
  id: string
  createdAt: string
  /** mock | anthropic | openai */
  mode: string
  costUsd: number
  /** Null when not kept (deleted, expired, or the day's photo limit was reached); missing on scans saved before photos were kept. */
  photo?: ScanPhoto | null
}

/** The photo while it is still kept, else null. */
export const livePhoto = (scan: { photo?: ScanPhoto | null }, now = Date.now()): ScanPhoto | null =>
  scan.photo && Date.parse(scan.photo.expiresAt) > now ? scan.photo : null
export type PlateScan = ScanBase & { kind: 'plate'; plate: PlateReading }
export type MenuScan = ScanBase & { kind: 'menu'; menu: MenuReading }
export type Scan = PlateScan | MenuScan

/** A failed Worker call with a display message translated from its HTTP status. */
export class ScanError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ScanError'
    this.status = status
  }
}

export function scanErrorMessage(status: number): string {
  switch (status) {
    case 0: return translate('noConnectionCheckYourConnectionAnd')
    case 413: return translate('thePhotoIsTooLarge')
    case 415: return translate('photoUnreadable')
    case 422: return translate('photoWrongSubject')
    case 429: return translate('tooManyScansTryAgainLater')
    case 502:
    case 503:
    case 504: return translate('photoAnalysisUnavailable')
    default: return translate('somethingWentWrongTryAgain')
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ScanError(0, scanErrorMessage(0))
  }
  if (!res.ok) throw new ScanError(res.status, scanErrorMessage(res.status))
  return await res.json() as T
}

/** POST /api/scans: the AI reading of one menu or plate photo. */
export async function createScan(kind: 'plate' | 'menu', photo: Blob): Promise<Scan> {
  const form = new FormData()
  form.append('kind', kind)
  form.append('photo', photo, photoFileName(photo, 'scan'))
  return (await call<{ scan: Scan }>('/api/scans', { method: 'POST', body: form })).scan
}

/** GET /api/scans?kind=menu: this device's saved menus. */
export async function listMenuScans(): Promise<MenuScan[]> {
  return (await call<{ scans: MenuScan[] }>('/api/scans?kind=menu')).scans
}

/** DELETE /api/scans/:id (the photo goes with it) */
export async function deleteScan(id: string): Promise<void> {
  await call(`/api/scans/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** DELETE /api/scans/:id/photo: deletes the photo now and keeps the reading. */
export async function deleteScanPhoto(id: string): Promise<void> {
  await call(`/api/scans/${encodeURIComponent(id)}/photo`, { method: 'DELETE' })
}

/**
 * "Mit Community teilen": the community upload from PR #33 (POST /api/submissions), unchanged contract.
 * The team's review agent reads the photo again and publishes the dishes after its checks.
 * Throws ApiRequestError; submitErrorText (screens/snap/messages.ts) turns it into German.
 */
export async function shareMenu(photo: Blob, place: { name: string; lat: number; lng: number }): Promise<{ id: string; status: string }> {
  const form = new FormData()
  form.append('photo', photo, photoFileName(photo, 'menu'))
  form.append('consent', '1')
  form.append('newRestaurant', JSON.stringify(place))
  return createSubmission(form)
}
