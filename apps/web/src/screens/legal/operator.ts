// The person responsible for the site (Impressum § 5 DDG, Datenschutz Art. 13 DSGVO).
// The data lives in operator.json, the single place to fill in. While a field is empty, both legal pages
// show "Angaben folgen in Kürze" in its place, so no placeholder text ever reaches the live site.
import raw from './operator.json'

export interface Operator {
  /** Full name of the responsible person. */
  name: string | null
  /** Street and house number. */
  street: string | null
  /** Postal code and city, for example "10115 Berlin". */
  city: string | null
  /** Contact email address. */
  email: string | null
}

export const PENDING = 'Angaben folgen in Kürze'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Normalises the config: blanks and anything that is not a string become null, an invalid email too. */
export function readOperator(input: unknown): Operator {
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const email = text(o.email)
  return {
    name: text(o.name),
    street: text(o.street),
    city: text(o.city),
    email: email && EMAIL.test(email) ? email : null,
  }
}

/** The postal address lines that are filled in; empty while nothing is configured. */
export function addressLines(operator: Operator): string[] {
  return [operator.name, operator.street, operator.city].filter((line): line is string => line !== null)
}

export const OPERATOR: Operator = readOperator(raw)
