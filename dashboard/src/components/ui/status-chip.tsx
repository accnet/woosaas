import type { ReactNode } from 'react'

type StatusChipTone = 'neutral' | 'info' | 'good' | 'warn' | 'danger'

export function StatusChip({
  label,
  tone = 'neutral',
  icon,
  className = '',
}: {
  label: string
  tone?: StatusChipTone
  icon?: ReactNode
  className?: string
}) {
  const toneClass = {
    neutral: 'bg-app-subtle text-app-muted',
    info: 'bg-blue-50 text-blue-700',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
  }[tone]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${toneClass} ${className}`.trim()}
    >
      {icon ? <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span> : null}
      {label}
    </span>
  )
}
