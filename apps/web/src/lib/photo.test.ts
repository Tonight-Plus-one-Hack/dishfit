import { describe, expect, it } from 'vitest'
import { livePhoto } from '../data/scans'
import { compress, MAX_SIDE, photoFileName, TARGET_BYTES, type Encoder } from './photo'

/** A fake canvas encoder: the size grows with the pixel count and the quality, like a real one. */
function fakeEncoder(opts: { webp?: boolean; bytesPerPixel?: number } = {}) {
  const calls: { width: number; height: number; type: string; quality: number }[] = []
  const encode: Encoder = async (width, height, type, quality) => {
    calls.push({ width, height, type, quality })
    // Browsers without WebP encoding hand back a PNG instead.
    const outType = type === 'image/webp' && opts.webp === false ? 'image/png' : type
    const size = Math.round(width * height * (opts.bytesPerPixel ?? 0.5) * quality)
    return new Blob([new Uint8Array(size)], { type: outType })
  }
  return { encode, calls }
}

describe('compress', () => {
  it('keeps the first WebP try when it is already under 1 MB', async () => {
    const { encode, calls } = fakeEncoder({ bytesPerPixel: 0.2 })
    const out = await compress(encode, MAX_SIDE, 1200)
    expect(out).toMatchObject({ width: MAX_SIDE, height: 1200 })
    expect(out.blob.type).toBe('image/webp')
    expect(out.blob.size).toBeLessThanOrEqual(TARGET_BYTES)
    expect(calls).toHaveLength(1)
  })

  it('steps the quality down, then the size, until the photo fits', async () => {
    const { encode, calls } = fakeEncoder({ bytesPerPixel: 1.2 })
    const out = await compress(encode, MAX_SIDE, 1200)
    expect(out.blob.size).toBeLessThanOrEqual(TARGET_BYTES)
    expect(out.width).toBeLessThan(MAX_SIDE)
    expect(out.width / out.height).toBeCloseTo(MAX_SIDE / 1200, 1)
    const qualities = calls.filter((c) => c.width === MAX_SIDE).map((c) => c.quality)
    expect(qualities).toEqual([...qualities].sort((a, b) => b - a))
  })

  it('falls back to JPEG where the browser cannot encode WebP', async () => {
    const { encode, calls } = fakeEncoder({ webp: false, bytesPerPixel: 0.2 })
    const out = await compress(encode, 1000, 800)
    expect(out.blob.type).toBe('image/jpeg')
    expect(calls.map((c) => c.type)).toEqual(['image/webp', 'image/jpeg'])
  })

  it('returns the smallest try when nothing gets under the target', async () => {
    const { encode } = fakeEncoder({ bytesPerPixel: 40 })
    const out = await compress(encode, MAX_SIDE, MAX_SIDE)
    expect(out.blob.size).toBeGreaterThan(TARGET_BYTES)
    expect(out.width).toBeGreaterThanOrEqual(400)
    expect(out.width).toBeLessThan(MAX_SIDE)
  })

  it('names the upload after its type', () => {
    expect(photoFileName(new Blob([], { type: 'image/webp' }), 'scan')).toBe('scan.webp')
    expect(photoFileName(new Blob([], { type: 'image/jpeg' }), 'menu')).toBe('menu.jpg')
  })
})

describe('livePhoto', () => {
  it('shows a scan photo only until it expires', () => {
    const photo = { url: '/api/scans/s1/photo', expiresAt: '2026-12-21T12:00:00.000Z' }
    expect(livePhoto({ photo }, Date.parse('2026-12-21T11:59:00Z'))).toBe(photo)
    expect(livePhoto({ photo }, Date.parse('2026-12-21T12:00:00Z'))).toBeNull()
    expect(livePhoto({ photo: null })).toBeNull()
    expect(livePhoto({})).toBeNull()
  })
})
