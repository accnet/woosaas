import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  body,
  className = '',
}: {
  icon?: ReactNode
  title?: string
  body: string
  className?: string
}) {
  return (
    <div className={`mx-auto max-w-xl px-6 py-12 text-center text-app-muted ${className}`.trim()}>
      {icon ? <div className="mx-auto mb-3 flex justify-center text-slate-300">{icon}</div> : null}
      {title ? <div className="text-[15px] font-semibold text-app-strong">{title}</div> : null}
      <p className={`${title ? 'mt-2' : ''} text-sm leading-6`.trim()}>{body}</p>
    </div>
  )
}
