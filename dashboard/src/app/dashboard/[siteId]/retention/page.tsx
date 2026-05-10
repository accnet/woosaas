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
                  <tr className="border-b border-slate-100">
                    <th className="py-2 pr-4 text-left font-medium text-slate-500">Cohort Month</th>
                    <th className="py-2 pr-4 text-right font-medium text-slate-500">New Customers</th>
                    <th className="py-2 pr-4 text-right font-medium text-slate-500">Repeat Customers</th>
                    <th className="py-2 text-right font-medium text-slate-500">Repeat Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.map((row) => {
                    const rate = row.repeat_rate
                    const rateColor =
                      rate >= 30
                        ? 'text-emerald-700 bg-emerald-50'
                        : rate >= 15
                        ? 'text-amber-700 bg-amber-50'
                        : 'text-red-700 bg-red-50'
                    return (
                      <tr key={row.cohort} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-4 font-mono font-medium text-slate-700">{row.cohort}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-700">
                          {row.new_customers.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-slate-700">
                          {row.returning_customers.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${rateColor}`}>
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
