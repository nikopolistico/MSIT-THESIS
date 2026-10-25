import type { Profile } from '@/types'
import { supabase } from './supabase'

/** Every account the caller may see: all of them for the admin (RLS), only their own for a worker. */
export async function listProfiles(): Promise<Profile[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}
