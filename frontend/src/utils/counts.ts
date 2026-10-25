import type { InventoryRow, WorkerCountRow } from '@/api/inventory'

/** Days are Philippine days, matching the worker_counts view, so a scan at 11:30 PM counts that day. */
const manila = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD in Asia/Manila. */
export const manilaDay = (d: Date) => manila.format(d)

/** The calendar day `n` days before a YYYY-MM-DD day. */
function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

export interface CountSummary {
  today: number
  /** The last 7 days, today included. */
  week: number
  total: number
  byBin: InventoryRow[]
  /** One entry per day, oldest first, ending today; days without scans are 0. */
  daily: { day: string; count: number }[]
}

export function summarize(rows: WorkerCountRow[], now: Date, days = 14): CountSummary {
  const today = manilaDay(now)
  const weekStart = daysBefore(today, 6)
  const perDay = new Map<string, number>()
  const bins = new Map<string, InventoryRow>()
  let total = 0
  let week = 0
  for (const r of rows) {
    total += r.count
    if (r.day >= weekStart && r.day <= today) week += r.count
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.count)
    const key = `${r.maturity}|${r.quality}`
    const bin = bins.get(key) ?? { maturity: r.maturity, quality: r.quality, count: 0 }
    bin.count += r.count
    bins.set(key, bin)
  }
  const daily = Array.from({ length: days }, (_, i) => {
    const day = daysBefore(today, days - 1 - i)
    return { day, count: perDay.get(day) ?? 0 }
  })
  return { today: perDay.get(today) ?? 0, week, total, byBin: [...bins.values()], daily }
}

/** One summary per worker; `null` holds fruit scanned before accounts existed. */
export function byWorker(rows: WorkerCountRow[], now: Date): Map<string | null, CountSummary> {
  const groups = new Map<string | null, WorkerCountRow[]>()
  for (const r of rows) groups.set(r.worker_id, [...(groups.get(r.worker_id) ?? []), r])
  return new Map([...groups].map(([id, rs]) => [id, summarize(rs, now)]))
}
