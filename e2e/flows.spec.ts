// The main flows, clicked through like a visitor would, at 1440x900 (desktop) and 390x844 (phone; the map test uses 390x664).
import type { Locator } from '@playwright/test'
import { expect, expectHealthy, isPhone, live, test } from './fixtures.ts'
import { dishName, mainNav, openRankedDish } from './app.ts'

test('map is the start page: pins, compact phone layout, Berlin camera', async ({ page, shot }) => {
  test.setTimeout(120_000)
  // On the phone, the Instagram in-app browser's viewport: the map must keep its room next to the card and the sheet.
  if (isPhone(page)) await page.setViewportSize({ width: 390, height: 664 })
  // A vector tile, not only the style: the base map really draws.
  const tile = page.waitForResponse((response) => /tiles\.openfreemap\.org\/.+\/\d+\/\d+\/\d+\.pbf/.test(response.url()) && response.ok())
  await page.goto('/')
  // A direct load opens the map and marks it active in the navigation.
  await expect(page).toHaveURL(/^[^?#]+\/(\?.*)?$/)
  await expect(mainNav(page).getByRole('link', { name: 'Karte' })).toHaveAttribute('aria-current', 'page')
  // MapLibre is a lazy chunk of about 1 MB; a cold first run can take a while to show it.
  const map = page.getByRole('region', { name: 'Karte der Restaurants' })
  await expect(map).toBeVisible({ timeout: 30_000 })
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible()
  await tile
  // Pins are restaurants with their best dish's kcal, restaurants without a matching dish, or clusters of N.
  // The map opens at Kiez zoom, so count the restaurants in view, not markers, and let it settle.
  const pins = map.getByRole('button', { name: /kcal|Heranzoomen|Restaurant öffnen/ })
  await expect(pins.first()).toBeVisible()
  await expect
    .poll(async () => {
      const labels = await pins.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''))
      return labels.reduce((sum, label) => sum + Number(/^(\d+) Restaurants an dieser Stelle/.exec(label)?.[1] ?? 1), 0)
    })
    .toBeGreaterThan(8)
  await expect(page.getByRole('radiogroup', { name: 'Wert auf den Pins' })).toBeVisible()
  await shot('map-pins')

  // The ranked dishes next to the map: the panel on desktop, the sheet on the phone.
  const ranking = isPhone(page) ? page.getByRole('list', { name: 'Beste Gerichte pro Restaurant' }) : page.getByRole('complementary', { name: 'Rangliste' })
  const dishLinks = ranking.locator('a[href^="/d/"]')
  await expect(dishLinks.first()).toBeVisible()
  // Labelled "Platz 1: <dish>" in the desktop panel and "<dish> bei <restaurant>" in the phone carousel.
  const labels = await dishLinks.evaluateAll((links) => links.map((a) => a.getAttribute('aria-label') ?? a.textContent ?? ''))
  expectHealthy(labels.map(dishName), 'map ranking')
  await page.getByRole('radio', { name: 'Score' }).click()
  await expect(page.getByRole('radio', { name: 'Score' })).toBeChecked()
  await shot('map-score')

  // The camera opens on Berlin at Kiez zoom; it is saved per tab on every move (src/screens/map/camera.ts).
  type View = { center: { lat: number; lng: number }; zoom: number } | null
  const view = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('dishfit.map.view.v1') ?? 'null') as View)
  const inBerlin = (v: View) => !!v && v.center.lat > 52.3 && v.center.lat < 52.72 && v.center.lng > 13 && v.center.lng < 13.85
  await expect.poll(view).not.toBeNull()
  const start = (await view())!
  expect(inBerlin(start), JSON.stringify(start)).toBe(true)
  expect(start.zoom).toBeGreaterThanOrEqual(12)
  expect(start.zoom).toBeLessThanOrEqual(15)

  if (isPhone(page)) {
    // One control row, a compact card and a heading-only sheet: the card stack starts below the middle of the screen.
    const carousel = (await ranking.boundingBox())!
    const sheet = (await page.getByRole('region', { name: 'Rangliste' }).locator('.rank-sheet__head').boundingBox())!
    expect(carousel.y).toBeGreaterThan(664 * 0.6)
    expect(carousel.height).toBeLessThan(140)
    expect(sheet.height).toBeLessThan(80)
  }

  // Zooming far out stops at Berlin. Keyboard zoom works on both layouts (the wheel is a mouse-only gesture).
  await map.locator('canvas').focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('Minus')
  await expect.poll(async () => (await view())?.zoom).toBeLessThan(start.zoom)
  await page.waitForTimeout(800)
  const out = (await view())!
  expect(out.zoom).toBeGreaterThanOrEqual(10)
  expect(inBerlin(out), JSON.stringify(out)).toBe(true)

  // Back from a dish, the map reopens where it was.
  const pinPositions = () => pins.evaluateAll((buttons) => buttons.slice(0, 3).map((button) => {
    const { x, y } = button.getBoundingClientRect()
    return [Math.round(x), Math.round(y)]
  }))
  const beforeDish = await pinPositions()
  await dishLinks.first().click()
  await expect(page).toHaveURL(/\/d\//)
  await expect(page.getByRole('region', { name: 'Pro Portion' })).toBeVisible()
  await page.goBack()
  await expect(map).toBeVisible()
  // The desktop map stays mounted. On phones its overlay insets are measured again on the new mount.
  if (!isPhone(page)) await expect.poll(pinPositions).toEqual(beforeDish)
  await expect.poll(view).toEqual(out)
})

test.describe('compact phone map', () => {
  test.use({ skipLocationPrompt: false, reducedMotion: 'reduce' })

  test('keeps at least 55% of the viewport clear with the ranking collapsed', async ({ page }) => {
    test.skip(!isPhone(page), 'Phone map layout')
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Standort verwenden' })).toBeVisible()
    await page.getByRole('button', { name: 'Später' }).click()

    const toggle = page.getByRole('button', { name: 'Liste öffnen' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('list', { name: 'Beste Gerichte pro Restaurant' }).getByRole('link').first()).toBeVisible()
    for (const height of [844, 664]) {
      await page.setViewportSize({ width: 390, height })
      await expect.poll(() => page.locator('.map-chrome').evaluate((chrome) => {
        const top = chrome.getBoundingClientRect().bottom
        const bottom = document.querySelector('.map-layer')!.getBoundingClientRect().top
        return (bottom - top) / window.innerHeight
      }), { message: `Uncovered map at 390 × ${height}` }).toBeGreaterThanOrEqual(0.55)
    }

    const filters = page.getByRole('group', { name: 'Filter' })
    await filters.getByRole('radio', { name: 'Score' }).click()
    await expect(filters.getByRole('radio', { name: 'Score' })).toBeChecked()
    await filters.getByText('Kategorien', { exact: true }).click()
    await page.getByRole('button', { name: 'Alle Kategorien' }).click()
    await filters.getByRole('button', { name: 'Kiez' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByRole('button', { name: 'In meiner Nähe' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Speisekarte scannen' })).toHaveAttribute('href', '/scan')
    await toggle.click()
    await expect(page.getByRole('button', { name: 'Liste schließen' })).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

test('dish from the ranked list', async ({ page, shot }) => {
  await openRankedDish(page, shot)
  const portion = page.getByRole('region', { name: 'Pro Portion' })
  await expect(portion).toBeVisible()
  await expect(portion.getByText('KI-Schätzung', { exact: true })).toBeVisible()
  await expect(portion).toContainText(/ca\.\s*\d+\s*kcal/)
  await expect(portion).toContainText(/Spanne \d+–\d+ kcal/)
  // Macro rings: protein, carbs and fat, each against the daily target.
  for (const macro of ['Protein', 'Kohlenhydrate', 'Fett']) {
    await expect(portion.getByRole('img', { name: new RegExp(`^ca\\. \\d+ g ${macro}, \\d+ % des Tagesziels$`) })).toBeVisible()
  }
  await expect(page.getByRole('region', { name: 'Health-Score' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zu heute hinzufügen' })).toBeVisible()
  await shot('dish')
})

test('restaurant page', async ({ page, shot }) => {
  await openRankedDish(page, shot)
  const restaurantLink = page.locator('a[href^="/r/"]').filter({ hasText: /·/ }).first()
  const restaurantName = (await restaurantLink.textContent())!.split('·')[0]?.trim() ?? ''
  await restaurantLink.click()
  await expect(page).toHaveURL(/\/r\/[^/?]+/)

  // The ref-3 header: round avatar, name, chips, mini map with a distance pill and Route.
  const place = page.locator('header.place')
  await expect(place.getByRole('heading', { level: 1, name: restaurantName })).toBeVisible()
  await expect(place.locator('.place__avatar')).toBeVisible()
  await expect(place.locator('.place__chips li').first()).toBeVisible()
  await expect(place.locator('.place__chips')).toContainText(/Geöffnet|Geschlossen/)
  await expect(place.locator('.place__map .maplibregl-canvas')).toBeVisible()
  await expect(place.locator('.place__distance')).toContainText(/km|m/)
  await expect(place.getByRole('link', { name: 'Route' })).toHaveAttribute('href', /google\.com\/maps\/dir/)
  await expect(page.getByRole('region', { name: /Speisekarte|Noch keine Speisekarte/ }).first()).toBeVisible()

  const box = (await place.boundingBox())!
  const viewport = page.viewportSize()!
  if (isPhone(page)) {
    // Full screen: its own page with a back button, no map workspace behind it.
    await expect(page.getByRole('button', { name: 'Zurück' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Karte', exact: true })).toHaveCount(0)
    expect(box.width).toBeGreaterThan(viewport.width - 48)
  } else {
    // A docked panel next to the big map.
    await expect(page.getByRole('region', { name: 'Karte', exact: true })).toBeVisible()
    expect(box.width).toBeLessThan(viewport.width / 2)
    expect(box.x).toBeGreaterThan(viewport.width / 2)
  }
  await shot('restaurant')
})

async function labelCollisions(map: Locator) {
  return map.evaluate((el) => {
    const area = el.getBoundingClientRect()
    const pinsAndRoute = [...el.querySelectorAll('.mini-poi__dot, .mini-pin__dot, .place__bar')]
    const visibleNames = [...el.querySelectorAll('.mini-poi__name')].filter((name) => getComputedStyle(name).visibility === 'visible')
    return visibleNames.flatMap((name, index) => {
      const label = name.getBoundingClientRect()
      const clipped = label.left < area.left || label.right > area.right || label.top < area.top || label.bottom > area.bottom
      const collision = [...pinsAndRoute, ...visibleNames.slice(index + 1)].some((other) => {
        const box = other.getBoundingClientRect()
        return label.left < box.right && label.right > box.left && label.top < box.bottom && label.bottom > box.top
      })
      return clipped || collision ? [name.textContent] : []
    })
  })
}

test('Mikoto shows German cuisine and keeps nearby labels clear of pins and the route card', async ({ page, shot }) => {
  test.setTimeout(90_000)
  // Marker geometry uses the real projection. The map flow above covers live tiles.
  await page.route('https://tiles.openfreemap.org/styles/positron', (route) => route.fulfill({
    json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background' }] },
  }))
  await page.goto('/r/osm-node-448603850', { waitUntil: 'domcontentloaded' })
  const place = page.locator('header.place')
  await expect(place.getByRole('heading', { name: 'Mikoto', exact: true })).toBeVisible()
  await expect(place.locator('.place__cuisine')).toHaveText('Sushi, Vietnamesisch')

  const map = place.locator('.place__map')
  await expect(map.getByRole('button', { name: 'Maison Umami' })).toBeVisible({ timeout: 30_000 })
  await expect(map.locator('.mini-poi__name', { hasText: /^Maison Umami$/ })).toBeVisible()
  expect(await labelCollisions(map)).toEqual([])
  await shot('label-placement')
})

test('Sagano keeps the Pho neighbour label visible and clear of the route card', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('https://tiles.openfreemap.org/styles/positron', (route) => route.fulfill({
    json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background' }] },
  }))
  await page.goto('/r/osm-node-1882067150', { waitUntil: 'domcontentloaded' })
  const map = page.locator('header.place .place__map')
  const pho = map.locator('.mini-poi__name', { hasText: /^Pho$/ })
  await expect(pho).toBeVisible({ timeout: 30_000 })
  expect(await labelCollisions(map)).toEqual([])
})

test('search with filter chips', async ({ page, shot }) => {
  await page.goto('/entdecken')
  await mainNav(page).getByRole('link', { name: 'Suche' }).click()
  await expect(page).toHaveURL(/\/search/)
  await expect(page.getByRole('heading', { level: 1, name: 'Suche' })).toBeVisible()
  await shot('search')

  const chips = page.getByRole('group', { name: 'Schnellfilter' })
  for (const chip of ['Unter 12 €', '40 g+ Protein']) {
    await chips.getByRole('button', { name: chip }).click()
    await expect(chips.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('searchbox', { name: 'Gerichte und Restaurants suchen' }).last().fill('chicken')
  await expect(page).toHaveURL(/q=chicken/)
  await expect(page.getByText(/^\d+ Gerichte?$/).first()).toBeVisible()
  await shot('search-filtered')

  const results = page.locator('article').filter({ has: page.getByRole('heading', { level: 3 }) })
  await expect(results.first()).toBeVisible()
  const cards = await results.evaluateAll((articles) =>
    articles.map((article) => {
      const value = (term: string) => [...article.querySelectorAll('dt')].find((dt) => dt.textContent?.trim() === term)?.nextElementSibling?.textContent ?? ''
      return { name: article.querySelector('h3')?.textContent?.trim() ?? '', price: value('Preis'), protein: value('Protein') }
    }),
  )
  expectHealthy(
    cards.map((card) => card.name),
    'search results',
  )
  for (const card of cards) {
    const euros = Number(card.price.replace(/[^\d,]/g, '').replace(',', '.'))
    expect(euros, `${card.name} costs ${card.price}`).toBeLessThanOrEqual(12)
    const protein = Number(/(\d+)\s*g/.exec(card.protein)?.[1])
    expect(protein, `${card.name} has ${card.protein}`).toBeGreaterThanOrEqual(40)
  }
})

test('Passt zu deinem Tag sheet', async ({ page, shot }) => {
  await page.goto('/entdecken')
  await page
    .getByRole('button', { name: /^Passt zu deinem Tag/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: /übrig|Dein Tag ist voll/ })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Passt zu deinem Tag', { exact: true })).toBeVisible()
  const picks = sheet.locator('.fit-picks a[href^="/d/"]')
  await expect(picks.first()).toBeVisible()
  const names = (await picks.evaluateAll((links) => links.map((a) => a.getAttribute('aria-label')))).map(dishName)
  expect(names.length).toBeLessThanOrEqual(3)
  expectHealthy(names, 'Passt zu deinem Tag')
  await shot('fit-day')
  await picks.first().click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/d\/[^/?]+/)
  await expect(page.getByRole('region', { name: 'Pro Portion' })).toBeVisible()
  await shot('fit-day-dish')
})

test('Today: log a dish', async ({ page, shot }) => {
  const name = await openRankedDish(page, shot)
  await page.getByRole('button', { name: 'Zu heute hinzufügen' }).click()
  await expect(page.getByRole('button', { name: 'Für heute eingetragen' })).toBeVisible()
  await shot('dish-logged')

  await mainNav(page).getByRole('link', { name: 'Heute' }).click()
  await expect(page).toHaveURL(/\/today/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dein Tag' })).toBeVisible()
  const eaten = page.getByRole('region', { name: 'Heute gegessen' })
  await expect(eaten).toContainText(name)
  await expect(eaten.getByText('Noch nichts eingetragen')).toHaveCount(0)
  await expect(page.getByText(/^0 \/ [\d.]+$/)).toHaveCount(0)
  await shot('today')
})

test('share a dish link', async ({ page, shot }) => {
  await openRankedDish(page, shot)
  await page.getByRole('button', { name: 'Teilen', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: /teilen/i })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.share-card--loaded')).toBeVisible()
  await shot('share-sheet')

  const recorded = live ? null : page.waitForResponse((response) => response.url().endsWith('/api/shares') && response.request().method() === 'POST')
  await sheet.getByRole('button', { name: 'Link kopieren' }).click()
  await expect(sheet.getByRole('button', { name: 'Kopiert' })).toBeVisible()
  if (recorded) expect((await recorded).ok()).toBe(true)
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/d\/[^/?]+\?ref=copy&s=[\w-]+$/)
  await shot('share-copied')

  // The shared link opens the dish with link-preview tags. Live runs drop ref and s so visits stay uncounted.
  const url = new URL(link)
  if (live) url.search = ''
  const response = await page.goto(url.pathname + url.search)
  expect(response?.status()).toBe(200)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/share\/[^/]+\/og/)
  // The share card behind the link preview renders as an image.
  const card = await page.request.get((await page.locator('meta[property="og:image"]').getAttribute('content'))!)
  expect(card.ok()).toBe(true)
  expect(card.headers()['content-type']).toMatch(/^image\//)
  await expect(page.getByRole('region', { name: 'Pro Portion' })).toBeVisible()
  await shot('shared-link')
})

test('legal pages from the footer', async ({ page, shot }) => {
  await page.goto('/entdecken')
  // The end of Entdecken on the phone, the sidebar foot on desktop.
  const footer = (isPhone(page) ? page.getByRole('main') : mainNav(page)).getByRole('navigation', { name: 'Rechtliches' })
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeVisible()
  await shot('footer')

  await footer.getByRole('link', { name: 'Impressum' }).click()
  await expect(page).toHaveURL(/\/impressum$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Impressum' })).toBeVisible()
  await shot('impressum')

  await page.goBack()
  await expect(page).toHaveURL(/\/entdecken$/)
  await footer.scrollIntoViewIfNeeded()
  await footer.getByRole('link', { name: 'Datenschutz' }).click()
  await expect(page).toHaveURL(/\/datenschutz$/)
  await expect(page.getByRole('heading', { level: 1, name: /Datenschutz/ })).toBeVisible()
  await shot('datenschutz')
})
