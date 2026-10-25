import { useAuthStore } from '@/stores/auth'
import { supabase } from './supabase'

/**
 * Calls one of the database functions in frontend/supabase/auth-roles.sql with the signed-in session's
 * token. The app cannot read the tables directly; every read and write goes through these functions.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const auth = useAuthStore()
  const { data, error } = await supabase.rpc(fn, { p_token: auth.token, ...args })
  if (error) {
    // The token ran out or was removed (account disabled, password reset): back to the sign-in page.
    if (/session has expired/i.test(error.message)) auth.expire()
    throw new Error(error.message)
  }
  return data as T
}
