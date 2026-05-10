'use client'

import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Layers2, LineChart as LineChartIcon, Package, RefreshCw, Target } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MultiLineChart } from '@/components/ui/charts'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { StatusChip } from '@/components/ui/status-chip'
import axios from 'axios'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import { useDateRange } from '@/hooks/use-date-range'
import type { ChannelStat, OverviewStats, ProductStats, SourceStats, TrendPoint } from '@/lib/types'

const CHANNEL_LABELS: Record<string, string> = {
  organic_search: 'Organic Search',
  paid_search: 'Paid Search',
  paid_social: 'Paid Social',
  organic_social: 'Organic Social',
  email: 'Email',
  referral: 'Referral',
  direct: 'Direct',
  other: 'Other',
}

function money(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}

function HorizontalBar({ label, value, max, formatted }: { label: string; value: number; max: number; formatted: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 shrink-0 truncate text-sm text-app-strong" title={label}>{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 shrink-0 text-right text-sm font-semibold text-emerald-700">{formatted}</div>
    </div>
  )
}

export default function RevenuePage() {
  const siteId = useSiteId()
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [products, setProducts] = useState<ProductStats[]>([])
  const [sources, setSources] = useState<SourceStats[]>([])
  const [channels, setChannels] = useState<ChannelStat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const loadData = async () => {
      if (overview) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [overviewRes, trendRes, productsRes, sourcesRes, channelsRes] = await Promise.all([
          statsApi.overview(siteId, from, to, 'UTC', { signal: controller.signal }),
          statsApi.trend(siteId, from, to, dateRange === '24h' ? 'hour' : 'day', { signal: controller.signal }),
          statsApi.products(siteId, from, to, 10, { signal: controller.signal }),
          statsApi.sources(siteId, from, to, { signal: controller.signal }),
          statsApi.channels(siteId, from, to, { signal: controller.signal }),
        ])
        setOverview(overviewRes.data)
        setTrend(trendRes.data)
        setProducts([...productsRes.data].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)))
        setSources([...sourcesRes.data].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)).slice(0, 8))
        setChannels([...channelsRes.data].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)))
      } catch (err) {
        if (axios.isCancel(err)) return
        setError(getApiErrorMessage(err, 'Revenue data could not be loaded right now.'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()
    return () => controller.abort()
  }, [dateRange, reloadKey, siteId])

  const aov = useMemo(() => {
    if (!overview?.purchases || overview.purchases === 0) return 0
    return (overview.revenue || 0) / overview.purchases
  }, [overview])

  const revenuePerSession = useMemo(() => {
    if (!overview?.sessions || overview.sessions === 0) return 0
    return (overview.revenue || 0) / overview.sessions
  }, [overview])

  const maxProductRevenue = useMemo(() => Math.max(...products.map((p) => p.revenue || 0), 0), [products])
  const maxSourceRevenue = useMemo(() => Math.max(...sources.map((s) => s.revenue || 0), 0), [sources])
  const maxChannelRevenue = useMemo(() => Math.max(...channels.map((c) => c.revenue || 0), 0), [channels])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Revenue"
        controls={
          <>
            {refreshing && <StatusChip label="Refreshing" tone="info" />}
            <DateRangeSelect
              value={dateRange}
              onChange={(v) => setDateRange(v as PresetDateRange)}
              options={DATE_RANGE_OPTIONS}
            />
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <InlineErrorState
          body={error}
          compact={Boolean(overview)}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      <AnalyticsPageContent>
        <MetricGrid cols={5}>
          <MetricCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Total Revenue"
            value={money(overview?.revenue || 0)}
            tone={overview?.revenue ? 'good' : 'neutral'}
            sparklineData={trend.map((t) => t.revenue ?? 0)}
          />
          <MetricCard
            icon={<Target className="h-4 w-4" />}
            label="Orders"
            value={(overview?.purchases || 0).toLocaleString()}
            sparklineData={trend.map((t) => t.purchases ?? 0)}
          />
          <MetricCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Avg Order Value"
            value={money(aov)}
            tone={aov > 0 ? 'good' : 'neutral'}
          />
          <MetricCard
            icon={<Target className="h-4 w-4" />}
            label="Conversion Rate"
            value={`${(overview?.conversion_rate || 0).toFixed(2)}%`}
            tone={overview?.conversion_rate ? 'good' : 'neutral'}
          />
          <MetricCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Rev / Session"
            value={money(revenuePerSession)}
            tone={revenuePerSession > 0 ? 'good' : 'neutral'}
            helper={`${(overview?.sessions || 0).toLocaleString()} sessions`}
          />
        </MetricGrid>

        <SectionCard title="Revenue Over Time">
          {trend.length > 0 ? (
            <MultiLineChart
              data={trend}
              lines={[
                { dataKey: 'revenue', color: '#10b981', name: 'Revenue', yAxisId: 'left' },
                { dataKey: 'purchases', color: '#f59e0b', name: 'Orders', yAxisId: 'right' },
              ]}
            />
          ) : (
            <EmptyState icon={<LineChartIcon className="h-8 w-8" />} body="No revenue data available" className="h-48" />
          )}
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionCard title="Revenue by Product">
            {products.length > 0 ? (
              <div className="space-y-1">
                {products.map((p) => (
                  <HorizontalBar
                    key={p.product_id}
                    label={p.product_name || p.product_id}
                    value={p.revenue || 0}
                    max={maxProductRevenue}
                    formatted={money(p.revenue || 0)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Package className="h-8 w-8" />} body="No product revenue data" className="h-32" />
            )}
          </SectionCard>

          <SectionCard title="Revenue by Source">
            {sources.length > 0 ? (
              <div className="space-y-1">
                {sources.map((s) => (
                  <HorizontalBar
                    key={`${s.source}-${s.medium}`}
                    label={`${s.source || '(direct)'}${s.medium ? ` / ${s.medium}` : ''}`}
                    value={s.revenue || 0}
                    max={maxSourceRevenue}
                    formatted={money(s.revenue || 0)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Target className="h-8 w-8" />} body="No source revenue data" className="h-32" />
            )}
          </SectionCard>
        </div>

        <SectionCard title="Revenue by Channel">
          {channels.length > 0 ? (
            <div className="space-y-1">
              {channels.map((c) => (
                <HorizontalBar
                  key={c.channel}
                  label={CHANNEL_LABELS[c.channel] || c.channel}
                  value={c.revenue || 0}
                  max={maxChannelRevenue}
                  formatted={money(c.revenue || 0)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Layers2 className="h-8 w-8" />} body="No channel revenue data" className="h-32" />
          )}
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
