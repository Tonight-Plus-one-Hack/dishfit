import { createContext, useContext } from 'react'
import { persisted, useStore } from '../lib/store'
import { de, type MessageKey } from './de'
import { en } from './en'
export type { MessageKey } from './de'

export type Language = 'de' | 'en'
type Value = string | number

export const catalogs = { de, en }
export const LANGUAGE_KEY = 'dishfit.language.v1'

export function resolveLanguage(preference: unknown, browserLanguage: string): Language {
  if (preference === 'de' || preference === 'en') return preference
  return /^de(?:-|$)/i.test(browserLanguage) ? 'de' : 'en'
}

const preference = persisted<unknown>(LANGUAGE_KEY, null)
const browserLanguage = typeof navigator === 'undefined' || typeof document === 'undefined' ? 'de' : navigator.language

export function currentLanguage(): Language {
  return resolveLanguage(preference.get(), browserLanguage)
}

export function useLanguage(): Language {
  return resolveLanguage(useStore(preference), browserLanguage)
}

export const LanguageContext = createContext<Language>('de')

export function localizedFormatter<T>(make: (language: string) => T): () => T {
  const formatters = { de: make(locale('de')), en: make(locale('en')) }
  return () => formatters[currentLanguage()]
}

export function locale(language = currentLanguage()): string {
  return language === 'de' ? 'de-DE' : 'en-IE'
}

export function message(language: Language, key: MessageKey, ...values: Value[]): string {
  return catalogs[language][key].replace(/\{(\d+)\}/g, (placeholder, position: string) =>
    String(values[Number(position) - 1] ?? placeholder),
  )
}

export function translatorFor(getLanguage: () => Language) {
  return (key: MessageKey, ...values: Value[]) => message(getLanguage(), key, ...values)
}

const translators = {
  de: translatorFor(() => 'de'),
  en: translatorFor(() => 'en'),
}

export const translate = translatorFor(currentLanguage)

export function useTranslation() {
  return translators[useContext(LanguageContext)]
}

export function applyDocumentLanguage(language = currentLanguage()): void {
  document.documentElement.lang = language
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', language === 'en' ? '/manifest.en.webmanifest' : '/manifest.webmanifest')
  document.title = message(language, 'documentTitle')
  document.querySelector('meta[name="description"]')?.setAttribute('content', message(language, 'documentDescription'))
}

export function setLanguage(language: Language): void {
  preference.set(language)
  applyDocumentLanguage(language)
}
