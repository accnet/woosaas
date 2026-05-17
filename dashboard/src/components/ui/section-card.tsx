import type { ReactNode } from 'react'

export function SectionCard({
  title,
  action,
  children,
  className = '',
  // legacy props — kept for compat, description intentionally not rendered
  description: _description,
  icon: _icon,
}: {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`card px-3 py-3 md:px-5 md:py-4 ${className}`.trim()}>
      {title || action ? (
        <div className="flex items-center justify-between">
          {title ? <h3 className="text-sm font-semibold text-app-strong">{title}</h3> : <span />}
          {action ?? null}
        </div>
      ) : null}
      <div className={title || action ? 'mt-3' : ''}>{children}</div>
    </div>
  )
}
