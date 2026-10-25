import { errorMessage } from '@/utils/format'
import { supabase } from './supabase'

const PHOTO_BUCKET = 'gradings'

export interface InventoryRow {
  maturity: string
  quality: string
  count: number
}

/** Scans per worker, day (Asia/Manila) and bin, from the worker_counts view. */
export interface WorkerCountRow {
  worker_id: string | null // null: scanned before accounts existed
  day: string // YYYY-MM-DD
  maturity: string
  quality: string
  count: number
}

export interface Grading {
  id: string
  created_at: string
  maturity: string
  quality: string
  image_path?: string | null // front photo
  back_image_path?: string | null
  worker_id: string | null
}

export const inventoryEnabled = supabase !== null

async function uploadPhoto(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase!.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg' }) // already the 224 x 224 JPEG
  if (error) throw new Error(error.message)
  return path
}

/**
 * Adds one graded fruit with BOTH photos, front and back. If either photo or the record cannot be
 * saved, nothing is kept: an entry never has one photo, and no photo is left without an entry.
 */
export async function recordGrading(
  maturity: string,
  quality: string,
  photos: { front: File; back: File },
  source = 'upload',
): Promise<void> {
  if (!supabase) return
  const uploaded: string[] = []
  try {
    const image_path = await uploadPhoto(photos.front)
    uploaded.push(image_path)
    const back_image_path = await uploadPhoto(photos.back)
    uploaded.push(back_image_path)
    const { error } = await supabase
      .from('gradings')
      .insert({ maturity, quality, source, image_path, back_image_path })
    if (error) throw new Error(error.message)
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(PHOTO_BUCKET).remove(uploaded)
    throw new Error(errorMessage(e))
  }
}

export async function getInventory(): Promise<InventoryRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('inventory').select('maturity, quality, count')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Scans per worker and day. RLS returns only the caller's rows to a worker, and every row to the admin. */
export async function getWorkerCounts(): Promise<WorkerCountRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('worker_counts')
    .select('worker_id, day, maturity, quality, count')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Temporary addresses (1 hour) for saved photos, keyed by path. The bucket is private, so a worker can
 * only open their own photos and the admin all of them.
 */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!supabase || !paths.length) return {}
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
  if (error) throw new Error(error.message)
  const out: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

/**
 * One page of individual graded fruit, oldest first, so a fruit keeps its number as more are added.
 * `workerId`: undefined lists everyone, null lists fruit scanned before accounts existed.
 */
export async function getGradings(
  limit: number,
  offset: number,
  workerId?: string | null,
): Promise<Grading[]> {
  if (!supabase) return []
  let q = supabase
    .from('gradings')
    .select('id, created_at, maturity, quality, image_path, back_image_path, worker_id')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)
  if (workerId === null) q = q.is('worker_id', null)
  else if (workerId) q = q.eq('worker_id', workerId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Deletes one graded fruit and its photos. Returns a warning when the fruit is gone but a photo
 * could not be removed.
 */
export async function deleteGrading(g: Grading): Promise<string | null> {
  if (!supabase) return null
  // Without a delete policy Supabase deletes nothing and reports no error, so check the result.
  const { data, error } = await supabase.from('gradings').delete().eq('id', g.id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) {
    throw new Error(
      'Nothing was deleted. Only the admin can delete, and auth-roles.sql must be run in Supabase.',
    )
  }
  const paths = [g.image_path, g.back_image_path].filter((p): p is string => !!p)
  if (!paths.length) return null
  const removed = await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  return removed.error || (removed.data?.length ?? 0) < paths.length
    ? 'The fruit was deleted but a photo is still in storage.'
    : null
}
