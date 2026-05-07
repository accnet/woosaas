'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, DollarSign, Gauge, MousePointerClick, ShoppingCart, Users, PanelLeft } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { LineChart, MultiLineChart } from '@/components/ui/charts'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DetailRow } from '@/components/ui/detail-row'
import { DataTable, type Column } from '@/components/ui/data-table'
import { sitesApi, statsApi } from '@/lib/api'
import { getDataFreshnessState } from '@/lib/data-freshness'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { OverviewStats, PageStats, Site, TrendPoint } from '@/lib/types'

export default function OverviewPage() {
  const siteId = useSiteId()

  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [pages, setPages] = useState<PageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('7d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [siteRes, overviewRes, trendRes, pagesRes] = await Promise.all([
          sitesApi.get(siteId),
          statsApi.overview(siteId, from, to),
          statsApi.trend(siteId, from, to, 'day'),
          statsApi.pages(siteId, from, to, 10),
        ])
        setSite(siteRes.data)
        setOverview(overviewRes.data)
        setTrend(trendRes.data)
        setPages(pagesRes.data)
      } catch (err) {
        console.error('Failed to load stats', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId, dateRange])

  // Compare period (previous same-length period for delta)
  const comparisonPeriod = useMemo(() => {
    if (!overview) return null
    const days = dateRange === '24h' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
    const to = new Date()
    const prevTo = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const prevFrom = new Date(prevTo.getTime() - days * 24 * 60 * 60 * 1000)
    const params = { site_id: siteId, from: prevFrom.toISOString(), to: prevTo.toISOString(), timezone: 'UTC' }
    return params
  }, [dateRange, siteId, overview])

  const [prevOverview, setPrevOverview] = useState<OverviewStats | null>(null)

  useEffect(() => {
    if (!comparisonPeriod) return
    const loadComparison = async () => {
      try {
        const res = await statsApi.overview(siteId, comparisonPeriod.from, comparisonPeriod.to)
        setPrevOverview(res.data)
      } catch {
        // Comparison data may not be available
      }
    }
    void loadComparison()
  }, [comparisonPeriod, siteId])

  const calcDelta = (current: number | undefined, previous: number | undefined): number | null => {
    if (!current || !previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const pagesPerSession =
    overview && overview.sessions > 0
      ? (overview.pageviews / overview.sessions).toFixed(2)
      : '0.00'
  const freshness = getDataFreshnessState(site?.tracking_last_event_at ?? null)

  const pageColumns: Column<PageStats>[] = [
    { key: 'path', label: 'Page', render: (p) => <span className="truncate max-w-[200px] block font-medium text-app-strong" title={p.path}>{p.path}</span> },
    { key: 'pageviews', label: 'Views', align: 'right', sortable: true, render: (p) => p.pageviews?.toLocaleString() || '0', sortValue: (p) => p.pageviews },
    { key: 'sessions', label: 'Sessions', align: 'right', sortable: true, render: (p) => p.sessions?.toLocaleString() || '0', sortValue: (p) => p.sessions },
    { key: 'revenue', label: 'Revenue', align: 'right', sortable: true, render: (p) => <span className="font-medium">${(p.revenue || 0).toFixed(2)}</span>, sortValue: (p) => p.revenue },
    { key: 'pageviews_delta', label: 'Δ Views', align: 'right', sortable: true, render: (p) => {
      const delta = p.pageviews_delta
      if (delta == null) return <span className="text-app-soft">-</span>
      const isUp = delta >= 0
      return <span className={`text-xs font-semibold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>{isUp ? '+' : ''}{delta.toFixed(1)}%</span>
    }, sortValue: (p) => p.pageviews_delta },
  ]

  return (
    <div className="space-y-5">

      <AnalyticsPageHeader
        title="Analytics Overview"
        description="Snapshot of the analytics app for this website, covering traffic, conversion, and revenue signals."
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(value) => setDateRange(value as PresetDateRange)}
            options={[
              { value: '24h', label: 'Last 24 hours' },
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <MetricCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Pageviews"
          value={overview?.pageviews?.toLocaleString() || '0'}
          delta={calcDelta(overview?.pageviews, prevOverview?.pageviews)}
          helper="Total tracked page loads"
        />
        <MetricCard
          icon={<Users className="h-4 w-4" />}
          label="Sessions"
          value={overview?.sessions?.toLocaleString() || '0'}
          delta={calcDelta(overview?.sessions, prevOverview?.sessions)}
          helper="Unique browsing sessions"
        />
        <MetricCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Revenue"
          value={`$${(overview?.revenue || 0).toFixed(2)}`}
          delta={calcDelta(overview?.revenue, prevOverview?.revenue)}
          helper="Attributed order revenue"
        />
        <MetricCard
          icon={<Gauge className="h-4 w-4" />}
          label="Conversion"
          value={`${(overview?.conversion_rate || 0).toFixed(2)}%`}
          delta={calcDelta(overview?.conversion_rate, prevOverview?.conversion_rate)}
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

      <SectionCard title="Traffic Trend" description="Multi-metric trajectory inside the analytics app for the active date range.">
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
          <EmptyState icon={<BarChart3 className="h-12 w-12" />} body="No trend data available" className="flex h-64 items-center justify-center" />
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Commerce Funnel" description="Step counts across the website purchase journey." icon={<ShoppingCart className="h-4 w-4" />}>
          <div className="space-y-4">
            <DetailRow label="Product Views" value={overview?.product_views?.toLocaleString() || '0'} />
            <DetailRow label="Add to Cart" value={overview?.add_to_carts?.toLocaleString() || '0'} />
            <DetailRow label="Checkouts" value={overview?.checkouts?.toLocaleString() || '0'} />
            <DetailRow label="Purchases" value={overview?.purchases?.toLocaleString() || '0'} />
            <DetailRow label="Average Order Value" value={`$${(overview?.aov || 0).toFixed(2)}`} />
          </div>
        </SectionCard>

        <SectionCard title="Audience Quality" description="User volume and browsing depth within this website workspace." icon={<Users className="h-4 w-4" />}>
          <div className="space-y-4">
            <DetailRow label="Unique Users" value={overview?.users?.toLocaleString() || '0'} />
            <DetailRow label="Sessions" value={overview?.sessions?.toLocaleString() || '0'} />
            <DetailRow label="Pages / Session" value={pagesPerSession} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Top Pages" description="Highest-traffic pages for this website in the selected period." icon={<PanelLeft className="h-4 w-4" />} className="overflow-hidden px-0 py-0">
        {pages.length > 0 ? (
          <DataTable columns={pageColumns} data={pages} keyExtractor={(p) => p.path} />
        ) : (
          <EmptyState body="No page data available yet." />
        )}
      </SectionCard>
    </div>
  )
}
