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
    neutral: 'badge-neutral',
    info: 'badge-info',
    good: 'badge-success',
    warn: 'badge-warning',
    danger: 'badge-danger',
  }[tone]

  const dotColor = {
    neutral: 'bg-slate-400',
    info: 'bg-indigo-500',
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-rose-500',
  }[tone]

  return (
    <span
      className={`${toneClass} inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold leading-none ${className}`.trim()}
    >
      {icon ? (
        <span className="flex h-3 w-3 items-center justify-center">{icon}</span>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      )}
      <span>{label}</span>
    </span>
  )
}
