import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  body,
  className = '',
  // legacy — not rendered
  title: _title,
}: {
  icon?: ReactNode
  title?: string
  body: string
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center py-10 text-app-soft ${className}`.trim()}>
      {icon ? <div className="mb-3 opacity-30">{icon}</div> : null}
      <span className="text-sm">{body}</span>
    </div>
  )
}
