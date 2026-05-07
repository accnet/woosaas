'use client'

import { useEffect, useState } from 'react'
import { BarChart3, DollarSign, Gauge, MousePointerClick, ShoppingCart, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { LineChart } from '@/components/ui/charts'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DetailRow } from '@/components/ui/detail-row'
import { sitesApi, statsApi } from '@/lib/api'
import { getDataFreshnessState } from '@/lib/data-freshness'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { OverviewStats, Site, TrendPoint } from '@/lib/types'

export default function OverviewPage() {
  const siteId = useSiteId()

  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('7d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [siteRes, overviewRes, trendRes] = await Promise.all([
          sitesApi.get(siteId),
          statsApi.overview(siteId, from, to),
          statsApi.trend(siteId, from, to, 'day'),
        ])
        setSite(siteRes.data)
        setOverview(overviewRes.data)
        setTrend(trendRes.data)
      } catch (err) {
        console.error('Failed to load stats', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId, dateRange])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const pagesPerSession =
    overview && overview.sessions > 0
      ? (overview.pageviews / overview.sessions).toFixed(2)
      : '0.00'
  const freshness = getDataFreshnessState(site?.tracking_last_event_at ?? null)

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Performance Summary</h2>
          <p className="mt-2 text-sm text-app-muted">
            Core traffic, conversion, and revenue signals for the selected period.
          </p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as PresetDateRange)}
          className="select"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <MetricCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Pageviews"
          value={overview?.pageviews?.toLocaleString() || '0'}
          helper="Total tracked page loads"
        />
        <MetricCard
          icon={<Users className="h-4 w-4" />}
          label="Sessions"
          value={overview?.sessions?.toLocaleString() || '0'}
          helper="Unique browsing sessions"
        />
        <MetricCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Revenue"
          value={`$${(overview?.revenue || 0).toFixed(2)}`}
          helper="Attributed order revenue"
        />
        <MetricCard
          icon={<Gauge className="h-4 w-4" />}
          label="Conversion"
          value={`${(overview?.conversion_rate || 0).toFixed(2)}%`}
          helper="Purchase rate per session"
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Freshness"
          value={freshness.label}
          helper={freshness.detail}
          tone={freshness.changeType === 'negative' ? 'warn' : freshness.changeType === 'positive' ? 'good' : 'neutral'}
        />
      </div>

      <SectionCard title="Traffic Trend" description="Pageview trajectory for the active date range.">
        {trend.length > 0 ? (
          <LineChart data={trend} dataKey="pageviews" />
        ) : (
          <EmptyState icon={<BarChart3 className="h-12 w-12" />} body="No trend data available" className="flex h-64 items-center justify-center" />
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Commerce Funnel" description="Step counts across the purchase journey." icon={<ShoppingCart className="h-4 w-4" />}>
          <div className="space-y-4">
            <DetailRow label="Product Views" value={overview?.product_views?.toLocaleString() || '0'} />
            <DetailRow label="Add to Cart" value={overview?.add_to_carts?.toLocaleString() || '0'} />
            <DetailRow label="Checkouts" value={overview?.checkouts?.toLocaleString() || '0'} />
            <DetailRow label="Purchases" value={overview?.purchases?.toLocaleString() || '0'} />
            <DetailRow label="Average Order Value" value={`$${(overview?.aov || 0).toFixed(2)}`} />
          </div>
        </SectionCard>

        <SectionCard title="Audience Quality" description="User volume and browsing depth." icon={<Users className="h-4 w-4" />}>
          <div className="space-y-4">
            <DetailRow label="Unique Users" value={overview?.users?.toLocaleString() || '0'} />
            <DetailRow label="Sessions" value={overview?.sessions?.toLocaleString() || '0'} />
            <DetailRow label="Pages / Session" value={pagesPerSession} />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
