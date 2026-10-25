import { describe, expect, it } from 'vitest'
import { canVisit, homeFor, isValidUsername, normalizeUsername } from '../auth'

describe('usernames', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Juan ')).toBe('juan')
  })
  it('accepts 3-32 letters, numbers, dot, dash, underscore', () => {
    expect(isValidUsername('juan.dc')).toBe(true)
    expect(isValidUsername('ab')).toBe(false)
    expect(isValidUsername('juan dc')).toBe(false)
    expect(isValidUsername('x'.repeat(33))).toBe(false)
  })
})

describe('routing by role', () => {
  it('sends each role to its home page', () => {
    expect(homeFor('admin')).toBe('/dashboard')
    expect(homeFor('worker')).toBe('/scan')
  })
  it('allows public pages to anyone and role pages to that role only', () => {
    expect(canVisit(null, undefined)).toBe(true)
    expect(canVisit(null, ['worker'])).toBe(false)
    expect(canVisit('worker', ['admin'])).toBe(false)
    expect(canVisit('admin', ['admin'])).toBe(true)
  })
})
