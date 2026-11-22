import type { Kiez, LatLng } from '../data/contract'
import { BERLIN_CENTER, isInBerlin } from './geo'
import { useProfile } from './profile'
import { inMemory, persisted, useStore } from './store'

export interface PositionState {
  position: LatLng
  status: 'fallback' | 'locating' | 'granted' | 'insecure' | 'denied' | 'unavailable' | 'timeout' | 'outside'
}

export type LocationFailure = 'insecure' | 'denied' | 'unavailable' | 'timeout' | 'outside'

export const isLocationFailure = (status: PositionState['status']): status is LocationFailure =>
  status === 'insecure' || status === 'denied' || status === 'unavailable' || status === 'timeout' || status === 'outside'

const failureOfCode = (code: number): LocationFailure => (code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable')

type Choice = 'later' | 'allowed' | 'manual'
const fallback: PositionState = { position: BERLIN_CENTER, status: 'fallback' }
const positionStore = inMemory(fallback)
const choiceStore = persisted<Choice | null>('dishfit.location.choice.v1', null)
const kiezStore = persisted<Kiez | null>('dishfit.location.kiez.v1', null)
const promptStore = inMemory(false)
let requestVersion = 0

try {
  window.localStorage.removeItem('dishfit.position.v1')
} catch {
  // Storage can be unavailable.
}

export const usePosition = () => useStore(positionStore)
export const useLocationChoice = () => useStore(choiceStore)
export const useLocationPrompt = () => useStore(promptStore)

export function useHomeKiez(): Kiez | null {
  const profile = useProfile()
  const kiez = useStore(kiezStore)
  return usePosition().status === 'granted' ? null : kiez ?? profile?.kiez ?? null
}

export function openLocationPrompt() {
  const { status } = positionStore.get()
  if (status !== 'locating' && !isLocationFailure(status)) positionStore.set(fallback)
  promptStore.set(true)
}

export function finishLocationPrompt(choice: Choice, kiez?: Kiez) {
  if (positionStore.get().status === 'locating') {
    requestVersion++
    positionStore.set(fallback)
  }
  if (kiez) saveLocationKiez(kiez)
  choiceStore.set(choice)
  promptStore.set(false)
}

export function saveLocationKiez(kiez: Kiez | null) {
  kiezStore.set(kiez)
}

export function requestPosition() {
  if (positionStore.get().status === 'locating') return
  const version = ++requestVersion
  const update = (state: PositionState) => {
    if (version === requestVersion) positionStore.set(state)
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    update({ ...fallback, status: 'insecure' })
    return
  }
  if (!navigator.geolocation) {
    update({ ...fallback, status: 'unavailable' })
    return
  }

  update({ ...fallback, status: 'locating' })
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const position = { lat: coords.latitude, lng: coords.longitude }
      update(isInBerlin(position) ? { position, status: 'granted' } : { ...fallback, status: 'outside' })
    },
    ({ code }) => update({ ...fallback, status: failureOfCode(code) }),
    { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
  )
}

export function resetPosition() {
  requestVersion++
  positionStore.set(fallback)
  kiezStore.set(null)
  finishLocationPrompt('later')
}
