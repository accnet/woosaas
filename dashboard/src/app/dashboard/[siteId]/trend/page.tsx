'use client'

import { useEffect, useState } from 'react'
import { BarChart3, CalendarRange, LineChart as LineChartIcon, Users } from 'lucide-react'
import { LineChart } from '@/components/ui/charts'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { TrendPoint } from '@/lib/types'

export default function TrendPage() {
  const siteId = useSiteId()
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')
  const [metric, setMetric] = useState<'pageviews' | 'sessions' | 'users' | 'purchases'>('pageviews')

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

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Trend Analysis</h2>
          <p className="mt-2 text-sm text-app-muted">Historical movement across the key acquisition and conversion metrics.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className="select">
            <option value="pageviews">Pageviews</option>
            <option value="sessions">Sessions</option>
            <option value="users">Users</option>
            <option value="purchases">Purchases</option>
          </select>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value as PresetDateRange)} className="select">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<LineChartIcon className="h-4 w-4" />} label="Pageviews" value={trend.reduce((sum, p) => sum + (p.pageviews ?? 0), 0).toLocaleString()} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Sessions" value={trend.reduce((sum, p) => sum + (p.sessions ?? 0), 0).toLocaleString()} />
        <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Users" value={trend.reduce((sum, p) => sum + (p.users ?? 0), 0).toLocaleString()} />
        <MetricCard icon={<CalendarRange className="h-4 w-4" />} label="Revenue" value={`$${trend.reduce((sum, p) => sum + (p.revenue ?? 0), 0).toFixed(2)}`} />
      </div>

      <div className="card px-6 py-6">
        {trend.length > 0 ? (
          <LineChart data={trend} dataKey={metric} />
        ) : (
          <EmptyState icon={<LineChartIcon className="h-12 w-12" />} body="No trend data available" className="flex h-64 items-center justify-center" />
        )}
      </div>
    </div>
  )
}
