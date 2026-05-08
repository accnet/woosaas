'use client'

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import type { ReactNode } from 'react'

export function MetricCard({
  label,
  value,
  tone = 'neutral',
  live = false,
  delta,
  valueClassName = '',
  sparklineData,
  // legacy props — kept for backward-compat but no longer rendered
  icon: _icon,
  helper: _helper,
  deltaLabel: _deltaLabel,
}: {
  icon?: ReactNode
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
  const sparklineColor = {
    neutral: '#6366f1',
    good: '#10b981',
    warn: '#f59e0b',
  }[tone]

  const isDeltaPositive = delta !== null && delta !== undefined && delta >= 0
  const DeltaIcon =
    delta === null || delta === undefined ? null : delta === 0 ? Minus : isDeltaPositive ? ArrowUpRight : ArrowDownRight

  return (
    <div className="card px-4 py-3.5">
      {/* Label — normal case, small, subdued */}
      <div className="text-xs font-medium text-app-soft">{label}</div>

      {/* Value — large, bold, tabular */}
      <div className={`mt-1.5 flex items-center gap-2 font-bold tabular-nums text-app-strong text-[2rem] leading-none ${valueClassName}`.trim()}>
        {value}
        {live && (
          <div className="relative h-2 w-2 shrink-0">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <div className="absolute inset-0 rounded-full bg-emerald-500" />
          </div>
        )}
      </div>

      {/* Delta badge — no explanatory text */}
      {delta !== null && delta !== undefined && DeltaIcon ? (
        <div className="mt-2">
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
              delta === 0
                ? 'bg-app-subtle text-app-muted'
                : isDeltaPositive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
            }`}
            title="vs previous period"
          >
            <DeltaIcon className="h-3 w-3" />
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        </div>
      ) : null}

      {/* Sparkline — flat stroke, no gradient */}
      {sparklineData && sparklineData.length > 2 && (
        <div className="-mx-1 mt-3">
          <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={sparklineData.map((v, i) => ({ v, i }))}>
              <defs>
                <linearGradient id={`sg-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparklineColor} stopOpacity={0.12} />
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
