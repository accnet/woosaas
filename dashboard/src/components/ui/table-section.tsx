import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'

export function TableSection({
  title,
  description,
  icon,
  action,
  children,
  emptyTitle,
  emptyBody,
  emptyIcon,
  isEmpty = false,
  className = '',
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  emptyTitle?: string
  emptyBody?: string
  emptyIcon?: ReactNode
  isEmpty?: boolean
  className?: string
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      icon={icon}
      action={action}
      className={`overflow-hidden px-0 py-0 ${className}`.trim()}
    >
      {isEmpty && emptyBody ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </SectionCard>
  )
}
