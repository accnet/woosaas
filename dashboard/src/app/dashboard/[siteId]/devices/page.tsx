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
import type { DeviceBreakdown, DeviceStats } from '@/lib/types'

type Tab = 'device' | 'browser' | 'os'

const TABS: { key: Tab; label: string }[] = [
  { key: 'device', label: 'Device Type' },
  { key: 'browser', label: 'Browser' },
  { key: 'os', label: 'OS' },
]

export default function DevicesPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<DeviceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()
  const [activeTab, setActiveTab] = useState<Tab>('device')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.devices(siteId, from, to, { signal: controller.signal })
        setData(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load device stats', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [dateRange, siteId])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  const rows: DeviceBreakdown[] =
    activeTab === 'device'
      ? (data?.by_device ?? [])
      : activeTab === 'browser'
      ? (data?.by_browser ?? [])
      : (data?.by_os ?? [])

  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0)

  const columns: Column<DeviceBreakdown>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (r) => <span className="font-semibold text-app-strong">{r.name}</span>,
    },
    {
      key: 'sessions',
      label: 'Sessions',
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = totalSessions > 0 ? (r.sessions / totalSessions) * 100 : 0
        return (
          <div className="min-w-[100px]">
            <div className="text-right text-sm font-semibold tabular-nums text-app-strong">{r.sessions.toLocaleString()}</div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100/80 border border-slate-200/30">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.25)]" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      },
      sortValue: (r) => r.sessions,
    },
    {
      key: 'conversions',
      label: 'Purchases',
      align: 'right',
      sortable: true,
      render: (r) => <span className="tabular-nums font-medium">{r.conversions.toLocaleString()}</span>,
      sortValue: (r) => r.conversions,
    },
    {
      key: 'conversion_rate',
      label: 'Conv. Rate',
      align: 'right',
      sortable: true,
      render: (r) => <span className="tabular-nums font-semibold text-indigo-600">{r.conversion_rate.toFixed(2)}%</span>,
      sortValue: (r) => r.conversion_rate,
    },
    {
      key: 'revenue_per_session',
      label: 'Rev / Session',
      align: 'right',
      sortable: true,
      render: (r) => {
        const rps = r.sessions > 0 ? r.revenue / r.sessions : 0
        return <span className={`tabular-nums font-medium ${rps > 0 ? 'text-emerald-600' : 'text-app-soft'}`}>${rps.toFixed(2)}</span>
      },
      sortValue: (r) => r.sessions > 0 ? r.revenue / r.sessions : 0,
    },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0
        return (
          <div className="min-w-[100px]">
            <div className="text-right text-sm font-semibold tabular-nums text-emerald-600">
              ${r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100/80 border border-slate-200/30">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.25)]" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      },
      sortValue: (r) => r.revenue,
    },
  ]

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Devices"
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
          />
        </MetricGrid>

        <SectionCard title="Breakdown">
          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-xl bg-slate-100/80 border border-slate-200/40 p-1 w-fit backdrop-blur-sm">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold tracking-wide uppercase transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <DataTable columns={columns} data={rows} keyExtractor={(r) => r.name} />
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
