/** Cohen's kappa between two equally long label lists. Returns null when undefined (no data / chance = 1). */
export function cohensKappa(a: string[], b: string[]): number | null {
  const n = a.length
  if (n === 0 || n !== b.length) return null
  const classes = [...new Set([...a, ...b])]
  let agree = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++
  const po = agree / n
  let pe = 0
  for (const c of classes) {
    const pa = a.filter((x) => x === c).length / n
    const pb = b.filter((x) => x === c).length / n
    pe += pa * pb
  }
  if (pe === 1) return null
  return (po - pe) / (1 - pe)
}
