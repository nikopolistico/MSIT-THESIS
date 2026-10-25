import type { Role } from '@/types'

/** Usernames become <username>@farm.local in Supabase Auth. The address is never mailed. */
export const FARM_EMAIL_DOMAIN = 'farm.local'
export const MIN_PASSWORD = 8

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase()

export const isValidUsername = (u: string) => /^[a-z0-9._-]{3,32}$/.test(u)

export const usernameToEmail = (u: string) => `${u}@${FARM_EMAIL_DOMAIN}`

/** Where each role lands after signing in. */
export const homeFor = (role: Role) => (role === 'admin' ? '/dashboard' : '/scan')

/** `allowed` undefined means a public page. */
export function canVisit(role: Role | null, allowed: Role[] | undefined): boolean {
  if (!allowed) return true
  return role !== null && allowed.includes(role)
}
