'use client'

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
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
  sparklineData,
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
  sparklineData?: number[]
}) {
  const toneClass = {
    neutral: 'bg-gradient-to-br from-slate-50 to-slate-100 text-app-strong border border-slate-200/80',
    good: 'bg-gradient-to-br from-emerald-50 to-green-100 text-emerald-700 border border-emerald-200/80',
    warn: 'bg-gradient-to-br from-amber-50 to-orange-100 text-amber-700 border border-amber-200/80',
  }[tone]

  const sparklineColor = {
    neutral: '#6366f1',
    good: '#10b981',
    warn: '#f59e0b',
  }[tone]

  const isDeltaPositive = delta !== null && delta !== undefined && delta >= 0
  const DeltaIcon = delta === null || delta === undefined ? null : delta === 0 ? Minus : isDeltaPositive ? ArrowUpRight : ArrowDownRight

  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-soft">{label}</div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className={`text-[1.85rem] font-semibold leading-none text-app-strong ${valueClassName}`.trim()}>{value}</div>
        {live && (
          <div className="relative h-2.5 w-2.5">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <div className="absolute inset-0 rounded-full bg-emerald-500" />
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {delta !== null && delta !== undefined && DeltaIcon ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
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
        {helper ? <span className="text-sm leading-5 text-app-muted">{helper}</span> : null}
      </div>
      {delta !== null && delta !== undefined && deltaLabel ? (
        <div className="mt-1 text-[11px] text-app-soft">{deltaLabel}</div>
      ) : null}
      {sparklineData && sparklineData.length > 2 && (
        <div className="-mx-1 mt-3">
          <ResponsiveContainer width="100%" height={36}>
            <AreaChart data={sparklineData.map((v, i) => ({ v, i }))}>
              <defs>
                <linearGradient id={`sg-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparklineColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={sparklineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                dataKey="v"
                type="monotone"
                stroke={sparklineColor}
                strokeWidth={1.5}
                fill={`url(#sg-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
