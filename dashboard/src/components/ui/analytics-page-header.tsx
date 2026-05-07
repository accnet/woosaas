import type { ReactNode } from 'react'

export function AnalyticsPageHeader({
  title,
  description,
  controls,
}: {
  title: string
  description: string
  controls?: ReactNode
}) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold text-app-strong">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-app-muted">{description}</p>
      </div>
      {controls ? <div className="flex flex-wrap items-center gap-3">{controls}</div> : null}
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
    <select value={value} onChange={(event) => onChange(event.target.value)} className="select min-w-[150px]">
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
