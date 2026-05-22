'use client'

import { useEffect, useState } from 'react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import axios from 'axios'
import { ordersApi, statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import { useDateRange } from '@/hooks/use-date-range'
import type { OverviewStats, RefundStats } from '@/lib/types'

export default function RefundsPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<RefundStats | null>(null)
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [refundRes, overviewRes] = await Promise.all([
          ordersApi.refunds(siteId, from, to),
          statsApi.overview(siteId, from, to, 'UTC'),
        ])
        setData(refundRes.data)
        setOverview(overviewRes.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load refund stats', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [dateRange, siteId])

  if (loading) return <AnalyticsPageSkeleton cols={5} />

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const revImpact = overview && overview.revenue > 0
    ? ((data?.refunded_revenue ?? 0) / overview.revenue) * 100
    : null

  const maxRefunds = Math.max(...(data?.top_refunded_products.map((p) => p.refund_count) ?? []), 1)

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Refund Analytics"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(v) => setDateRange(v as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />

      <AnalyticsPageContent>
        <MetricGrid cols={5}>
          <MetricCard label="Total Orders" value={(data?.total_orders ?? 0).toLocaleString()} />
          <MetricCard label="Refunded Orders" value={(data?.refunded_orders ?? 0).toLocaleString()} />
          <MetricCard label="Refund Rate" value={`${(data?.refund_rate ?? 0).toFixed(1)}%`} tone={(data?.refund_rate ?? 0) > 10 ? 'warn' : 'neutral'} />
          <MetricCard label="Refunded Revenue" value={`$${fmt(data?.refunded_revenue ?? 0)}`} />
          <MetricCard
            label="% of Revenue"
            value={revImpact !== null ? `${revImpact.toFixed(1)}%` : 'N/A'}
            tone={revImpact !== null && revImpact > 5 ? 'warn' : 'neutral'}
            helper={overview ? `of $${fmt(overview.revenue)} total revenue` : undefined}
          />
        </MetricGrid>

        {/* Monthly trend table */}
        {(data?.trend?.length ?? 0) > 0 && (
          <SectionCard title="Monthly Trend">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="py-3 pr-4 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Month</th>
                    <th className="py-3 pr-4 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Orders</th>
                    <th className="py-3 pr-4 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Refunds</th>
                    <th className="py-3 pr-4 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Refund Rate</th>
                    <th className="py-3 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Refunded Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {(data?.trend ?? []).map((row) => (
                    <tr key={row.month} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4 font-mono text-sm font-semibold text-app-strong">{row.month}</td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-app-strong">
                        {row.total_orders.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-app-strong">
                        {row.refunded_orders.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums shadow-sm ${
                            row.refund_rate > 10
                              ? 'bg-rose-500/[0.04] border border-rose-500/20 text-rose-600'
                              : row.refund_rate > 5
                              ? 'bg-amber-500/[0.04] border border-amber-500/20 text-amber-600'
                              : 'bg-emerald-500/[0.04] border border-emerald-500/20 text-emerald-600'
                          }`}
                        >
                          {row.refund_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums text-rose-600">
                        ${fmt(row.refunded_revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* Top refunded products */}
        {(data?.top_refunded_products?.length ?? 0) > 0 && (
          <SectionCard title="Top Refunded Products">
            <div className="space-y-3 max-w-3xl">
              {data!.top_refunded_products.map((p) => {
                const pct = maxRefunds > 0 ? (p.refund_count / maxRefunds) * 100 : 0
                return (
                  <div key={p.product_name} className="flex items-center gap-4 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="truncate text-sm font-semibold text-app-strong">{p.product_name}</span>
                        <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-500/[0.04] border border-rose-500/20 px-2 py-0.5 rounded-md">
                          <span className="tabular-nums">{p.refund_count}</span> refunds
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-100 border border-slate-200/20">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 shadow-[0_0_8px_rgba(244,63,94,0.2)] transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-rose-600">${fmt(p.refunded_amount)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
