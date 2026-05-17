import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'

export function AnalyticsPageHeader({
  title,
  controls,
}: {
  title: string
  description?: string // kept for backward-compat, intentionally unused
  controls?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 px-0 py-2 md:flex-row md:items-center md:justify-between md:px-6 md:py-3">
      <h1 className="text-xl font-semibold text-app-strong">{title}</h1>
      {controls ? <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">{controls}</div> : null}
    </div>
  )
}

export function DateRangeSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const range = getPresetDateRange(value as PresetDateRange)
  const fromDate = new Date(range.from)
  const toDate = new Date(range.to)
  
  const isSameYear = fromDate.getFullYear() === toDate.getFullYear()
  const fromFormat = isSameYear ? 'MMM d' : 'MMM d, yyyy'
  const hint = `${format(fromDate, fromFormat)} – ${format(toDate, 'MMM d, yyyy')}`

  return (
    <div className="flex w-auto shrink-0 items-center gap-3">
      <span className="hidden text-xs text-app-soft sm:block tabular-nums">
        {hint}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="select w-auto min-w-[140px]">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
