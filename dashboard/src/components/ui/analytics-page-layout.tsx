import type { ReactNode } from 'react'

const metricColsClass = {
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
} as const

const mobileMetricColsClass = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
} as const

export function AnalyticsPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-4 ${className}`.trim()}>{children}</div>
}

export function AnalyticsPageContent({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`space-y-3 px-0 md:space-y-4 md:px-6 ${className}`.trim()}>{children}</div>
}

export function MetricGrid({
  children,
  cols = 4,
  mobileCols = 2,
  className = '',
}: {
  children: ReactNode
  cols?: keyof typeof metricColsClass
  mobileCols?: keyof typeof mobileMetricColsClass
  className?: string
}) {
  return (
    <div className={`grid ${mobileMetricColsClass[mobileCols]} gap-3 ${metricColsClass[cols]} ${className}`.trim()}>
      {children}
    </div>
  )
}
