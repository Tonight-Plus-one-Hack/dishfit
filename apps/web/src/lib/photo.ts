import type { MessageKey } from '../i18n'
// Re-encodes a photo in the browser before upload (camera scans and the community upload). Drawing it onto a canvas and
// exporting a new image drops every EXIF field (GPS position, camera, time), applies the orientation and shrinks it:
// WebP (JPEG where the browser cannot encode WebP), longest side at most 1600 px, aimed at under 1 MB so one photo is
// one small KV value on the Worker (worker/src/lib/photo-store.ts). The Worker refuses anything over 5 MB.
export const MAX_SIDE = 1600
/** What the encoder aims for; quality and then size step down until the photo fits. */
export const TARGET_BYTES = 1024 * 1024
/** The Worker's hard limit (worker/src/community/image.ts MAX_PHOTO_BYTES). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const QUALITIES = [0.82, 0.72, 0.62, 0.52]
const SHRINK = 0.75
const MAX_SHRINKS = 3
const MIN_SIDE = 400

export interface PreparedPhoto {
  blob: Blob
  url: string
  width: number
  height: number
}

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export class PhotoError extends Error {
  readonly key: MessageKey
  constructor(key: MessageKey) {
    super(key)
    this.key = key
  }
}

/** Draws the source at width x height and encodes it; null when the browser cannot. */
export type Encoder = (width: number, height: number, type: 'image/webp' | 'image/jpeg', quality: number) => Promise<Blob | null>

/**
 * Finds the best encoding under TARGET_BYTES: WebP if the browser encodes it (a browser without WebP encoding
 * returns PNG instead), lower quality first, then a smaller size. Returns the smallest try when nothing fits.
 */
export async function compress(encode: Encoder, width: number, height: number): Promise<{ blob: Blob; width: number; height: number }> {
  let type: 'image/webp' | 'image/jpeg' = 'image/webp'
  let best: { blob: Blob; width: number; height: number } | null = null
  let w = width
  let h = height
  for (let shrink = 0; shrink <= MAX_SHRINKS; shrink++) {
    for (const quality of QUALITIES) {
      let blob = await encode(w, h, type, quality)
      if (blob && type === 'image/webp' && blob.type !== 'image/webp') {
        type = 'image/jpeg'
        blob = await encode(w, h, type, quality)
      }
      if (!blob) continue
      if (!best || blob.size < best.blob.size) best = { blob, width: w, height: h }
      if (blob.size <= TARGET_BYTES) return { blob, width: w, height: h }
    }
    const next = Math.round(Math.max(w, h) * SHRINK)
    if (next < MIN_SIDE) break
    w = Math.round(w * SHRINK)
    h = Math.round(h * SHRINK)
  }
  if (!best) throw new PhotoError('yourBrowserCouldntPrepareThePhoto')
  return best
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older Safari: fall through to an <img>, which also honours EXIF orientation.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function preparePhoto(file: File, options: { tooSmall?: MessageKey } = {}): Promise<PreparedPhoto> {
  if (file.type && !ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    throw new PhotoError('jpegPngOrWebpOnly')
  }
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    throw new PhotoError('weCouldntOpenThisImageTry')
  }
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (w < MIN_SIDE || h < MIN_SIDE) {
    if ('close' in source) source.close()
    throw new PhotoError(options.tooSmall ?? 'thePhotoIsTooSmallTry')
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError('yourBrowserCouldntPrepareThePhoto')
  const encode: Encoder = (width, height, type, quality) => {
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }
  try {
    const { blob, width, height } = await compress(encode, Math.round(w * scale), Math.round(h * scale))
    if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoError('thePhotoIsTooLargeMax')
    return { blob, url: URL.createObjectURL(blob), width, height }
  } finally {
    if ('close' in source) source.close()
  }
}

/** A file name that matches the encoded type, for the multipart upload. */
export const photoFileName = (blob: Blob, base: string) => `${base}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
