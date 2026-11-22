// The rest of the app, clicked through at 1440x900 (desktop) and 390x844 (phone): goal setup, the camera
// (plate and menu), the community (menu scan, a new restaurant, confirming a dish, profile, leaderboard)
// and the installable app (install hint, offline). Live runs answer writes themselves (fixtures.ts).
import type { Page } from '@playwright/test'
import { mainNav, menuPhoto, openRankedDish, platePhoto, type Photo } from './app.ts'
import { expect, expectHealthy, isPhone, live, test } from './fixtures.ts'

/** Whether this deployment is accepting community menu photos. */
async function uploadsEnabled(page: Page): Promise<boolean> {
  const response = await page.request.get('/api/submissions/config')
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { uploadsEnabled: boolean }).uploadsEnabled
}

/** The community scan's first step: a photo from the gallery. */
async function pickMenuPhoto(page: Page, photo: Photo) {
  await expect(page.getByRole('heading', { level: 1, name: 'Fotografier die Speisekarte' })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Aus Galerie wählen' }).click()
  await (await chooser).setFiles(photo)
  await expect(page.getByRole('img', { name: 'Dein Foto der Speisekarte' })).toBeVisible()
}

async function submitPrivatePhoto(page: Page, source: string, photo: Photo): Promise<string | undefined> {
  const chooser = page.waitForEvent('filechooser')
  const scan = page.waitForResponse(
    (response) => response.url().endsWith('/api/scans') && response.request().method() === 'POST',
    { timeout: 45_000 },
  )
  await page.getByText(source, { exact: true }).click()
  await (await chooser).setFiles(photo)
  const response = await scan
  expect(response.ok(), `POST /api/scans returned ${response.status()}`).toBe(true)
  const { scan: saved } = (await response.json()) as { scan: { mode?: string; photo?: { url: string } | null } }
  if (process.env.E2E_LIVE_AI === '1') {
    const { env } = (await (await page.request.get('/api/health')).json()) as { env: string }
    if (env === 'production') expect(saved.mode, 'production scan answered by OpenAI').toBe('openai')
    else expect(['openai', 'anthropic'], 'scan answered by a real provider').toContain(saved.mode)
  }
  if (live) return
  expect(saved.photo?.url).toMatch(/^\/api\/scans\/[^/]+\/photo$/)
  const stored = await page.request.get(saved.photo!.url)
  expect(stored.status()).toBe(200)
  expect(stored.headers()['content-type']).toBe('image/webp')
  expect(stored.headers()['cache-control']).toBe('private, no-store')
  expect((await stored.body()).byteLength).toBeLessThan(1024 * 1024)
  return saved.photo!.url
}

test('goal setup', async ({ page, shot }) => {
  await page.goto('/today')
  await expect(page.getByText('Richtwert: noch kein eigenes Tagesziel')).toBeVisible()
  await page.getByRole('link', { name: /^Auf mich zuschneiden/ }).click()
  await expect(page).toHaveURL(/\/onboarding$/)

  const next = page.getByRole('button', { name: 'Weiter' })
  await expect(page.getByRole('progressbar', { name: 'Frage 1 von 5' })).toBeAttached()
  await expect(next).toBeDisabled()
  await page.getByRole('radio', { name: /^Muskeln aufbauen/ }).click()
  await shot('goal')
  await next.click()

  // Calories: the recommended value is preselected; pick our own instead.
  await expect(page.getByRole('heading', { level: 1, name: 'Wie viele Kalorien am Tag?' })).toBeVisible()
  await page.getByRole('radio', { name: /^Eigener Wert/ }).click()
  await page.getByRole('textbox', { name: 'Kalorien pro Tag' }).fill('2600')
  await shot('kcal')
  await next.click()

  await expect(page.getByRole('heading', { level: 1, name: 'Wie viel Protein am Tag?' })).toBeVisible()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)
  await next.click()

  await expect(page.getByRole('heading', { level: 1, name: 'Wie isst du?' })).toBeVisible()
  await page.getByRole('button', { name: 'Überspringen' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Wo suchst du meistens?' })).toBeVisible()
  await page.getByRole('radio', { name: /^In einem Kiez/ }).click()
  await page.getByRole('radiogroup', { name: 'Kiez wählen' }).getByRole('radio', { name: 'Kreuzberg' }).click()
  await shot('place')
  await page.getByRole('button', { name: 'Gerichte finden' }).click()

  // A short count-up, then the dishes that fit the new goal.
  await expect(page.getByText('Gerichte geprüft')).toBeVisible()
  const result = page.getByRole('heading', { level: 1, name: /zu dir passt|zu dir passen|Heute passt leider nichts/ })
  await expect(result).toBeVisible()
  await expect(result).not.toHaveText('Heute passt leider nichts')
  const picks = page.locator('.onb-picks .hero-card__name')
  await expect(picks.first()).toBeVisible()
  expectHealthy(await picks.allTextContents(), 'goal setup picks')
  await shot('result')

  await page.getByRole('button', { name: 'Zu meinem Tag' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByText('Richtwert: noch kein eigenes Tagesziel')).toHaveCount(0)
  await expect(page.getByText(/^0 \/ 2\.600$/)).toBeVisible()
  await shot('today-with-goal')
})

test('camera: plate photo into today', async ({ page, shot }) => {
  const photo = await platePhoto()
  await page.goto('/today')
  await page.getByRole('link', { name: /^Teller scannen/ }).click()
  await expect(page).toHaveURL(/\/kamera\?art=teller$/)
  await expect(page.getByRole('tab', { name: 'Teller' })).toHaveAttribute('aria-selected', 'true')
  await shot('camera')

  const source = isPhone(page) ? 'Foto aufnehmen' : 'Foto hochladen'
  if (isPhone(page)) await expect(page.getByLabel(source)).toHaveAttribute('capture', 'environment')
  const photoUrl = await submitPrivatePhoto(page, source, photo)
  const estimate = page.getByRole('region', { name: /.+/ }).filter({ hasText: 'KI-Schätzung' })
  await expect(estimate).toBeVisible()
  await expect(estimate).toContainText(/Spanne [\d.]+-[\d.]+ kcal/)
  for (const macro of ['Protein', 'Kohlenhydrate', 'Fett']) await expect(estimate.getByText(macro, { exact: true })).toBeVisible()
  const meal = (await estimate.getByRole('heading', { level: 2 }).textContent())!.trim()
  await shot('plate-estimate')

  await estimate.getByRole('button', { name: 'Zu heute hinzufügen' }).click()
  await expect(estimate.getByRole('button', { name: 'Für heute eingetragen' })).toBeDisabled()
  await estimate.getByRole('link', { name: 'Heute ansehen' }).click()
  await expect(page).toHaveURL(/\/today/)
  await expect(page.getByRole('region', { name: 'Heute gegessen' })).toContainText(meal)
  await shot('today')
  if (photoUrl) {
    const recent = page.locator('.recent__card').filter({ hasText: meal })
    await expect(recent.locator('img')).toHaveAttribute('src', photoUrl)
    await recent.getByRole('button', { name: 'Foto löschen' }).click()
    await expect(recent.locator('img')).toHaveCount(0)
    expect((await page.request.get(photoUrl)).status()).toBe(404)
  }
})

test('camera: menu photo saved privately', async ({ page, shot }) => {
  const photo = await menuPhoto(page)
  await page.goto('/today')
  await page.getByRole('region', { name: 'Heute bisher' }).waitFor()
  await page.getByRole('link', { name: /^Speisekarte scannen Gerichte lesen/ }).click()
  await expect(page).toHaveURL(/\/kamera\?art=karte$/)
  await expect(page.getByRole('tab', { name: 'Speisekarte' })).toHaveAttribute('aria-selected', 'true')

  await submitPrivatePhoto(page, 'Foto hochladen', photo)
  const reading = page.getByRole('region', { name: /.+/ }).filter({ hasText: 'Unter „Meine Karten“ gespeichert' })
  await expect(reading).toBeVisible()
  await expect(reading).toContainText(/\d+ Gerichte? erkannt/)
  const first = reading.getByRole('button', { name: / für heute eintragen$/ }).first()
  const dish = (await first.getAttribute('aria-label'))!.replace(/ für heute eintragen$/, '')
  await first.click()
  await expect(reading.getByRole('button', { name: `${dish} eingetragen` })).toBeVisible()
  await shot('menu-reading')

  // Sharing with the community: the form only. The upload behind it is the community scan's (tests below),
  // and the Worker takes five photos an hour per address, which the two community flows already use up most of.
  await reading.getByRole('button', { name: 'Mit Community teilen' }).click()
  const share = reading.locator('form.share-panel')
  const send = share.getByRole('button', { name: 'Teilen' })
  await expect(send).toBeDisabled()
  await share.getByRole('textbox', { name: 'Restaurant' }).fill('Café Grünkern')
  await share.getByRole('checkbox').check()
  await expect(send).toBeDisabled()
  const pinMap = share.getByRole('region', { name: /Karte: Pin/ })
  await expect(pinMap).toBeVisible()
  const box = (await pinMap.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 })
  await page.mouse.up()
  await expect(send).toBeEnabled()
  await shot('menu-share')

  await reading.getByRole('link', { name: 'Meine Karten' }).click()
  await expect(page).toHaveURL(/\/today#cards-title$/)
  const cards = page.getByRole('region', { name: 'Meine Karten' })
  await expect(cards.getByText('Noch keine Speisekarte gespeichert')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Heute gegessen' })).toContainText(dish)
  await shot('my-cards')
})

test('community: scan a restaurant menu', async ({ page, shot }) => {
  const enabled = await uploadsEnabled(page)
  await openRankedDish(page, shot)
  await page.locator('a[href^="/r/"]').filter({ hasText: /·/ }).first().click()
  await expect(page).toHaveURL(/\/r\/[^/?]+/)
  const restaurant = (await page.locator('header.place').getByRole('heading', { level: 1 }).textContent())!.trim()
  // The scan card of this restaurant ("Bist du gerade hier?"), not the map's general scan button.
  await page.locator('a[href^="/scan?r="]').first().click()
  await expect(page).toHaveURL(/\/scan\?r=/)

  if (!enabled) {
    await expect(page.getByRole('status')).toContainText(/Foto-Upload gerade nicht verfügbar|Für heute sind genug Fotos da/)
    await expect(page.getByRole('button', { name: 'Aus Galerie wählen' })).toHaveCount(0)
    await shot('uploads-unavailable')
    return
  }
  await pickMenuPhoto(page, await menuPhoto(page))
  await shot('photo')
  await page.getByRole('button', { name: 'Weiter' }).click()
  // Opened from the restaurant page, the restaurant is already chosen.
  await expect(page.getByRole('radio', { name: new RegExp(`^${restaurant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBeChecked()
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Alles bereit?' })).toBeVisible()
  const send = page.getByRole('button', { name: 'Foto senden' })
  await expect(send).toBeDisabled()
  await page.getByRole('checkbox').check()
  await expect(send).toBeEnabled()
  await shot('ready')
  if (live) return

  await send.click()
  await expect(page).toHaveURL(/\/scan\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 2, name: restaurant, exact: true })).toBeVisible()
  await expect(page.getByText(/^(Wird geprüft|Online|Nicht online)$/)).toBeVisible()
  await shot('status')
})

test('community: add a new restaurant', async ({ page, shot }) => {
  test.skip(!(await uploadsEnabled(page)), 'this deployment takes no menu photos (uploadsEnabled false)')
  const photo = await menuPhoto(page)
  await page.goto('/scan')
  await pickMenuPhoto(page, photo)
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Von welchem Restaurant?' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Restaurant suchen' }).fill('Café Grünkern')
  await expect(page.getByText('Kein Restaurant mit diesem Namen bei uns.')).toBeVisible()
  await page.getByRole('radio', { name: /^Neues Restaurant hinzufügen/ }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Neues Restaurant' })).toBeVisible()
  const next = page.getByRole('button', { name: 'Weiter' })
  await expect(next).toBeDisabled()
  await page.getByRole('textbox', { name: 'Name' }).fill('Café Grünkern')
  await page.getByRole('textbox', { name: 'Adresse' }).fill('Oranienstraße 12, 10999')
  await expect(next).toBeDisabled()
  const map = page.locator('.pin-map .maplibregl-canvas')
  await expect(map).toBeVisible({ timeout: 30_000 })
  await map.scrollIntoViewIfNeeded()
  const bounds = await map.boundingBox()
  if (!bounds) throw new Error('Restaurant pin map is missing')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 55, y, { steps: 8 })
  await page.mouse.up()
  await expect(next).toBeEnabled()
  await shot('new-restaurant')
  await next.click()

  await expect(page.getByText('Neu · Oranienstraße 12, 10999')).toBeVisible()
  await page.getByRole('checkbox').check()
  const send = page.getByRole('button', { name: 'Foto senden' })
  await expect(send).toBeEnabled()
  await shot('ready')
  if (live) return

  await send.click()
  await expect(page).toHaveURL(/\/scan\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Café Grünkern' })).toBeVisible()
  await expect(page.getByText('Neue Restaurants prüfen wir immer von Hand.', { exact: false })).toBeVisible()
  await shot('status')
})

test('community: confirm a dish', async ({ page, shot }) => {
  await openRankedDish(page, shot)
  const review = page.getByRole('region', { name: 'Hat das gestimmt?' })
  await review.scrollIntoViewIfNeeded()
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Ja, passt' }).click()
  await expect(review.getByRole('status')).toContainText('Deine Bestätigung zählt ab sofort mit.')
  await expect(review.locator('.cm-confirm__sub')).toContainText(/von \d+ Person(?:en)? bestätigt/)
  await shot('confirmed')
  const badge = page.getByRole('dialog').filter({ hasText: 'Abzeichen freigeschaltet' })
  if (await badge.isVisible()) await badge.getByRole('button', { name: 'Schließen' }).click()

  // Changing the vote to "no" with a correction.
  await review.getByRole('button', { name: 'Ändern' }).click()
  await review.getByRole('button', { name: 'Nein' }).click()
  await review.getByRole('textbox', { name: /Was war anders/ }).fill('Kostet jetzt 50 Cent mehr')
  await review.getByRole('button', { name: 'Senden' }).click()
  await expect(review.getByRole('status')).toContainText('Wir schauen uns das an.')
  await shot('corrected')
})

test('community: profile and leaderboard', async ({ page, shot }) => {
  await page.goto('/entdecken')
  // The profile button on Entdecken on the phone, "Community" in the sidebar on desktop.
  if (isPhone(page)) await page.getByRole('main').getByRole('link', { name: 'Profil' }).click()
  else await mainNav(page).getByRole('link', { name: 'Community' }).click()
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Abzeichen' }).getByRole('listitem')).toHaveCount(3)
  await expect(page.getByRole('region', { name: 'Beiträge' }).getByRole('tab', { name: 'Karten' })).toHaveAttribute('aria-selected', 'true')
  await shot('profile')

  const saved = page.waitForRequest((request) => request.url().endsWith('/api/me') && request.method() === 'PATCH')
  await page.getByRole('button', { name: /^(Namen wählen|Name ändern)$/ }).click()
  await page.getByRole('textbox', { name: 'Dein Name in der Bestenliste' }).fill('Testesser')
  await page.getByRole('button', { name: 'Speichern' }).click()
  expect((await saved).postDataJSON()).toEqual({ nickname: 'Testesser' })
  // Live runs do not store the name (fixtures.ts), so only the local run sees it come back.
  if (!live) await expect(page.getByRole('heading', { level: 1, name: 'Testesser' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Dein Name in der Bestenliste' })).toHaveCount(0)
  await shot('profile-named')

  await page.getByRole('link', { name: 'Kiez-Bestenliste' }).click()
  await expect(page).toHaveURL(/\/bestenliste$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Ganz Berlin' })).toBeVisible()
  await page.getByRole('tablist', { name: 'Zeitraum' }).getByRole('tab', { name: 'Gesamt' }).click()
  await expect(page.getByRole('tab', { name: 'Gesamt' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tablist', { name: 'Kiez' }).getByRole('tab', { name: 'Kreuzberg' }).click()
  await expect(page).toHaveURL(/k=kreuzberg/)
  await expect(page.getByRole('heading', { level: 1, name: 'Kreuzberg' })).toBeVisible()
  await expect(page.getByText(/Bestenliste gerade nicht erreichbar/)).toHaveCount(0)
  await shot('leaderboard')
})

test('install hint', async ({ page, shot }) => {
  // Headless Chromium never offers installing, so stand in for the browser: iOS Safari's manual steps on the
  // phone, Chrome's install prompt on desktop. The hint itself comes from the app after logging a dish.
  if (isPhone(page)) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      })
    })
  } else {
    await page.addInitScript(() => {
      ;(window as unknown as { prompted: boolean }).prompted = false
      window.addEventListener('load', () => {
        const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt(): Promise<void>; userChoice: Promise<unknown> }
        event.prompt = async () => void ((window as unknown as { prompted: boolean }).prompted = true)
        event.userChoice = Promise.resolve({ outcome: 'accepted' })
        window.dispatchEvent(event)
      })
    })
  }
  await openRankedDish(page, shot)
  await page.getByRole('button', { name: 'Zu heute hinzufügen' }).click()
  const hint = page.getByRole('dialog', { name: 'DishFit auf deinen Home-Bildschirm' })
  await expect(hint).toBeVisible()
  await shot('install-hint')
  if (isPhone(page)) {
    await expect(hint).toContainText('Zum Home-Bildschirm')
    await hint.getByRole('button', { name: 'Verstanden' }).click()
  } else {
    await hint.getByRole('button', { name: 'Installieren' }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { prompted: boolean }).prompted)).toBe(true)
  }
  await expect(hint).toBeHidden()
  // Offered once: the device remembers it was shown.
  expect(await page.evaluate(() => localStorage.getItem('dishfit.installHint.v1'))).toBeTruthy()
})

test('installable and offline', async ({ page, context, problems, shot }) => {
  await page.goto('/entdecken')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await page.request.get(manifestHref!)).json()
  expect(manifest).toMatchObject({ display: 'standalone', start_url: expect.stringMatching(/^\//) })
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await page.request.get(icon.src)).ok(), `manifest icon ${icon.src}`).toBe(true)
  }

  // The service worker installs, precaches the app and takes over the page.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  const before = problems.length
  await page.reload()
  await expect(page.getByRole('link', { name: /^Platz 1: / })).toBeVisible()
  await shot('offline-entdecken')
  await page.getByRole('link', { name: /^Platz 1: / }).click()
  await expect(page).toHaveURL(/\/d\/[^/?]+/)
  await expect(page.getByRole('region', { name: 'Pro Portion' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zu heute hinzufügen' })).toBeVisible()
  await shot('offline-dish')
  // Offline, network calls fail by design (/api, analytics, map tiles) and dish photos never opened online are
  // not in the cache: drop those from the report, and note the photos that show up broken.
  const offline = problems.splice(before)
  const photos = offline.filter((problem) => /^request failed: GET .+\/assets\/.+\.(?:jpe?g|webp|png) /.test(problem))
  if (photos.length) test.info().annotations.push({ type: 'offline photos missing', description: photos.join('\n') })
  const network = /ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource: net::ERR_FAILED/i
  problems.push(...offline.filter((problem) => !network.test(problem) && !photos.includes(problem)))
  await context.setOffline(false)
})
