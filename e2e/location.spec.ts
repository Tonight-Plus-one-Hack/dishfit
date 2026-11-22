import { expect, test, type Page } from '@playwright/test'

const heading = 'Zeig mir gesunde Gerichte in deiner Nähe'
const berlin = { latitude: 52.512345, longitude: 13.428765 }

async function mockPosition(page: Page, result: { latitude: number; longitude: number } | { code: number } | null) {
  await page.addInitScript((mocked) => {
    let calls = 0
    Object.defineProperty(window, 'locationRequests', { get: () => calls })
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value(success: PositionCallback, fail: PositionErrorCallback) {
        calls += 1
        setTimeout(() => {
          if (mocked && 'latitude' in mocked) success({ coords: { ...mocked, accuracy: 50 } } as GeolocationPosition)
          else fail({ code: mocked && 'code' in mocked ? mocked.code : 1 } as GeolocationPositionError)
        }, 30)
      },
    })
  }, result)
}

const requests = (page: Page) => page.evaluate(() => Reflect.get(window, 'locationRequests') as number)

test('location waits for consent and Later survives reload', async ({ page }) => {
  await mockPosition(page, berlin)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  expect(await requests(page)).toBe(0)

  await page.getByRole('button', { name: 'Später' }).click()
  await expect(page.getByRole('button', { name: 'In meiner Nähe' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: heading })).toHaveCount(0)
  expect(await requests(page)).toBe(0)

  await page.getByRole('button', { name: 'In meiner Nähe' }).click()
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  expect(await requests(page)).toBe(0)
})

test('Berlin location centres the map and ranks by distance without sending coordinates', async ({ page }) => {
  await mockPosition(page, berlin)
  const transmitted: string[] = []
  page.on('request', (request) => transmitted.push(request.url(), request.postData() ?? ''))
  await page.addInitScript(() => localStorage.setItem('dishfit.position.v1', JSON.stringify({ position: { lat: 52.50111, lng: 13.40111 }, status: 'granted' })))
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  expect(await requests(page)).toBe(0)

  await page.getByRole('button', { name: 'Standort verwenden' }).click()
  await expect(page.getByRole('img', { name: 'Dein Standort' })).toBeVisible({ timeout: 30_000 })
  const sheetToggle = page.locator('.rank-sheet__toggle')
  if (await sheetToggle.isVisible()) await sheetToggle.click()
  await expect(page.getByText(/nach 1-km-Stufen/)).toBeVisible()
  await expect(page.locator('.rank-card__where, .place-chip__where').filter({ hasText: /\d(?:[,.]\d)?\s*(?:km|m)\b/ }).first()).toBeVisible()
  expect(await requests(page)).toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('dishfit.position.v1'))).toBeNull()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/52\.512345|13\.428765/)
  expect(await page.evaluate(() => sessionStorage.getItem('dishfit.map.view.v1'))).toBeNull()
  expect(transmitted.join('\n')).not.toMatch(/52\.512345|13\.428765|52\.512|13\.429/)

  await page.reload()
  await expect(page.getByRole('button', { name: 'In meiner Nähe' })).toBeVisible({ timeout: 30_000 })
  expect(await requests(page)).toBe(0)
})

for (const [name, result] of [['denied', null], ['outside Berlin', { latitude: 48.13, longitude: 11.58 }], ['inside the box but outside Berlin', { latitude: 52.4, longitude: 13.1 }]] as const) {
  test(`${name} offers a Kiez without an error`, async ({ page }) => {
    await mockPosition(page, result)
    await page.goto('/entdecken')
    await page.getByRole('button', { name: 'Standort verwenden' }).click()
    await expect(page.getByRole('button', { name: 'Kreuzberg', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: 'Kreuzberg', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Protein-Gerichte.*in Kreuzberg/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: /Protein-Gerichte.*in Kreuzberg/ })).toBeVisible()
    expect(await requests(page)).toBe(0)
  })
}

const safariUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const chromeUA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const instagramUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.0.30.109'

const recoveryCauses = [
  ['denied', { code: 1 }, 'Standort blockiert'],
  ['unavailable', { code: 2 }, 'Standort nicht verfügbar'],
  ['timeout', { code: 3 }, 'Standort dauert zu lange'],
] as const

for (const [cause, result, title] of recoveryCauses) {
  test(`${cause} shows its own help, a Kiez and a retry`, async ({ page }) => {
    await mockPosition(page, result)
    await page.goto('/entdecken')
    await page.getByRole('button', { name: 'Standort verwenden' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nochmal versuchen' })).toBeVisible()
    await page.getByRole('button', { name: 'Kreuzberg', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Protein-Gerichte.*in Kreuzberg/ })).toBeVisible()
    expect(await requests(page)).toBe(1)
  })
}

test('insecure context explains http without asking the browser', async ({ page }) => {
  await mockPosition(page, berlin)
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }))
  await page.goto('/entdecken')
  await page.getByRole('button', { name: 'Standort verwenden' }).click()
  await expect(page.getByRole('heading', { name: 'Standort braucht eine sichere Verbindung' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kreuzberg', exact: true })).toBeVisible()
  expect(await requests(page)).toBe(0)
})

test('missing geolocation counts as unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: undefined }))
  await page.goto('/entdecken')
  await page.getByRole('button', { name: 'Standort verwenden' }).click()
  await expect(page.getByRole('heading', { name: 'Standort nicht verfügbar' })).toBeVisible()
})

for (const [browser, userAgent, guidance] of [['Safari', safariUA, /Website-Einstellungen/], ['Chrome', chromeUA, /Site settings|Website-Einstellungen/], ['Instagram', instagramUA, /In Safari öffnen/]] as const) {
  test.describe(`${browser} help`, () => {
    test.use({ userAgent })
    test('opens from the blocked location button and only re-requests on retry', async ({ page }) => {
      await mockPosition(page, { code: 1 })
      await page.goto('/entdecken')
      await page.getByRole('button', { name: 'Standort verwenden' }).click()
      await expect(page.getByRole('note')).toContainText(guidance)
      await page.getByRole('button', { name: 'Später' }).click()
      await page.getByRole('button', { name: 'Standort blockiert', exact: true }).and(page.locator('.locate-hint')).click()
      await expect(page.getByRole('heading', { name: 'Standort blockiert' })).toBeVisible()
      await expect(page.getByRole('note')).toContainText(guidance)
      expect(await requests(page)).toBe(1)
      await page.getByRole('button', { name: 'Nochmal versuchen' }).click()
      await expect.poll(() => requests(page)).toBe(2)
    })
  })
}
