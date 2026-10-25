import { useAuthStore } from '@/stores/auth'
import type { Profile } from '@/types'
import { ApiError, request } from './http'

/**
 * Worker accounts, through the backend's admin API. Creating or disabling an account needs the
 * Supabase service key, which only the backend has; the backend checks that the caller is an admin.
 */
async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await useAuthStore().accessToken()
  if (!token) throw new ApiError(401, 'Your session has expired. Sign in again.')
  try {
    return await request<T>(`/api/admin/workers${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    // FastAPI sends {"detail": "..."}; show just the sentence.
    if (e instanceof ApiError) {
      try {
        const detail = JSON.parse(e.message).detail
        if (typeof detail === 'string') throw new ApiError(e.status, detail)
      } catch (inner) {
        if (inner instanceof ApiError) throw inner
      }
    }
    throw e
  }
}

export const listWorkers = () => call<Profile[]>('')

export const createWorker = (input: { username: string; full_name: string; password: string }) =>
  call<Profile>('', 'POST', input)

export const setWorkerActive = (id: string, active: boolean) =>
  call<Profile>(`/${id}`, 'PATCH', { active })

export const resetWorkerPassword = (id: string, password: string) =>
  call<Profile>(`/${id}`, 'PATCH', { password })
