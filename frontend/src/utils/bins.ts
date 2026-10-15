import type { InventoryRow } from '@/api/inventory'
import { BIN_ACTIONS, TASKS, type LabelDef } from '@/config/labels'
import { toneColor } from '@/config/tones'

/** A bin is one maturity + quality combination, i.e. a place the fruit is sent after grading. */
export interface Bin {
  key: string
  maturity: LabelDef
  quality: LabelDef
  count: number
  share: number
  color: string
  action: string
}

/** Every bin, ripe fruit first: those are the bins that lead to a harvest decision. */
export function buildBins(rows: InventoryRow[], total: number): Bin[] {
  const out: Bin[] = []
  for (const m of [...TASKS.maturity.labels].reverse()) {
    for (const q of TASKS.quality.labels) {
      const count = rows.find((r) => r.maturity === m.value && r.quality === q.value)?.count ?? 0
      // Quality sets the hue; unripe fruit is shown paler.
      out.push({
        key: `${m.value}|${q.value}`,
        maturity: m,
        quality: q,
        count,
        share: total ? count / total : 0,
        color: `color-mix(in srgb, ${toneColor[q.tone]} ${m.tone === 'good' ? 100 : 40}%, white)`,
        action: BIN_ACTIONS[`${m.value}|${q.value}`] ?? '',
      })
    }
  }
  return out
}
