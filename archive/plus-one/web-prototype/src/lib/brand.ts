// Working brand. Swap the name here; the final logo SVG lands under brand/ in a separate PR.
export const BRAND = {
  name: 'Plus One',
  tagline: 'Small groups. Public spots. Tonight.',
  /** Public URL used in share links. Falls back to the current origin in the prototype. */
  url: typeof window === 'undefined' ? 'https://plusone.example' : window.location.origin,
}
