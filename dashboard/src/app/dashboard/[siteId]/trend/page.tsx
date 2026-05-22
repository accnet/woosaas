'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { MultiLineChart } from '@/components/ui/charts'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import axios from 'axios'
import { statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { OverviewStats, TrendPoint } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

// ── helpers ──────────────────────────────────────────────────────────────────

function getPreviousRange(dateRange: PresetDateRange) {
  const { from, to } = getPresetDateRange(dateRange)
  const ms = new Date(to).getTime() - new Date(from).getTime()
  const prevTo = new Date(new Date(from).getTime() - 1).toISOString()
  const prevFrom = new Date(new Date(from).getTime() - ms).toISOString()
  return { from: prevFrom, to: prevTo }
}

function delta(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / prev) * 100
}

function money(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}

// Compute per-day funnel rates as a plain Record array for MultiLineChart
function buildFunnelRates(trend: TrendPoint[]): Array<Record<string, string | number>> {
  return trend.map((p) => ({
    date: p.date,
    add_to_cart_rate: p.product_views > 0 ? +((p.add_to_carts / p.product_views) * 100).toFixed(2) : 0,
    checkout_rate: p.add_to_carts > 0 ? +((p.checkouts / p.add_to_carts) * 100).toFixed(2) : 0,
    conversion_rate: p.sessions > 0 ? +((p.purchases / p.sessions) * 100).toFixed(2) : 0,
  }))
}

// ── CompareCard ───────────────────────────────────────────────────────────────

function CompareCard({ label, current, previous, format: fmt = (v: number) => v.toLocaleString(), sparkline }: {
  label: string
  current: number
  previous: number
  format?: (v: number) => string
  sparkline?: number[]
}) {
  const d = delta(current, previous)
  return (
    <MetricCard
      label={label}
      value={fmt(current)}
      delta={d}
      comparisonLabel="vs prior period"
      tone={d === null ? 'neutral' : d > 0 ? 'good' : 'warn'}
      sparklineData={sparkline}
    />
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrendPage() {
  const siteId = useSiteId()
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [prevOverview, setPrevOverview] = useState<OverviewStats | null>(null)
  const [curOverview, setCurOverview] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const cur = getPresetDateRange(dateRange)
        const prev = getPreviousRange(dateRange)
        const gran = dateRange === '24h' ? 'hour' : 'day'
        const [trendRes, curOvRes, prevOvRes] = await Promise.all([
          statsApi.trend(siteId, cur.from, cur.to, gran, { signal: controller.signal }),
          statsApi.overview(siteId, cur.from, cur.to, 'UTC', { signal: controller.signal }),
          statsApi.overview(siteId, prev.from, prev.to, 'UTC', { signal: controller.signal }),
        ])
        setTrend(trendRes.data)
        setCurOverview(curOvRes.data)
        setPrevOverview(prevOvRes.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load trend data', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [dateRange, siteId])

  // Run rate projection
  const runRate = useMemo(() => {
    if (!trend.length || !curOverview) return null
    const cur = getPresetDateRange(dateRange)
    const totalMs = new Date(cur.to).getTime() - new Date(cur.from).getTime()
    const elapsedMs = Date.now() - new Date(cur.from).getTime()
    const progress = Math.min(elapsedMs / totalMs, 1)
    if (progress < 0.05) return null
    return {
      revenue: (curOverview.revenue / progress),
      orders: Math.round(curOverview.orders / progress),
      progress: Math.round(progress * 100),
    }
  }, [trend, curOverview, dateRange])

  const funnelRates = useMemo(() => buildFunnelRates(trend), [trend])

  if (loading) return <AnalyticsPageSkeleton cols={5} />

  const cur = curOverview
  const prev = prevOverview

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Growth & Trends"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(v) => setDateRange(v as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />
      <AnalyticsPageContent>

        {/* ── Period comparison metric grid ── */}
        <MetricGrid cols={5}>
          <CompareCard
            label="Pageviews"
            current={cur?.pageviews ?? 0}
            previous={prev?.pageviews ?? 0}
            sparkline={trend.map((t) => t.pageviews)}
          />
          <CompareCard
            label="Sessions"
            current={cur?.sessions ?? 0}
            previous={prev?.sessions ?? 0}
            sparkline={trend.map((t) => t.sessions)}
          />
          <CompareCard
            label="Revenue"
            current={cur?.revenue ?? 0}
            previous={prev?.revenue ?? 0}
            format={money}
            sparkline={trend.map((t) => t.revenue)}
          />
          <CompareCard
            label="Orders"
            current={cur?.orders ?? 0}
            previous={prev?.orders ?? 0}
            sparkline={trend.map((t) => t.purchases)}
          />
          <CompareCard
            label="Conv. Rate"
            current={cur?.conversion_rate ?? 0}
            previous={prev?.conversion_rate ?? 0}
            format={(v) => `${v.toFixed(2)}%`}
          />
        </MetricGrid>

        {/* ── Run rate ── */}
        {runRate && (
          <div className="card-glass border border-amber-500/20 bg-amber-500/[0.03] px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="relative h-2 w-2 shrink-0">
                    <div className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-75" />
                    <div className="absolute inset-0 rounded-full bg-amber-500" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700 font-mono">Period Run Rate Projection</span>
                </div>
                <p className="text-sm text-amber-900/90 leading-relaxed font-medium">
                  At current pace (<span className="tabular-nums font-semibold text-amber-800">{runRate.progress}%</span> of period elapsed), projected total:
                  <span className="ml-2 font-bold tabular-nums text-amber-800">{money(runRate.revenue)}</span> revenue ·
                  <span className="ml-1 font-bold tabular-nums text-amber-800">{runRate.orders.toLocaleString()}</span> orders
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Traffic over time ── */}
        <SectionCard title="Traffic Over Time">
          {trend.length > 0 ? (
            <MultiLineChart
              data={trend}
              lines={[
                { dataKey: 'pageviews', color: '#6366f1', name: 'Pageviews', yAxisId: 'left' },
                { dataKey: 'sessions', color: '#22c55e', name: 'Sessions', yAxisId: 'left' },
                { dataKey: 'users', color: '#8b5cf6', name: 'Users', yAxisId: 'left' },
              ]}
            />
          ) : (
            <EmptyState icon={<TrendingUp className="h-8 w-8" />} body="No traffic data available" className="h-48" />
          )}
        </SectionCard>

        {/* ── Revenue & Orders over time ── */}
        <SectionCard title="Revenue & Orders Over Time">
          {trend.length > 0 ? (
            <MultiLineChart
              data={trend}
              lines={[
                { dataKey: 'revenue', color: '#10b981', name: 'Revenue', yAxisId: 'left' },
                { dataKey: 'purchases', color: '#f59e0b', name: 'Orders', yAxisId: 'right' },
              ]}
            />
          ) : (
            <EmptyState icon={<TrendingUp className="h-8 w-8" />} body="No revenue data available" className="h-48" />
          )}
        </SectionCard>

        {/* ── Funnel conversion rates over time ── */}
        <SectionCard title="Funnel Conversion Rates (% per day)">
          <p className="mb-3 text-xs text-app-muted">
            Add-to-Cart Rate = add_to_carts / product_views · Checkout Rate = checkouts / add_to_carts · Order Rate = orders / sessions
          </p>
          {funnelRates.length > 0 ? (
            <MultiLineChart
              data={funnelRates as unknown as TrendPoint[]}
              lines={[
                { dataKey: 'add_to_cart_rate', color: '#f59e0b', name: 'Add-to-Cart Rate %', yAxisId: 'left' },
                { dataKey: 'checkout_rate', color: '#6366f1', name: 'Checkout Rate %', yAxisId: 'left' },
                { dataKey: 'conversion_rate', color: '#10b981', name: 'Order Rate %', yAxisId: 'left' },
              ]}
            />
          ) : (
            <EmptyState icon={<TrendingUp className="h-8 w-8" />} body="No funnel data available" className="h-48" />
          )}
        </SectionCard>

      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}



