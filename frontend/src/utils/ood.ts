import { CONFIDENCE_THRESHOLD, SIMILARITY_THRESHOLD, TASK_KEYS, TASKS } from '@/config/labels'
import type { ItemDetail } from '@/types'

type Readable = Pick<ItemDetail, 'maturity' | 'quality' | 'oodSimilarity'>
import { pct } from './format'

/** Reasons one photo is out-of-distribution; empty array means in-distribution. */
export function oodReasons(item: Readable): string[] {
  const reasons = TASK_KEYS.filter((t) => item[t].confidence < CONFIDENCE_THRESHOLD).map(
    (t) => `${TASKS[t].title} confidence ${pct(item[t].confidence, 1)}`,
  )
  const sim = item.oodSimilarity
  if (sim !== undefined && sim < SIMILARITY_THRESHOLD) {
    reasons.push(`nearest reference similarity ${pct(sim, 1)}`)
  }
  return reasons
}
