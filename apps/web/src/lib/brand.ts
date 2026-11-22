// Working brand. The final name is still open; swap it here and in index.html and public/manifest.webmanifest.
export const BRAND = {
  name: 'DishFit',
  /** Public URL used in share links. Falls back to the current origin until the app has a domain. */
  url: typeof window === 'undefined' ? 'https://dishfit.example' : window.location.origin,
}
