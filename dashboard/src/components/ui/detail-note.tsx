import type { ReactNode } from 'react'

export function DetailNote({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  icon: ReactNode
  title: string
  body: string
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const toneClass = {
    neutral: 'bg-slate-50 text-app-strong',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
  }[tone]

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
        <div>
          <div className="text-sm font-semibold text-app-strong">{title}</div>
          <div className="mt-1 text-sm text-app-muted">{body}</div>
        </div>
      </div>
    </div>
  )
}
