export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
