// Where dish artwork lives. A dish without one shows its clay category icon (DishThumb, lib/category.ts).

/**
 * The pipeline stores KI-Bild refs relative to its image folder ("ai/chili-bean-burger-0e3b876a.webp", see
 * pipeline/seed/images/). Served from public/images/ by default; VITE_DISH_IMAGE_BASE points at a CDN instead.
 */
const IMAGE_BASE = ((import.meta.env.VITE_DISH_IMAGE_BASE as string | undefined) ?? `${import.meta.env.BASE_URL}images/`).replace(/\/?$/, '/')

/** Absolute and root-relative refs pass through; pipeline refs resolve against the image base. */
export function dishImageSrc(ref: string): string {
  return /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(ref) ? ref : IMAGE_BASE + ref.replace(/^\.?\//, '')
}
