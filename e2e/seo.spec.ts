import { expect, test } from '@playwright/test'

test('serves a bilingual guide as a static document and returns 404 for an unknown guide', async ({ request }) => {
  const navigation = { headers: { 'sec-fetch-mode': 'navigate' } }
  for (const [path, heading] of [
    ['/kiez/kreuzberg', 'Gesund essen in Kreuzberg'],
    ['/en/kiez/kreuzberg', 'Healthy food in Kreuzberg'],
  ] as const) {
    const guide = await request.get(path, navigation)
    expect(guide.status()).toBe(200)
    expect(guide.headers()['cache-control']).toContain('max-age=300')
    const html = await guide.text()
    expect(html).toContain(`<h1>${heading}</h1>`)
    expect(html).toContain('type="application/ld+json"')
    expect(html).toMatch(/href="\/d\/[^"]+"/)
    expect((await request.get(`${path}/not-a-catalog-category`, navigation)).status()).toBe(404)
  }
  expect((await request.get('/%6Biez/not-a-kiez', navigation)).status()).toBe(404)
})
