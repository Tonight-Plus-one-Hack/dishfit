/** MapLibre needs WebGL2. Some in-app browsers (WhatsApp, Instagram), Low Power Mode and older phones lack it. */
let cached: boolean | undefined
export function hasWebGL2(): boolean {
  if (cached !== undefined) return cached
  try {
    const c = document.createElement('canvas')
    cached = !!c.getContext('webgl2')
  } catch {
    cached = false
  }
  return cached
}
