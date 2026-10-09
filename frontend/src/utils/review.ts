import { CONFIDENCE_THRESHOLD, TASK_KEYS, TASKS } from '@/config/labels'
import type { QueueItem } from '@/types'

/** Highest possible entropy (a uniform guess on every task); scales the uncertainty bar. */
export const maxEntropy = TASK_KEYS.reduce((a, t) => a + Math.log(TASKS[t].labels.length), 0)

/** Plain-language reason a fruit sits in the review queue. */
export function queueReason(item: QueueItem): string {
  const low = TASK_KEYS.filter((t) => item[t].confidence < CONFIDENCE_THRESHOLD)
  if (!low.length) return 'Both labels pass the threshold. Review to confirm.'
  return `Low confidence in ${low.map((t) => TASKS[t].title.toLowerCase()).join(' and ')}.`
}
