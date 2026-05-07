import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

export function DeltaIndicator({
  value,
  suffix = '',
  invert = false,
  emphasize = false,
}: {
  value: number
  suffix?: string
  invert?: boolean
  emphasize?: boolean
}) {
  const normalized = Number.isFinite(value) ? value : 0
  const isPositive = invert ? normalized <= 0 : normalized >= 0
  const toneClass =
    normalized === 0
      ? 'bg-app-subtle text-app-muted'
      : isPositive
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-red-50 text-red-700'
  const Icon = normalized === 0 ? Minus : isPositive ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${toneClass} ${
        emphasize ? 'min-w-[88px] justify-center' : ''
      }`.trim()}
    >
      <Icon className="h-3.5 w-3.5" />
      {normalized > 0 ? '+' : ''}
      {suffix === '%' ? normalized.toFixed(1) : normalized.toLocaleString()}
      {suffix}
    </span>
  )
}
