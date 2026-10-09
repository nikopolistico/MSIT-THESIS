import { errorMessage } from '@/utils/format'
import { supabase } from './supabase'

const PHOTO_BUCKET = 'gradings'

export interface InventoryRow {
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

/** Public address of a saved photo, or null when there is none. */
export function photoUrl(path?: string | null): string | null {
  if (!supabase || !path) return null
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}

/** One page of individual graded fruit, oldest first, so a fruit keeps its number as more are added. */
export async function getGradings(limit: number, offset: number): Promise<Grading[]> {
  if (!supabase) return []
  const page = (columns: string) =>
    supabase!
      .from('gradings')
      .select(columns)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)
  const base = 'id, created_at, maturity, quality'
  // shortcut: photo columns are missing until add-photos.sql is run; list without them until then.
  let res = await page(`${base}, image_path, back_image_path`)
  if (res.error) res = await page(`${base}, image_path`)
  if (res.error) res = await page(base)
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as unknown as Grading[]
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
      'Nothing was deleted. Run frontend/supabase/add-photos.sql in Supabase to allow it.',
    )
  }
  const paths = [g.image_path, g.back_image_path].filter((p): p is string => !!p)
  if (!paths.length) return null
  const removed = await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  return removed.error || (removed.data?.length ?? 0) < paths.length
    ? 'The fruit was deleted but a photo is still in storage.'
    : null
}
