import { describe, expect, it } from 'vitest'
import { catalogs, message, resolveLanguage } from './index'
import { dishDescription, menuSection } from '../lib/menu-copy'
import { formatCuisine } from '../lib/cuisine'

describe('DishFit message catalogs', () => {
  it('have identical keys and interpolation slots', () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(Object.keys(catalogs.de).sort())
    for (const key of Object.keys(catalogs.de) as Array<keyof typeof catalogs.de>) {
      const slots = (text: string) => [...new Set(text.match(/\{\d+\}/g))].sort()
      expect(slots(catalogs.en[key]), key).toEqual(slots(catalogs.de[key]))
      expect(catalogs.en[key].trim(), key).not.toBe('')
      expect(catalogs.de[key].trim(), key).not.toBe('')
    }
  })

  it('interpolates values without interpreting content as markup or as another slot', () => {
    expect(message('en', 'saveDish', 'Bowl {2} <3')).toBe('Save Bowl {2} <3')
    expect(message('de', 'saveDish', 'Bowl {2} <3')).toBe('Bowl {2} <3 merken')
  })
})

describe('language selection', () => {
  it('chooses German for German browser variants and English for other browsers', () => {
    expect(resolveLanguage(null, 'de-AT')).toBe('de')
    expect(resolveLanguage(null, 'DE')).toBe('de')
    expect(resolveLanguage(null, 'de')).toBe('de')
    expect(resolveLanguage(null, 'en-GB')).toBe('en')
    expect(resolveLanguage('fr', 'fr-FR')).toBe('en')
  })

  it('prefers a remembered choice over the browser language', () => {
    expect(resolveLanguage('en', 'de-DE')).toBe('en')
    expect(resolveLanguage('de', 'en-US')).toBe('de')
  })
})

describe('localized menu data', () => {
  it('uses supplied English descriptions and preserves the original when missing', () => {
    const dish = { description: 'Gerösteter Blumenkohl', descriptionEn: 'Roasted cauliflower' }
    expect(dishDescription(dish, 'de')).toBe('Gerösteter Blumenkohl')
    expect(dishDescription(dish, 'en')).toBe('Roasted cauliflower')
    expect(dishDescription({ ...dish, descriptionEn: ' ' }, 'en')).toBe('Gerösteter Blumenkohl')
    expect(dishDescription({ description: null }, 'en')).toBeNull()
  })

  it('translates standard menu headings and known cuisine tags', () => {
    expect(menuSection('HAUPTGERICHTE', 'en')).toBe('Main courses')
    expect(menuSection('HAUPTGERICHTE', 'de')).toBe('HAUPTGERICHTE')
    expect(menuSection('Ma’Loa Favoriten', 'en')).toBe('Ma’Loa Favoriten')
    expect(formatCuisine(['vietnamese', 'middle_eastern', 'Specials'], 'en')).toBe('Vietnamese, Middle Eastern, Specials')
  })
})
