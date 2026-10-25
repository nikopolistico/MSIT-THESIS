import type { Profile } from '@/types'
import { listProfiles } from './profiles'
import { rpc } from './rpc'

/** Worker accounts. Every function here is admin only; the database checks that. */
export const listWorkers = listProfiles

export const createWorker = (input: { username: string; full_name: string; password: string }) =>
  rpc<Profile>('create_worker', {
    p_username: input.username,
    p_full_name: input.full_name,
    p_password: input.password,
  })

export const setWorkerActive = (id: string, active: boolean) =>
  rpc<Profile>('set_account_active', { p_id: id, p_active: active })

export const resetWorkerPassword = (id: string, password: string) =>
  rpc<Profile>('reset_password', { p_id: id, p_password: password })
