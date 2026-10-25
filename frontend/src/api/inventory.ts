import { errorMessage } from '@/utils/format'
import { rpc } from './rpc'
import { supabase } from './supabase'

const PHOTO_BUCKET = 'gradings'

export interface InventoryRow {
  maturity: string
  quality: string
  count: number
}

/** Scans per worker, day (Asia/Manila) and bin, from count_scans(). */
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
 * Adds one graded fruit with BOTH photos, front and back, under the signed-in account. If either photo
 * or the record cannot be saved, nothing is kept: an entry never has one photo, and no photo is left
 * without an entry.
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
    await rpc('record_grading', {
      p_maturity: maturity,
      p_quality: quality,
      p_image_path: image_path,
      p_back_image_path: back_image_path,
      p_source: source,
    })
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(PHOTO_BUCKET).remove(uploaded)
    throw new Error(errorMessage(e))
  }
}

/** Scans per worker and day: only their own for a worker, everyone's for the admin. */
export async function getWorkerCounts(): Promise<WorkerCountRow[]> {
  if (!supabase) return []
  return (await rpc<WorkerCountRow[] | null>('count_scans')) ?? []
}

/** Addresses of saved photos, keyed by path. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!supabase) return {}
  const out: Record<string, string> = {}
  for (const p of paths) out[p] = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(p).data.publicUrl
  return out
}

/**
 * One page of individual graded fruit, oldest first, so a fruit keeps its number as more are added.
 * `workerId`: undefined lists everyone, null lists fruit scanned before accounts existed. A worker
 * always gets only their own fruit.
 */
export async function getGradings(
  limit: number,
  offset: number,
  workerId?: string | null,
): Promise<Grading[]> {
  if (!supabase) return []
  const rows = await rpc<Grading[] | null>('list_gradings', {
    p_limit: limit,
    p_offset: offset,
    p_worker: workerId === null ? 'unassigned' : (workerId ?? null),
  })
  return rows ?? []
}

/**
 * Deletes one graded fruit and its photos (admin only). Returns a warning when the fruit is gone but a
 * photo could not be removed.
 */
export async function deleteGrading(g: Grading): Promise<string | null> {
  if (!supabase) return null
  const deleted = await rpc<{ image_path: string | null; back_image_path: string | null }[]>(
    'delete_grading',
    { p_id: g.id },
  )
  if (!deleted?.length) throw new Error('This fruit was already deleted.')
  const paths = [deleted[0]!.image_path, deleted[0]!.back_image_path].filter(
    (p): p is string => !!p,
  )
  if (!paths.length) return null
  const removed = await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  return removed.error || (removed.data?.length ?? 0) < paths.length
    ? 'The fruit was deleted but a photo is still in storage.'
    : null
}
