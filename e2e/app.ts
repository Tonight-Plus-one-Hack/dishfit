// Ways into the app the flows share: the ranked list on Entdecken and the main navigation.
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, expectHealthy } from './fixtures.ts'

/** The ranked dishes on Entdecken, labelled "Platz 1: <dish> bei <restaurant>". */
export const rankedLinks = (page: Page) => page.getByRole('link', { name: /^Platz \d+: .+ bei / })
export const dishName = (label: string | null) => (label ?? '').replace(/^Platz \d+: /, '').replace(/ bei [^]*$/, '')

/** Main navigation: the bottom tab bar on the phone, the sidebar on desktop. */
export const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Hauptnavigation' })

/** Opens Entdecken and the first ranked dish whose nutrition is an AI estimate; returns the dish name. */
export async function openRankedDish(page: Page, shot: (name: string) => Promise<void>): Promise<string> {
  await page.goto('/entdecken')
  await expect(rankedLinks(page).first()).toBeVisible()
  const labels = await rankedLinks(page).evaluateAll((links) => links.map((a) => a.getAttribute('aria-label')))
  expectHealthy(labels.map(dishName), 'Entdecken ranking')
  await shot('entdecken')
  const link = rankedLinks(page).filter({ hasText: 'KI-Schätzung' }).first()
  const name = dishName(await link.getAttribute('aria-label'))
  await link.click()
  await expect(page).toHaveURL(/\/d\/[^/?]+/)
  await expect(page.getByRole('heading', { level: 1, name, exact: true }).first()).toBeVisible()
  return name
}

export interface Photo {
  name: string
  mimeType: string
  buffer: Buffer
}

/** Use an existing dish image so changes in the ranking don't change the scan input. */
export async function platePhoto(): Promise<Photo> {
  const image = new URL('../apps/web/src/data/seed/pipeline/images/scampi-skaras-1be84ffd.webp', import.meta.url)
  return { name: 'teller.webp', mimeType: 'image/webp', buffer: await readFile(image) }
}

/**
 * A printed menu, rendered in a separate tab of the same browser, so the AI has real dishes to read.
 * The receipt number makes every photo unique because the Worker rejects duplicates.
 */
export async function menuPhoto(page: Page): Promise<Photo> {
  const paper = await page.context().newPage()
  await paper.setViewportSize({ width: 800, height: 1000 })
  await paper.setContent(`<body style="margin:0;padding:56px 64px;background:#faf6ee;font:24px Georgia,serif;color:#222">
    <h1 style="text-align:center;font-size:44px;margin:0 0 8px">Café Grünkern</h1>
    <p style="text-align:center;margin:0 0 40px;letter-spacing:4px">MITTAGSKARTE · Bon ${randomUUID().slice(0, 8)}</p>
    ${[
      ['Hähnchen-Bowl', 'Reis, gegrilltes Hähnchen, Edamame, Gurke, Sesam', '11,90'],
      ['Rote Linsensuppe', 'Linsen, Karotte, Zitrone, Brot', '6,50'],
      ['Lachs mit Ofengemüse', 'Lachsfilet, Süßkartoffel, Brokkoli', '15,90'],
      ['Falafel-Teller', 'Falafel, Hummus, Salat, Pita', '9,50'],
    ]
      .map(([dish, text, price]) => `<div style="display:flex;justify-content:space-between;margin:0 0 6px"><b>${dish}</b><b>${price} €</b></div><p style="margin:0 0 28px;font-size:20px;color:#555">${text}</p>`)
      .join('')}
  </body>`)
  const buffer = await paper.screenshot({ type: 'jpeg', quality: 85 })
  await paper.close()
  return { name: 'speisekarte.jpg', mimeType: 'image/jpeg', buffer }
}
