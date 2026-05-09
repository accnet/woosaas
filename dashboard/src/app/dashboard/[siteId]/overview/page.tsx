'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { LineChart, MultiLineChart } from '@/components/ui/charts'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DetailRow } from '@/components/ui/detail-row'
import { DataTable, type Column } from '@/components/ui/data-table'
import { format } from 'date-fns'
import axios from 'axios'
import { sitesApi, statsApi } from '@/lib/api'
import { getDataFreshnessState } from '@/lib/data-freshness'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { OverviewStats, PageStats, Site, TrendPoint } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

const calcDelta = (current: number | undefined, previous: number | undefined): number | null => {
  if (!current || !previous || previous === 0) return null
  return ((current - previous) / previous) * 100
}

function MiniFlowBar({
  label, value, displayValue, max, pct
}: {
  label: string
  value: number
  displayValue: string
  max: number
  pct?: number
}) {
  const barWidth = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-28 shrink-0 text-xs text-app-muted">{label}</div>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-app-subtle">
        <div
          className="h-full rounded-full bg-indigo-400/60"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-app-strong">
        {displayValue}
      </div>
      {pct !== undefined && (
        <div className="w-10 shrink-0 text-right text-xs tabular-nums text-app-soft">
          {pct.toFixed(0)}%
        </div>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const siteId = useSiteId()

  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [pages, setPages] = useState<PageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const loadData = async () => {
      if (!overview) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [siteRes, overviewRes, trendRes, pagesRes] = await Promise.all([
          sitesApi.get(siteId),
          statsApi.overview(siteId, from, to, 'UTC', { signal: controller.signal }),
          statsApi.trend(siteId, from, to, 'day', { signal: controller.signal }),
          statsApi.pages(siteId, from, to, 10, { signal: controller.signal }),
        ])
        setSite(siteRes.data)
        setOverview(overviewRes.data)
        setTrend(trendRes.data)
        setPages(pagesRes.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load stats', err)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()
    return () => controller.abort()
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

  const comparisonLabel = useMemo(() => {
    if (!comparisonPeriod) return undefined
    const from = new Date(comparisonPeriod.from)
    const to = new Date(comparisonPeriod.to)
    return `vs. ${format(from, 'MMM d')} – ${format(to, 'MMM d')}`
  }, [comparisonPeriod])

  const pagesPerSession = useMemo(() =>
    overview && overview.sessions > 0
      ? (overview.pageviews / overview.sessions).toFixed(2)
      : '0.00',
  [overview])

  const freshness = useMemo(() => 
    getDataFreshnessState(site?.tracking_last_event_at ?? null),
  [site?.tracking_last_event_at])

  if (loading) {
    return <AnalyticsPageSkeleton cols={5} />
  }

  const pageColumns: Column<PageStats>[] = [
    { key: 'path', label: 'Page', render: (p) => <span className="truncate max-w-[200px] block font-medium text-app-strong" title={p.path}>{p.path}</span> },
    { key: 'pageviews', label: 'Views', align: 'right', sortable: true, render: (p) => <span className={p.pageviews && p.pageviews > 0 ? '' : 'text-app-soft'}>{p.pageviews?.toLocaleString() || '0'}</span>, sortValue: (p) => p.pageviews },
    { key: 'sessions', label: 'Sessions', align: 'right', sortable: true, render: (p) => <span className={p.sessions && p.sessions > 0 ? '' : 'text-app-soft'}>{p.sessions?.toLocaleString() || '0'}</span>, sortValue: (p) => p.sessions },
    { key: 'revenue', label: 'Revenue', align: 'right', sortable: true, render: (p) => <span className={p.revenue && p.revenue > 0 ? 'font-medium' : 'text-app-soft'}>${(p.revenue || 0).toFixed(2)}</span>, sortValue: (p) => p.revenue },
    { key: 'pageviews_delta', label: 'Δ Views', align: 'right', sortable: true, render: (p) => {
      const delta = p.pageviews_delta
      if (delta == null) return <span className="text-app-soft">-</span>
      const isUp = delta >= 0
      return <span className={`text-xs font-semibold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>{isUp ? '+' : ''}{delta.toFixed(1)}%</span>
    }, sortValue: (p) => p.pageviews_delta },
  ]

  return (
    <AnalyticsPage>

      <AnalyticsPageHeader
        title="Overview"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(value) => setDateRange(value as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />

      <div className={refreshing ? 'opacity-60 transition-opacity duration-200' : 'transition-opacity duration-200'}>
        <AnalyticsPageContent>
          <MetricGrid cols={5}>
            <MetricCard
              label="Pageviews"
              value={overview?.pageviews?.toLocaleString() || '0'}
              delta={calcDelta(overview?.pageviews, prevOverview?.pageviews)}
              comparisonLabel={comparisonLabel}
              sparklineData={trend.map((t) => t.pageviews ?? 0)}
            />
            <MetricCard
              label="Sessions"
              value={overview?.sessions?.toLocaleString() || '0'}
              delta={calcDelta(overview?.sessions, prevOverview?.sessions)}
              comparisonLabel={comparisonLabel}
              sparklineData={trend.map((t) => t.sessions ?? 0)}
            />
            <MetricCard
              label="Revenue"
              value={`$${(overview?.revenue || 0).toFixed(2)}`}
              delta={calcDelta(overview?.revenue, prevOverview?.revenue)}
              comparisonLabel={comparisonLabel}
              tone={overview?.revenue ? 'good' : 'neutral'}
              sparklineData={trend.map((t) => t.revenue ?? 0)}
            />
            <MetricCard
              label="Conversion"
              value={`${(overview?.conversion_rate || 0).toFixed(2)}%`}
              delta={calcDelta(overview?.conversion_rate, prevOverview?.conversion_rate)}
              comparisonLabel={comparisonLabel}
              tone={overview?.conversion_rate ? 'good' : 'neutral'}
            />
            <MetricCard
              label="Freshness"
              value={freshness.label}
              tone={freshness.changeType === 'negative' ? 'warn' : freshness.changeType === 'positive' ? 'good' : 'neutral'}
            />
          </MetricGrid>

          <SectionCard title="Traffic Trend">
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
              <EmptyState icon={<BarChart3 className="h-8 w-8" />} body="No trend data available" className="h-48" />
            )}
          </SectionCard>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionCard title="Commerce Funnel">
            <div className="space-y-1">
              <MiniFlowBar 
                label="Product Views" 
                value={overview?.product_views ?? 0}
                displayValue={(overview?.product_views ?? 0).toLocaleString()}
                max={overview?.product_views ?? 1} 
                pct={100} 
              />
              <MiniFlowBar 
                label="Add to Cart" 
                value={overview?.add_to_carts ?? 0}
                displayValue={(overview?.add_to_carts ?? 0).toLocaleString()}
                max={overview?.product_views ?? 1}
                pct={overview?.product_views ? ((overview.add_to_carts || 0) / overview.product_views) * 100 : 0} 
              />
              <MiniFlowBar 
                label="Checkouts" 
                value={overview?.checkouts ?? 0}
                displayValue={(overview?.checkouts ?? 0).toLocaleString()}
                max={overview?.product_views ?? 1}
                pct={overview?.product_views ? ((overview.checkouts || 0) / overview.product_views) * 100 : 0} 
              />
              <MiniFlowBar 
                label="Purchases" 
                value={overview?.purchases ?? 0}
                displayValue={(overview?.purchases ?? 0).toLocaleString()}
                max={overview?.product_views ?? 1}
                pct={overview?.product_views ? ((overview.purchases || 0) / overview.product_views) * 100 : 0} 
              />
              <div className="mt-4 pt-3 border-t border-app-line">
                <DetailRow label="Avg Order Value" value={`$${(overview?.aov || 0).toFixed(2)}`} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Audience">
            <div className="space-y-3">
              <DetailRow label="Unique Users" value={overview?.users?.toLocaleString() || '0'} />
              <DetailRow label="Sessions" value={overview?.sessions?.toLocaleString() || '0'} />
              <DetailRow label="Pages / Session" value={pagesPerSession} />
            </div>
          </SectionCard>
        </div>

          <SectionCard title="Top Pages" className="overflow-hidden px-0 py-0">
            {pages.length > 0 ? (
              <DataTable columns={pageColumns} data={pages} keyExtractor={(p) => p.path} />
            ) : (
              <EmptyState body="No page data available yet." />
            )}
          </SectionCard>
        </AnalyticsPageContent>
      </div>
    </AnalyticsPage>
  )
}
