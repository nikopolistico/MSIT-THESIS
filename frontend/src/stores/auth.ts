import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/api/supabase'
import type { Profile } from '@/types'

const TOKEN_KEY = 'dragonfruit-session'

// Storage can be blocked (private mode); the app then works until the tab is closed.
function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

interface SessionResult {
  token: string
  profile: Profile
}

/**
 * The signed-in account and its role. Accounts live in the app's own tables (profiles + credentials),
 * not Supabase Auth: login() in the database returns a session token, kept in this browser.
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(readToken())
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  let starting: Promise<void> | null = null

  const role = computed(() => profile.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')

  function setSession(s: SessionResult | null) {
    token.value = s?.token ?? null
    profile.value = s?.profile ?? null
    writeToken(token.value)
  }

  /** Checks the saved token once. Safe to call from every navigation. */
  function init(): Promise<void> {
    starting ??= (async () => {
      if (!supabase || !token.value) return
      const { data, error } = await supabase.rpc('me', { p_token: token.value })
      if (error) setSession(null)
      else profile.value = data as Profile
    })().finally(() => {
      ready.value = true
    })
    return starting
  }

  async function signIn(username: string, password: string): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.rpc('login', {
      p_username: username,
      p_password: password,
    })
    if (error) throw new Error(error.message)
    setSession(data as SessionResult)
  }

  async function signOut(): Promise<void> {
    const t = token.value
    setSession(null)
    if (supabase && t) await supabase.rpc('logout', { p_token: t })
  }

  /** The session ended on the server: forget it and go to the sign-in page. */
  function expire() {
    setSession(null)
    if (window.location.pathname !== '/login') window.location.assign('/login')
  }

  return {
    token,
    profile,
    ready,
    role,
    isAdmin,
    init,
    signIn,
    signOut,
    expire,
  }
})
