import type { ReactNode } from 'react'

export function TableHeaderCell({
  align = 'left',
  children,
}: {
  align?: 'left' | 'right' | 'center'
  children: ReactNode
}) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  return <th className={alignClass}>{children}</th>
}

export function TableRowActionZone({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 whitespace-nowrap">{children}</div>
}
