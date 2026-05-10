'use client'

import { useEffect, useState } from 'react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { DataTable, type Column } from '@/components/ui/data-table'
import axios from 'axios'
import { statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import { useDateRange } from '@/hooks/use-date-range'
import type { GeoStat } from '@/lib/types'

export default function GeoPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<GeoStat[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.geo(siteId, from, to, { signal: controller.signal })
        setData(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load geo stats', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [dateRange, siteId])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  const totalSessions = data.reduce((s, r) => s + r.sessions, 0)
  const totalRevenue = data.reduce((s, r) => s + r.revenue, 0)
  const totalConversions = data.reduce((s, r) => s + r.conversions, 0)
  const topByRevenue = [...data].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const topBySessions = [...data].sort((a, b) => b.sessions - a.sessions).slice(0, 5)

  const columns: Column<GeoStat>[] = [
    {
      key: 'country',
      label: 'Country',
      render: (r) => <span className="font-medium text-app-strong">{r.country}</span>,
    },
    {
      key: 'sessions',
      label: 'Sessions',
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = totalSessions > 0 ? (r.sessions / totalSessions) * 100 : 0
        return (
          <div className="min-w-[80px]">
            <div className="text-right text-sm font-medium">{r.sessions.toLocaleString()}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-1 rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      },
      sortValue: (r) => r.sessions,
    },
    {
      key: 'users',
      label: 'Users',
      align: 'right',
      sortable: true,
      render: (r) => r.users.toLocaleString(),
      sortValue: (r) => r.users,
    },
    {
      key: 'conversions',
      label: 'Purchases',
      align: 'right',
      sortable: true,
      render: (r) => r.conversions.toLocaleString(),
      sortValue: (r) => r.conversions,
    },
    {
      key: 'conversion_rate',
      label: 'Conv. Rate',
      align: 'right',
      sortable: true,
      render: (r) => `${r.conversion_rate.toFixed(2)}%`,
      sortValue: (r) => r.conversion_rate,
    },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0
        return (
          <div className="min-w-[80px]">
            <div className="text-right text-sm font-semibold text-emerald-700">
              ${r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      },
      sortValue: (r) => r.revenue,
    },
    {
      key: 'aov',
      label: 'AOV',
      align: 'right',
      sortable: true,
      render: (r) => {
        const aov = r.conversions > 0 ? r.revenue / r.conversions : 0
        return <span className={aov > 0 ? 'text-sm font-medium' : 'text-app-muted'}>${aov.toFixed(2)}</span>
      },
      sortValue: (r) => r.conversions > 0 ? r.revenue / r.conversions : 0,
    },
  ]

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Geography"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(v) => setDateRange(v as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />

      <AnalyticsPageContent>
        <MetricGrid cols={3}>
          <MetricCard label="Total Sessions" value={totalSessions.toLocaleString()} />
          <MetricCard label="Total Purchases" value={totalConversions.toLocaleString()} />
          <MetricCard
            label="Total Revenue"
            value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            tone={totalRevenue > 0 ? 'good' : 'neutral'}
          />
        </MetricGrid>

        {/* Top 5 by sessions vs top 5 by revenue */}
        {data.length > 0 && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard title="Top 5 by Sessions">
              <div className="space-y-2">
                {topBySessions.map((r) => {
                  const pct = totalSessions > 0 ? (r.sessions / totalSessions) * 100 : 0
                  return (
                    <div key={r.country} className="flex items-center gap-3 py-1">
                      <div className="w-28 shrink-0 text-sm font-medium text-app-strong truncate">{r.country}</div>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="w-20 shrink-0 text-right text-sm font-semibold">{r.sessions.toLocaleString()}</div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
            <SectionCard title="Top 5 by Revenue">
              <div className="space-y-2">
                {topByRevenue.map((r) => {
                  const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0
                  return (
                    <div key={r.country} className="flex items-center gap-3 py-1">
                      <div className="w-28 shrink-0 text-sm font-medium text-app-strong truncate">{r.country}</div>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2">
                        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="w-24 shrink-0 text-right text-sm font-semibold text-emerald-700">${r.revenue.toFixed(0)}</div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>
        )}

        <SectionCard title={`All ${data.length} Countries`} className="overflow-hidden px-0 py-0">
          <DataTable columns={columns} data={data} keyExtractor={(r) => r.country} />
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
