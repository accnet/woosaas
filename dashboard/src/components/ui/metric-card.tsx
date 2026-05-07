import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

export function MetricCard({
  icon,
  label,
  value,
  helper,
  tone = 'neutral',
  live = false,
  delta,
  deltaLabel = 'vs previous period',
  valueClassName = '',
}: {
  icon: ReactNode
  label: string
  value: string
  helper?: string
  tone?: 'neutral' | 'good' | 'warn'
  live?: boolean
  delta?: number | null
  deltaLabel?: string
  valueClassName?: string
}) {
  const toneClass = {
    neutral: 'bg-app-subtle text-app-strong',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
  }[tone]

  const isDeltaPositive = delta !== null && delta !== undefined && delta >= 0
  const DeltaIcon = delta === null || delta === undefined ? null : delta === 0 ? Minus : isDeltaPositive ? ArrowUpRight : ArrowDownRight

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
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {delta !== null && delta !== undefined && DeltaIcon ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
            delta === 0
              ? 'bg-app-subtle text-app-muted'
              : isDeltaPositive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
          }`}>
            <DeltaIcon className="h-3 w-3" />
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        ) : null}
        {helper ? <span className="text-sm text-app-muted">{helper}</span> : null}
      </div>
      {delta !== null && delta !== undefined && deltaLabel ? (
        <div className="mt-1 text-xs text-app-soft">{deltaLabel}</div>
      ) : null}
    </div>
  )
}

