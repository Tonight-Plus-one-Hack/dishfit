// "Meine Karten": menus I photographed. Kept on the device and on the Worker under the device cookie;
// the local list renders instantly and survives offline, the Worker copy fills it on a new browser profile
// with the same cookie. Merged by scan id.
import { deleteScan, deleteScanPhoto, listMenuScans, type MenuScan } from '../data/scans'
import { forgetEntryPhoto } from './diary'
import { persisted, useStore } from './store'

export const cardsStore = persisted<MenuScan[]>('dishfit.cards.v1', [])

export function saveCard(scan: MenuScan) {
  cardsStore.set((prev) => [scan, ...prev.filter((c) => c.id !== scan.id)])
}

export async function removeCard(id: string) {
  cardsStore.set((prev) => prev.filter((c) => c.id !== id))
  try {
    await deleteScan(id)
  } catch {
    // Already gone on the Worker or offline: the local list is what the guest sees.
  }
}

/**
 * Deletes a scan's private photo on the Worker and everywhere this device shows it (the card, diary entries).
 * Throws when the Worker could not delete it; a photo that is already gone counts as deleted.
 */
export async function removeScanPhoto(id: string, url: string) {
  try {
    await deleteScanPhoto(id)
  } catch (error) {
    if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error
  }
  cardsStore.set((prev) => prev.map((c) => (c.id === id ? { ...c, photo: null } : c)))
  forgetEntryPhoto(url)
}

/** Adds the Worker's copies this device does not have yet and takes over their photo state. Quiet when the Worker is not reachable. */
export async function syncCards() {
  try {
    const remote = await listMenuScans()
    const byId = new Map(remote.map((r) => [r.id, r]))
    const local = new Set(cardsStore.get().map((c) => c.id))
    const missing = remote.filter((r) => !local.has(r.id))
    cardsStore.set((prev) =>
      [...prev.map((c) => (byId.has(c.id) ? { ...c, photo: byId.get(c.id)!.photo ?? null } : c)), ...missing].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  } catch {
    // Offline or no Worker (static preview): keep the local list.
  }
}

export const useCards = () => useStore(cardsStore)
