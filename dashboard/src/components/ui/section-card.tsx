import type { ReactNode } from 'react'

export function SectionCard({
  title,
  description,
  icon,
  action,
  children,
  className = '',
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`card px-6 py-6 ${className}`.trim()}>
      <div className="panel-header">
        <div className="flex items-center gap-3">
          {icon ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-app-subtle text-app-strong">
              {icon}
            </div>
          ) : null}
          <div>
            <h3 className="text-base font-semibold text-app-strong">{title}</h3>
            {description ? <p className="mt-1 text-sm text-app-muted">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  )
}
