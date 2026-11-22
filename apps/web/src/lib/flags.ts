// Build flags. Vite inlines import.meta.env at build time.

/**
 * Invented test restaurants and dishes: shown while developing, hidden in production builds (the public app)
 * unless VITE_SHOW_TEST_DATA=true. Hidden means gone from the data layer, so no "Testdaten" badge can appear.
 */
export const SHOW_TEST_DATA = ((import.meta.env.VITE_SHOW_TEST_DATA as string | undefined) ?? (import.meta.env.DEV ? 'true' : 'false')) === 'true'
