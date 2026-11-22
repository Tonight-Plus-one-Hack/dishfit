// Community screen helpers: a small loader hook, badge art, Kiez names.
import { translate, type MessageKey } from '../../i18n'
import { useCallback, useEffect, useState } from 'react'
import type { IconName } from '../../components/Icon'
import type { BadgeKey } from '../../data/api'
import { KIEZE as CATALOG_KIEZE } from '../../../../../packages/contract/src/kieze'

export type Loaded<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error' }

/** Loads when key changes; reload() refetches and keeps showing the current data until the new data is in. */
export function useLoaded<T>(key: string, load: () => Promise<T>): [Loaded<T>, () => void] {
  const [result, setResult] = useState<{ key: string; value: Loaded<T> } | null>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (data) => live && setResult({ key, value: { state: 'ok', data } }),
      () => live && setResult((prev) => (prev?.key === key && prev.value.state === 'ok' ? prev : { key, value: { state: 'error' } })),
    )
    return () => {
      live = false
    }
    // The loader is identified by key; a new closure for the same key must not refetch.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return [result?.key === key ? result.value : { state: 'loading' }, reload]
}

export const BADGE_COPY = {
  first_scan: { title: 'firstScanTitle', text: 'firstScanText' },
  first_restaurant: { title: 'firstRestaurantTitle', text: 'firstRestaurantText' },
  ten_confirmations: { title: 'tenConfirmationsTitle', text: 'tenConfirmationsText' },
} as const satisfies Record<BadgeKey, { title: MessageKey; text: MessageKey }>

export const BADGE_ART: Record<BadgeKey, { icon: IconName; tone: string; goal: string }> = {
  first_scan: { icon: 'camera', tone: '#f5a524', get goal() { return translate('scan1Menu') } },
  first_restaurant: { icon: 'pin', tone: '#ef5b4c', get goal() { return translate('add1NewRestaurant') } },
  ten_confirmations: { icon: 'check', tone: '#1f9d6b', get goal() { return translate('confirm10Dishes') } },
}

/** Kiez slug to display name, from the shared catalog (the same Kieze the Worker accepts for the leaderboard). */
export const KIEZ_NAMES: Record<string, string> = Object.fromEntries(CATALOG_KIEZE.map((k) => [k.slug, k.name]))
