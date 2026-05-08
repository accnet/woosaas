'use client'

import { useEffect, useState } from 'react'
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { MultiLineChart } from '@/components/ui/charts'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import axios from 'axios'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { TrendPoint } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

const ALL_METRICS = [
  { key: 'pageviews', color: '#6366f1', label: 'Pageviews' },
  { key: 'sessions', color: '#22c55e', label: 'Sessions' },
  { key: 'purchases', color: '#f59e0b', label: 'Purchases' },
  { key: 'users', color: '#8b5cf6', label: 'Users' },
] as const

export default function TrendPage() {
  const siteId = useSiteId()
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()
  const [activeMetrics, setActiveMetrics] = useState<string[]>(['pageviews', 'sessions'])

  useEffect(() => {
    const controller = new AbortController()
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.trend(siteId, from, to, 'day', { signal: controller.signal })
        setTrend(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load trend data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
    return () => controller.abort()
  }, [dateRange, siteId])

  if (loading) {
    return <AnalyticsPageSkeleton cols={4} />
  }

  const totals = {
    pageviews: trend.reduce((sum, p) => sum + (p.pageviews ?? 0), 0),
    sessions: trend.reduce((sum, p) => sum + (p.sessions ?? 0), 0),
    users: trend.reduce((sum, p) => sum + (p.users ?? 0), 0),
    revenue: trend.reduce((sum, p) => sum + (p.revenue ?? 0), 0),
  }

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter((k) => k !== key) : prev // keep at least 1
        : [...prev, key]
    )
  }

  const visibleLines = ALL_METRICS.filter((m) => activeMetrics.includes(m.key)).map((m) => ({
    dataKey: m.key,
    color: m.color,
    name: m.label,
  }))

  return (
    <div className="space-y-4">

      <AnalyticsPageHeader
        title="Trend"
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

      <div className="px-5 md:px-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Pageviews"
            value={totals.pageviews.toLocaleString()}
            sparklineData={trend.map((t) => t.pageviews ?? 0)}
          />
          <MetricCard
            label="Sessions"
            value={totals.sessions.toLocaleString()}
            sparklineData={trend.map((t) => t.sessions ?? 0)}
          />
          <MetricCard
            label="Users"
            value={totals.users.toLocaleString()}
            sparklineData={trend.map((t) => t.users ?? 0)}
          />
          <MetricCard
            label="Revenue"
            value={`$${totals.revenue.toFixed(2)}`}
            tone={totals.revenue > 0 ? 'good' : 'neutral'}
            sparklineData={trend.map((t) => t.revenue ?? 0)}
          />
        </div>

        <div className="mt-4">
          <SectionCard title="Metric Timeline">
            {/* Metric Toggle Pills */}
            <div className="mb-4 flex flex-wrap gap-2">
              {ALL_METRICS.map((m) => {
                const isActive = activeMetrics.includes(m.key)
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMetric(m.key)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150"
                    style={
                      isActive
                        ? { background: m.color, borderColor: m.color, color: '#fff' }
                        : { background: '#fff', borderColor: '#dbe3ee', color: '#5e6b84' }
                    }
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: isActive ? 'rgba(255,255,255,0.7)' : m.color }}
                    />
                    {m.label}
                  </button>
                )
              })}
            </div>

            {trend.length > 0 ? (
              <MultiLineChart data={trend} lines={visibleLines} />
            ) : (
              <EmptyState icon={<LineChartIcon className="h-8 w-8" />} body="No trend data available" className="h-48" />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
