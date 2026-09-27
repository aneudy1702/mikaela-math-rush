export function formatRaceTime(ms: number | null): string {
  if (ms == null) return '—'
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function percent(correct: number, answered: number): string {
  if (answered <= 0) return '0%'
  return `${Math.round((correct / answered) * 100)}%`
}
