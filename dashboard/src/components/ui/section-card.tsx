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
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`card px-5 py-4 ${className}`.trim()}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-strong">{title}</h3>
        {action ?? null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}
