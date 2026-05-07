'use client'

import { useEffect, useState } from 'react'
import { BarChart3, CalendarRange, LineChart as LineChartIcon, Users } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { MultiLineChart } from '@/components/ui/charts'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { TrendPoint } from '@/lib/types'

export default function TrendPage() {
  const siteId = useSiteId()
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.trend(siteId, from, to, 'day')
        setTrend(res.data)
      } catch (err) {
        console.error('Failed to load trend data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const totals = {
    pageviews: trend.reduce((sum, p) => sum + (p.pageviews ?? 0), 0),
    sessions: trend.reduce((sum, p) => sum + (p.sessions ?? 0), 0),
    users: trend.reduce((sum, p) => sum + (p.users ?? 0), 0),
    revenue: trend.reduce((sum, p) => sum + (p.revenue ?? 0), 0),
  }

  return (
    <div className="space-y-5">

      <AnalyticsPageHeader
        title="Trend Analysis"
        description="Historical movement across the core analytics app metrics for this website."
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(value) => setDateRange(value as PresetDateRange)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<LineChartIcon className="h-4 w-4" />} label="Pageviews" value={totals.pageviews.toLocaleString()} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Sessions" value={totals.sessions.toLocaleString()} />
        <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Users" value={totals.users.toLocaleString()} />
        <MetricCard icon={<CalendarRange className="h-4 w-4" />} label="Revenue" value={`$${totals.revenue.toFixed(2)}`} />
      </div>

      <SectionCard
        title="Metric Timeline"
        description="Daily movement for the website metrics tracked inside the analytics app."
        icon={<LineChartIcon className="h-4 w-4" />}
      >
        {trend.length > 0 ? (
          <MultiLineChart
            data={trend}
            lines={[
              { dataKey: 'pageviews', color: '#6366f1', name: 'Pageviews' },
              { dataKey: 'sessions', color: '#22c55e', name: 'Sessions' },
              { dataKey: 'purchases', color: '#f59e0b', name: 'Purchases' },
            ]}
          />
        ) : (
          <EmptyState icon={<LineChartIcon className="h-12 w-12" />} body="No trend data available" className="flex h-64 items-center justify-center" />
        )}
      </SectionCard>
    </div>
  )
}
