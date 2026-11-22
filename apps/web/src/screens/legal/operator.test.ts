import { describe, expect, it } from 'vitest'
import { addressLines, OPERATOR, readOperator } from './operator'
import raw from './operator.json'

describe('readOperator', () => {
  it('treats blanks, missing fields and non-strings as not configured', () => {
    expect(readOperator({ name: '  ', street: 42, email: '' })).toEqual({ name: null, street: null, city: null, email: null })
    expect(readOperator(null)).toEqual({ name: null, street: null, city: null, email: null })
  })

  it('trims filled fields and keeps a valid email', () => {
    const o = readOperator({ name: ' Erika Muster ', street: 'Musterstr. 1', city: '10115 Berlin', email: ' hallo@example.org ' })
    expect(o).toEqual({ name: 'Erika Muster', street: 'Musterstr. 1', city: '10115 Berlin', email: 'hallo@example.org' })
    expect(addressLines(o)).toEqual(['Erika Muster', 'Musterstr. 1', '10115 Berlin'])
  })

  it('drops an email that is not an address, so no broken mailto link goes live', () => {
    expect(readOperator({ email: 'kontakt at example' }).email).toBeNull()
  })

  it('reads the committed config', () => {
    // The committed file keeps the shape the pages expect; the values may be filled or empty.
    expect(Object.keys(raw).sort()).toEqual(['city', 'email', 'name', 'street'])
    expect(OPERATOR).toEqual(readOperator(raw))
  })
})
