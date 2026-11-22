import { currentLanguage, message, type Language, type MessageKey } from '../i18n'

interface MenuText {
  description: string | null
  descriptionEn?: string | null
}

/** A menu can supply English copy. Keep the published description when no translation was supplied. */
export function dishDescription(dish: MenuText, language = currentLanguage()): string | null {
  return language === 'en' && dish.descriptionEn?.trim() ? dish.descriptionEn : dish.description
}

// Standard menu categories can be translated. Branded and custom headings keep their source wording.
const sectionKeys: Readonly<Record<string, MessageKey>> = {
  'asiatische gerichte': 'asianDishes',
  beilagen: 'sideDishes',
  bowls: 'bowls',
  currygerichte: 'curries',
  currys: 'curries',
  desserts: 'desserts',
  fisch: 'fish',
  fischgerichte: 'fishDishes',
  fleisch: 'meat',
  fleischgerichte: 'meatDishes',
  frühstück: 'breakfast',
  grillgerichte: 'barbecue',
  hähnchengerichte: 'chickenDishes',
  hauptgang: 'mainCourse',
  hauptgänge: 'mainCourses',
  hauptgericht: 'mainCourse',
  hauptgerichte: 'mainCourses',
  hauptspeise: 'mainCourse',
  hauptspeisen: 'mainCourses',
  hühnerfleischgerichte: 'chickenDishes',
  hühnergerichte: 'chickenDishes',
  kindermenü: 'kidsMenu',
  kindergerichte: 'kidsMenu',
  'kleine gerichte': 'smallPlates',
  menü: 'menu',
  menüs: 'menuSectionMenus',
  mittagsmenü: 'lunchMenu',
  nudelgerichte: 'noodleDishes',
  nudelsuppen: 'noodleSoups',
  nudeln: 'noodles',
  reisgerichte: 'riceDishes',
  rindergerichte: 'beefDishes',
  rindfleischgerichte: 'beefDishes',
  lammgerichte: 'lambDishes',
  salat: 'salad',
  salate: 'salads',
  spezialitäten: 'specialities',
  'spezialitäten des hauses': 'houseSpecialities',
  suppe: 'soup',
  suppen: 'soups',
  tagesmenü: 'dailyMenu',
  tellergerichte: 'platedDishes',
  vegan: 'vegan',
  'vegane gerichte': 'veganDishes',
  'vegane hauptgerichte': 'veganMainCourses',
  vegetarisch: 'vegetarian',
  'vegetarische gerichte': 'vegetarianDishes',
  'vegetarische hauptgerichte': 'vegetarianMainCourses',
  'vom grill': 'fromTheGrill',
  vorspeise: 'starter',
  vorspeisen: 'starters',
}

export function menuSection(section: string, language: Language = currentLanguage()): string {
  const normalized = section.trim().toLowerCase()
  return language === 'en' && Object.hasOwn(sectionKeys, normalized) ? message(language, sectionKeys[normalized]) : section
}
