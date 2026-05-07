import type { ReactNode } from 'react'

export function MetricCard({
  icon,
  label,
  value,
  helper,
  tone = 'neutral',
  live = false,
  valueClassName = '',
}: {
  icon: ReactNode
  label: string
  value: string
  helper?: string
  tone?: 'neutral' | 'good' | 'warn'
  live?: boolean
  valueClassName?: string
}) {
  const toneClass = {
    neutral: 'bg-app-subtle text-app-strong',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
  }[tone]

  return (
    <div className="card px-5 py-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-app-muted">{label}</div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div className={`text-3xl font-semibold text-app-strong ${valueClassName}`.trim()}>{value}</div>
        {live && (
          <div className="relative h-2.5 w-2.5">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <div className="absolute inset-0 rounded-full bg-emerald-500" />
          </div>
        )}
      </div>
      {helper ? <div className="mt-2 text-sm text-app-muted">{helper}</div> : null}
    </div>
  )
}
