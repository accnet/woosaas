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
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-app-subtle text-app-strong">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-app-strong">{title}</h3>
            {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-app-muted">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}
