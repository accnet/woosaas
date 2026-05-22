import React from 'react'

export function DetailRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const toneClass = {
    neutral: 'text-app-strong',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
  }[tone]

  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm text-app-muted">{label}</span>
      <span className={`max-w-xs text-right text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  )
}
