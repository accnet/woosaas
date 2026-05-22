'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { BarChart } from '@/components/ui/charts'
import axios from 'axios'
import { ordersApi } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { RetentionCohort } from '@/lib/types'

export default function RetentionPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<RetentionCohort[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const res = await ordersApi.retention(siteId)
        setData(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load retention cohorts', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [siteId])

  // Prepare chart data for new vs returning by month (must be before early return — Rules of Hooks)
  const chartData = useMemo(() =>
    data.map((r) => ({
      name: r.cohort,
      new: r.new_customers,
      returning: r.returning_customers,
    })), [data])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  const totalNew = data.reduce((s, r) => s + r.new_customers, 0)
  const totalReturning = data.reduce((s, r) => s + r.returning_customers, 0)
  const avgRepeatRate =
    data.length > 0 ? data.reduce((s, r) => s + r.repeat_rate, 0) / data.length : 0
  const repeatRatio = totalNew + totalReturning > 0
    ? (totalReturning / (totalNew + totalReturning)) * 100 : 0

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader title="Customer Retention" />

      <AnalyticsPageContent>
        <MetricGrid cols={4}>
          <MetricCard label="New Customers (12m)" value={totalNew.toLocaleString()} />
          <MetricCard label="Repeat Customers (12m)" value={totalReturning.toLocaleString()} />
          <MetricCard label="Avg Repeat Rate" value={`${avgRepeatRate.toFixed(1)}%`} tone={avgRepeatRate >= 20 ? 'good' : 'warn'} />
          <MetricCard label="Repeat Customer Share" value={`${repeatRatio.toFixed(1)}%`} tone={repeatRatio >= 20 ? 'good' : 'neutral'} />
        </MetricGrid>

        {/* New vs Returning BarChart */}
        {chartData.length > 0 && (
          <SectionCard title="New vs Returning Customers by Month">
            <BarChart
              data={chartData}
              dataKey="name"
              bars={[
                { dataKey: 'new', color: '#6366f1', name: 'New Customers' },
                { dataKey: 'returning', color: '#10b981', name: 'Repeat Customers' },
              ]}
              height={260}
            />
          </SectionCard>
        )}

        <SectionCard title="Cohort Table">
          {data.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No cohort data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="py-3 pr-4 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Cohort Month</th>
                    <th className="py-3 pr-4 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">New Customers</th>
                    <th className="py-3 pr-4 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Repeat Customers</th>
                    <th className="py-3 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Repeat Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {data.map((row) => {
                    const rate = row.repeat_rate
                    const rateChipColor =
                      rate >= 30
                        ? 'text-emerald-600 bg-emerald-500/[0.04] border border-emerald-500/20'
                        : rate >= 15
                        ? 'text-amber-600 bg-amber-500/[0.04] border border-amber-500/20'
                        : 'text-rose-600 bg-rose-500/[0.04] border border-rose-500/20'
                    return (
                      <tr key={row.cohort} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-sm font-semibold text-app-strong">{row.cohort}</td>
                        <td className="py-3 pr-4 text-right font-semibold tabular-nums text-app-strong">
                          {row.new_customers.toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold tabular-nums text-app-strong">
                          {row.returning_customers.toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums shadow-sm ${rateChipColor}`}>
                            {rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
