import type { Profile } from '@/types'
import { rpc } from './rpc'
import { supabase } from './supabase'

/** Every account, for the admin's dashboard and inventory. */
export async function listProfiles(): Promise<Profile[]> {
  if (!supabase) return []
  return (await rpc<Profile[] | null>('list_accounts')) ?? []
}
