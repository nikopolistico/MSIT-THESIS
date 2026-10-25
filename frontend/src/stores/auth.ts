import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/api/supabase'
import type { Profile } from '@/types'
import { normalizeUsername, usernameToEmail } from '@/utils/auth'

/** The signed-in account and its role. Supabase keeps the session in the browser between visits. */
export const useAuthStore = defineStore('auth', () => {
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  let starting: Promise<void> | null = null

  const role = computed(() => profile.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')

  async function loadProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase!
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as Profile | null) ?? null
  }

  /** Reads the saved session once. Safe to call from every navigation. */
  function init(): Promise<void> {
    starting ??= (async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (user) {
        const p = await loadProfile(user.id).catch(() => null)
        profile.value = p?.active ? p : null
      }
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') profile.value = null
      })
    })().finally(() => {
      ready.value = true
    })
    return starting
  }

  async function signIn(username: string, password: string): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(normalizeUsername(username)),
      password,
    })
    if (error) {
      // A banned (disabled) user gets a distinct message from Supabase.
      if (/banned/i.test(error.message)) throw new Error('This account is disabled. Ask the admin.')
      throw new Error('Wrong username or password.')
    }
    const p = await loadProfile(data.user.id)
    if (!p) {
      await supabase.auth.signOut()
      throw new Error('This account has no role yet. Ask the admin.')
    }
    if (!p.active) {
      await supabase.auth.signOut()
      throw new Error('This account is disabled. Ask the admin.')
    }
    profile.value = p
  }

  async function signOut(): Promise<void> {
    profile.value = null
    await supabase?.auth.signOut()
  }

  /** The current access token, for calls to the backend's admin API. */
  async function accessToken(): Promise<string | null> {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    return data.session?.access_token ?? null
  }

  return { profile, ready, role, isAdmin, init, signIn, signOut, accessToken }
})
