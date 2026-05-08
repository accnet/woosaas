import type { ReactNode } from 'react'

export function AnalyticsPageHeader({
  title,
  controls,
}: {
  title: string
  description?: string // kept for backward-compat, intentionally unused
  controls?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-app-line px-6 py-3 md:px-8">
      <h1 className="text-base font-semibold text-app-strong">{title}</h1>
      {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
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
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="select min-w-[140px]">
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
