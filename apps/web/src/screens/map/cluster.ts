// Collision-based clustering for the round category pins (box sizes match how Pin draws them).
// A radius around the points (MapLibre's GeoJSON clustering) cannot promise that two pins never touch. This lays the pins out in screen
// space for the current zoom instead: best ranked first, every pin whose box would touch an already placed one
// joins it, and a group of two or more draws as one cluster bubble in the best pin's place.
// Pure and synchronous: ScoreMap reruns it on every zoom step, so pins split and merge exactly when they would touch.
import { translate } from '../../i18n'
import type { PinData, PinMetric } from './ScoreMap'

export type PinSlot =
  /** Drawn as its own pin or dot. */
  | { kind: 'pin' }
  /** Drawn as a cluster bubble that stands for these value pins, best first (this pin is members[0]). */
  | { kind: 'cluster'; members: string[] }
  /** Covered by a cluster or the active pin, or a dot that would sit under another pin. */
  | { kind: 'hidden' }

export type PinLayout = Map<string, PinSlot>

/** Teardrop pins hang above their point: a 34 x 44 drop whose tip touches it. The selected drop grows 1.36 times from
 * its tip (46 x 60) and its name label starts 46 px right of the drop's left edge, centred on the head.
 * A cluster disc with its halo fits a 46 px box. Pins without a matching dish are 24 x 31 drops. */
const DROP = 34
const PIN_HEIGHT = 44
const ACTIVE_HEIGHT = 60
const ACTIVE_HALF = 23
const LABEL_LEFT = 46
const LABEL_MAX = 220
const CLUSTER_SIZE = 46
const DOT_SIZE = 24
const DOT_HEIGHT = 31
/** Air between two boxes, so shadows do not touch either. */
const GAP = 4
/** System sans semibold at 14 px for the label's name, medium at 12 px for its value line. */
const NAME_CHAR = 8
const META_CHAR = 6.6
const TILE = 512

export function worldPoint(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Width of the selected pin's label as drawn by Pin in ScoreMap: padding, chevron and the longer of its two lines. */
function labelWidth(pin: PinData, metric: PinMetric): number {
  const value = !pin.dish ? translate('scoreMapNoMatchingDishes2') : metric === 'kcal' ? `${pin.dish.estimate ? '~' : ''}${pin.dish.kcal} kcal` : translate('clusterScore1', pin.dish.score)
  const meta = 12 + value.length * META_CHAR + (pin.isTestData ? 12 * META_CHAR : 0)
  return Math.min(LABEL_MAX, 37 + Math.max(pin.name.length * NAME_CHAR, meta))
}

function boxOf(pin: PinData, metric: PinMetric, active: boolean, zoom: number): Box {
  const p = worldPoint(pin.lat, pin.lng, zoom)
  if (!pin.dish && !active) {
    const half = DOT_SIZE / 2
    return { left: p.x - half, right: p.x + half, top: p.y - DOT_HEIGHT, bottom: p.y }
  }
  if (active) {
    return { left: p.x - ACTIVE_HALF, right: p.x - DROP / 2 + LABEL_LEFT + labelWidth(pin, metric), top: p.y - ACTIVE_HEIGHT, bottom: p.y }
  }
  const half = Math.max(DROP, CLUSTER_SIZE) / 2
  return { left: p.x - half, right: p.x + half, top: p.y - PIN_HEIGHT, bottom: p.y }
}

function touches(a: Box, b: Box): boolean {
  return a.left < b.right + GAP && b.left < a.right + GAP && a.top < b.bottom + GAP && b.top < a.bottom + GAP
}

/**
 * Which pins draw as pins, which as cluster bubbles and which stay hidden at this zoom.
 * The active pin is placed first and never joins a cluster; value pins it covers hide behind it.
 */
export function layoutPins(pins: PinData[], metric: PinMetric, activeId: string | null, zoom: number): PinLayout {
  const layout: PinLayout = new Map()
  const placed: Array<{ box: Box; leader: string; members: string[]; locked: boolean }> = []

  const valued = pins.filter((p) => p.dish || p.id === activeId).sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId) || a.order - b.order)
  for (const pin of valued) {
    const active = pin.id === activeId
    const box = boxOf(pin, metric, active, zoom)
    const hit = placed.find((g) => touches(g.box, box))
    if (!hit) {
      placed.push({ box, leader: pin.id, members: [pin.id], locked: active })
      continue
    }
    if (hit.locked) layout.set(pin.id, { kind: 'hidden' })
    else hit.members.push(pin.id)
  }

  for (const group of placed) {
    if (group.members.length === 1) {
      layout.set(group.leader, { kind: 'pin' })
      continue
    }
    layout.set(group.leader, { kind: 'cluster', members: group.members })
    for (const id of group.members.slice(1)) layout.set(id, { kind: 'hidden' })
  }

  // Quiet dots never cluster: one that would sit under a pin, a bubble or another dot stays hidden.
  const boxes = placed.map((g) => g.box)
  for (const pin of pins) {
    if (pin.dish || pin.id === activeId) continue
    const box = boxOf(pin, metric, false, zoom)
    if (boxes.some((b) => touches(b, box))) {
      layout.set(pin.id, { kind: 'hidden' })
      continue
    }
    boxes.push(box)
    layout.set(pin.id, { kind: 'pin' })
  }

  return layout
}

/** A short fingerprint, so ScoreMap re-renders only when the layout really changes during a zoom. */
export function layoutKey(layout: PinLayout): string {
  let key = ''
  for (const [id, slot] of layout) key += `${id}:${slot.kind === 'cluster' ? slot.members.join(',') : slot.kind};`
  return key
}

/**
 * The lowest zoom at which every member of a cluster stands clear of its best pin, or null when they share
 * one spot (no zoom level separates them).
 */
export function expansionZoom(pins: PinData[], members: string[], zoom: number): number | null {
  const byId = new Map(pins.map((p) => [p.id, p]))
  const leader = byId.get(members[0])
  if (!leader) return null
  const origin = worldPoint(leader.lat, leader.lng, zoom)
  const half = Math.max(DROP, CLUSTER_SIZE) / 2
  let target = zoom
  let separable = false
  for (const id of members.slice(1)) {
    const pin = byId.get(id)
    if (!pin) continue
    const p = worldPoint(pin.lat, pin.lng, zoom)
    const dx = Math.abs(p.x - origin.x)
    const dy = Math.abs(p.y - origin.y)
    const needX = 2 * half + GAP
    const needY = PIN_HEIGHT + GAP
    // Either axis is enough to clear; take the cheaper one.
    const scale = Math.min(dx > 0 ? needX / dx : Infinity, dy > 0 ? needY / dy : Infinity)
    // Two restaurants at the same address never separate; the others still decide the zoom.
    if (!Number.isFinite(scale)) continue
    separable = true
    target = Math.max(target, zoom + Math.log2(scale))
  }
  return separable ? target : null
}
