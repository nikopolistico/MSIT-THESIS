import { describe, expect, it } from 'vitest'
import type { WorkerCountRow } from '@/api/inventory'
import { byWorker, manilaDay, summarize } from '../counts'

const row = (day: string, count: number, extra: Partial<WorkerCountRow> = {}): WorkerCountRow => ({
  worker_id: 'a',
  day,
  maturity: 'ripe',
  quality: 'good',
  count,
  ...extra,
})

describe('manilaDay', () => {
  it('uses the Philippine date, not the UTC date', () => {
    expect(manilaDay(new Date('2026-10-25T15:30:00Z'))).toBe('2026-10-25') // 11:30 PM
    expect(manilaDay(new Date('2026-10-25T16:30:00Z'))).toBe('2026-10-26') // 12:30 AM
  })
})

describe('summarize', () => {
  const now = new Date('2026-10-25T02:00:00Z') // 10 AM in Manila
  const rows = [row('2026-10-25', 3), row('2026-10-20', 2), row('2026-10-10', 5)]

  it('counts today, the last 7 days and all time', () => {
    const s = summarize(rows, now)
    expect(s.today).toBe(3)
    expect(s.week).toBe(5)
    expect(s.total).toBe(10)
  })

  it('treats the day 6 days ago as inside the week and 7 days ago as outside', () => {
    const s = summarize([row('2026-10-19', 1), row('2026-10-18', 1)], now)
    expect(s.week).toBe(1)
  })

  it('fills every one of the last 14 days, ending today', () => {
    const s = summarize(rows, now)
    expect(s.daily).toHaveLength(14)
    expect(s.daily.at(-1)).toEqual({ day: '2026-10-25', count: 3 })
    expect(s.daily[0]).toEqual({ day: '2026-10-12', count: 0 })
    expect(s.daily.find((d) => d.day === '2026-10-20')?.count).toBe(2)
  })

  it('adds up each maturity + quality bin across days', () => {
    const s = summarize([...rows, row('2026-10-25', 4, { quality: 'defect' })], now)
    expect(s.byBin).toContainEqual({ maturity: 'ripe', quality: 'good', count: 10 })
    expect(s.byBin).toContainEqual({ maturity: 'ripe', quality: 'defect', count: 4 })
  })

  it('returns zeros for no rows', () => {
    const s = summarize([], now)
    expect([s.today, s.week, s.total]).toEqual([0, 0, 0])
    expect(s.byBin).toEqual([])
  })
})

describe('byWorker', () => {
  it('summarizes each worker, keeping unassigned (null) separate', () => {
    const now = new Date('2026-10-25T02:00:00Z')
    const m = byWorker(
      [row('2026-10-25', 2), row('2026-10-25', 1, { worker_id: 'b' }), row('2026-10-01', 7, { worker_id: null })],
      now,
    )
    expect(m.get('a')?.today).toBe(2)
    expect(m.get('b')?.today).toBe(1)
    expect(m.get(null)?.total).toBe(7)
  })
})
