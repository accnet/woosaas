'use client'

import { useEffect, useState } from 'react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { MultiLineChart } from '@/components/ui/charts'
import axios from 'axios'
import { statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import { useDateRange } from '@/hooks/use-date-range'
import type { AbandonedProduct, AbandonmentStats, TrendPoint } from '@/lib/types'

export default function AbandonmentPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<AbandonmentStats | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [abanRes, trendRes] = await Promise.all([
          statsApi.abandonment(siteId, from, to, { signal: controller.signal }),
          statsApi.trend(siteId, from, to, 'day', { signal: controller.signal }),
        ])
        setData(abanRes.data)
        setTrend(trendRes.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load abandonment stats', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [dateRange, siteId])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  const products = data?.top_abandoned_products ?? []
  const maxATC = Math.max(...products.map((p) => p.add_to_carts), 1)
  const aov = data?.aov ?? 0

  // Cart rate trend data (add-to-cart vs checkout sessions)
  const trendData = trend

  const columns: Column<AbandonedProduct>[] = [
    {
      key: 'product_name',
      label: 'Product',
      render: (r) => <span className="font-semibold text-app-strong">{r.product_name || r.product_id}</span>,
    },
    {
      key: 'add_to_carts',
      label: 'Add-to-Carts',
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = maxATC > 0 ? (r.add_to_carts / maxATC) * 100 : 0
        return (
          <div className="min-w-[100px] flex items-center justify-end gap-3">
            <span className="tabular-nums font-semibold text-app-strong text-right w-12">{r.add_to_carts.toLocaleString()}</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 border border-slate-200/20 shrink-0">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_6px_rgba(59,130,246,0.2)]" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      },
      sortValue: (r) => r.add_to_carts,
    },
    {
      key: 'purchases',
      label: 'Purchases',
      align: 'right',
      sortable: true,
      render: (r) => <span className="tabular-nums font-medium text-app-strong">{r.purchases.toLocaleString()}</span>,
      sortValue: (r) => r.purchases,
    },
    {
      key: 'abandoned',
      label: 'Abandoned',
      align: 'right',
      sortable: true,
      render: (r) => <span className="tabular-nums font-semibold text-amber-600">{r.abandoned.toLocaleString()}</span>,
      sortValue: (r) => r.abandoned,
    },
    {
      key: 'abandon_rate',
      label: 'Abandon Rate',
      align: 'right',
      sortable: true,
      render: (r) => {
        const rate = r.abandon_rate
        const color = rate > 70 ? 'text-rose-600' : rate > 40 ? 'text-amber-600' : 'text-emerald-600'
        return <span className={`tabular-nums font-bold ${color}`}>{rate.toFixed(1)}%</span>
      },
      sortValue: (r) => r.abandon_rate,
    },
    {
      key: 'est_lost_revenue',
      label: 'Est. Lost Revenue',
      align: 'right',
      sortable: true,
      render: (r) => {
        const lost = r.abandoned * aov
        return <span className={`tabular-nums font-bold ${lost > 0 ? 'text-rose-600' : 'text-app-soft'}`}>${lost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      },
      sortValue: (r) => r.abandoned * aov,
    },
  ]

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Cart Abandonment"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(v) => setDateRange(v as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />

      <AnalyticsPageContent>
        <MetricGrid cols={4}>
          <MetricCard label="Cart Sessions" value={(data?.cart_sessions ?? 0).toLocaleString()} />
          <MetricCard
            label="Abandoned Sessions"
            value={(data?.abandoned_sessions ?? 0).toLocaleString()}
          />
          <MetricCard
            label="Abandonment Rate"
            value={`${(data?.abandonment_rate ?? 0).toFixed(1)}%`}
          />
          <MetricCard
            label="Est. Lost Revenue"
            value={`$${(data?.estimated_lost_revenue ?? 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
          />
        </MetricGrid>

        {/* Funnel visual */}
        {data && data.cart_sessions > 0 && (
          <SectionCard title="Conversion Funnel">
            <div className="space-y-4 max-w-3xl">
              {[
                {
                  label: 'Added to Cart',
                  value: data.cart_sessions,
                  colorClass: 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.25)]',
                },
                {
                  label: 'Purchased',
                  value: data.cart_sessions - data.abandoned_sessions,
                  colorClass: 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.25)]',
                },
                {
                  label: 'Abandoned',
                  value: data.abandoned_sessions,
                  colorClass: 'bg-gradient-to-r from-rose-500 to-orange-500 shadow-[0_0_8px_rgba(244,63,94,0.25)]',
                },
              ].map((step) => {
                const pct = data.cart_sessions > 0 ? (step.value / data.cart_sessions) * 100 : 0
                return (
                  <div key={step.label} className="flex items-center gap-3 py-1">
                    <div className="w-32 shrink-0 text-xs font-bold uppercase tracking-wider text-app-strong">{step.label}</div>
                    <div className="flex-1 overflow-hidden rounded-full bg-slate-100 border border-slate-200/20 h-2.5">
                      <div
                        className={`h-full rounded-full ${step.colorClass} transition-all duration-500`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="w-36 text-right text-sm font-semibold text-app-strong shrink-0">
                      <span className="tabular-nums font-bold">{step.value.toLocaleString()}</span>
                      <span className="ml-1.5 text-xs text-app-muted font-normal">
                        (<span className="tabular-nums font-semibold">{pct.toFixed(1)}%</span>)
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )}

        <SectionCard title="Top Abandoned Products">
          <DataTable columns={columns} data={products} keyExtractor={(r) => r.product_id} />
        </SectionCard>

        {trendData.length > 0 && (
          <SectionCard title="Cart vs Checkout Trend">
            <p className="mb-3 text-xs text-app-muted">Daily add-to-cart and checkout session counts over the selected period.</p>
            <MultiLineChart
              data={trendData}
              lines={[
                { dataKey: 'add_to_carts', color: '#f59e0b', name: 'Add to Cart', yAxisId: 'left' },
                { dataKey: 'checkouts', color: '#6366f1', name: 'Checkouts', yAxisId: 'left' },
              ]}
            />
          </SectionCard>
        )}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
