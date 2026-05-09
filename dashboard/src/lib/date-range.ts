export type PresetDateRange = '24h' | '7d' | '30d' | '90d'

export const DATE_RANGE_OPTIONS: Array<{ value: PresetDateRange; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export function getPresetDateRange(range: PresetDateRange) {
  const to = new Date()
  const from = new Date(to)

  switch (range) {
    case '24h':
      from.setHours(from.getHours() - 24)
      break
    case '7d':
      from.setDate(from.getDate() - 7)
      break
    case '30d':
      from.setDate(from.getDate() - 30)
      break
    case '90d':
      from.setDate(from.getDate() - 90)
      break
  }

  return toIsoRange(from, to)
}

export function getLastDaysRange(days: number) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return toIsoRange(from, to)
}

function toIsoRange(from: Date, to: Date) {
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}
