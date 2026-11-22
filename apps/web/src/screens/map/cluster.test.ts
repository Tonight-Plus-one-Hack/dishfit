// Every pin the map draws must be tappable: no two drawn pins, bubbles or dots may touch at any zoom,
// otherwise a tap on one lands on its neighbour (the "Restaurant öffnen does nothing" bug).
import { describe, expect, it } from 'vitest'
import { layoutPins, worldPoint, type PinLayout } from './cluster'
import type { PinData, PinMetric } from './ScoreMap'

function pin(id: string, lat: number, lng: number, order: number, withDish = true): PinData {
  return {
    id,
    lat,
    lng,
    order,
    name: `Restaurant ${id}`,
    isTestData: false,
    dish: withDish ? { kcal: 400 + order * 7, score: 60 + (order % 40), estimate: order % 2 === 0 } : null,
    category: 'salad',
  }
}

/** A dense Berlin-like spread: 150 restaurants within a few kilometres of Moritzplatz, a quarter without a dish. */
function berlin(): PinData[] {
  let seed = 42
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
  return Array.from({ length: 150 }, (_, i) => pin(`r${i}`, 52.503 + (rand() - 0.5) * 0.08, 13.41 + (rand() - 0.5) * 0.14, i, i % 4 !== 0))
}

/** Screen boxes of everything drawn, with the same sizes as cluster.ts (pins hang above their point, dots centred). */
function drawnBoxes(pins: PinData[], layout: PinLayout, activeId: string | null, zoom: number, metric: PinMetric) {
  return pins
    .filter((p) => (layout.get(p.id) ?? { kind: 'pin' }).kind !== 'hidden')
    .map((p) => {
      const { x, y } = worldPoint(p.lat, p.lng, zoom)
      const slot = layout.get(p.id)
      if (p.id === activeId) {
        const value = !p.dish ? 'Keine passenden Gerichte' : metric === 'kcal' ? `${p.dish.estimate ? '~' : ''}${p.dish.kcal} kcal` : `Score ${p.dish.score}`
        const label = Math.min(220, 37 + Math.max(p.name.length * 8, 12 + value.length * 6.6))
        return { id: p.id, left: x - 23, right: x + 29 + label, top: y - 60, bottom: y }
      }
      if (!p.dish) return { id: p.id, left: x - 12, right: x + 12, top: y - 31, bottom: y }
      const half = slot?.kind === 'cluster' ? 23 : 17
      return { id: p.id, left: x - half, right: x + half, top: y - 44, bottom: y }
    })
}

function overlaps(boxes: ReturnType<typeof drawnBoxes>): string[] {
  const hits: string[] = []
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(`${a.id}/${b.id}`)
    }
  return hits
}

describe('layoutPins', () => {
  it('keeps two distant restaurants as separate pins', () => {
    const pins = [pin('a', 52.5, 13.4, 0), pin('b', 52.52, 13.45, 1)]
    const layout = layoutPins(pins, 'kcal', null, 14)
    expect(layout.get('a')).toEqual({ kind: 'pin' })
    expect(layout.get('b')).toEqual({ kind: 'pin' })
  })

  it('merges touching restaurants into one cluster led by the best ranked', () => {
    const pins = [pin('b', 52.5, 13.40001, 1), pin('a', 52.5, 13.4, 0)]
    const layout = layoutPins(pins, 'kcal', null, 12)
    expect(layout.get('a')).toEqual({ kind: 'cluster', members: ['a', 'b'] })
    expect(layout.get('b')).toEqual({ kind: 'hidden' })
  })

  it('never clusters the selected restaurant and hides what it covers', () => {
    const pins = [pin('a', 52.5, 13.4, 0), pin('b', 52.5, 13.40001, 1)]
    const layout = layoutPins(pins, 'kcal', 'b', 12)
    expect(layout.get('b')).toEqual({ kind: 'pin' })
    expect(layout.get('a')).toEqual({ kind: 'hidden' })
  })

  it('hides a dot that would sit under a pin, so it never steals or loses a tap', () => {
    const pins = [pin('a', 52.5, 13.4, 0), pin('dot', 52.5, 13.40001, 1, false)]
    const layout = layoutPins(pins, 'kcal', null, 13)
    expect(layout.get('dot')).toEqual({ kind: 'hidden' })
  })

  it('draws a selected restaurant without matching dishes as the selected pin, above the pins it covers', () => {
    const pins = [pin('a', 52.5, 13.4, 0), pin('dot', 52.5, 13.40001, 1, false)]
    const layout = layoutPins(pins, 'kcal', 'dot', 13)
    expect(layout.get('dot')).toEqual({ kind: 'pin' })
    expect(layout.get('a')).toEqual({ kind: 'hidden' })
  })

  for (const metric of ['kcal', 'score'] as PinMetric[])
    for (const zoom of [11, 12, 13, 14, 15, 16])
      // r4 has no matching dish: a selected restaurant without dishes still draws as the selected pin.
      for (const activeId of [null, 'r1', 'r9', 'r4'])
        it(`draws nothing that touches at zoom ${zoom}, ${metric}, active ${activeId ?? 'none'}`, () => {
          const pins = berlin()
          const layout = layoutPins(pins, metric, activeId, zoom)
          expect(overlaps(drawnBoxes(pins, layout, activeId, zoom, metric))).toEqual([])
        })
})

it('the overlap check catches crowded pins (guards the test itself)', () => {
  const pins = berlin()
  const unclustered: PinLayout = new Map(pins.map((p) => [p.id, { kind: 'pin' as const }]))
  expect(overlaps(drawnBoxes(pins, unclustered, null, 12, 'kcal')).length).toBeGreaterThan(0)
})
