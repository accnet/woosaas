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
import type { ChannelStat } from '@/lib/types'

const CHANNEL_LABELS: Record<string, string> = {
  paid_search: 'Paid Search',
  paid_social: 'Paid Social',
  organic_search: 'Organic Search',
  organic_social: 'Organic Social',
  email: 'Email',
  referral: 'Referral',
  direct: 'Direct',
  other: 'Other',
}

export default function ChannelsPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<ChannelStat[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.channels(siteId, from, to, { signal: controller.signal })
        setData(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load channel stats', err)
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
  const totalOrders = data.reduce((s, r) => s + r.conversions, 0)
  const overallCR = totalSessions > 0 ? (totalOrders / totalSessions) * 100 : 0

  const columns: Column<ChannelStat>[] = [
    {
      key: 'channel',
      label: 'Channel',
      render: (r) => (
        <span className="font-medium text-app-strong">
          {CHANNEL_LABELS[r.channel] ?? r.channel}
        </span>
      ),
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
      label: 'Orders',
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
            <div className="text-right text-sm font-medium text-emerald-700">${r.revenue.toFixed(2)}</div>
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
      render: (r) => `$${r.aov.toFixed(2)}`,
      sortValue: (r) => r.aov,
    },
  ]

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Revenue by Channel"
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
          <MetricCard
            label="Sessions"
            value={totalSessions.toLocaleString()}
          />
          <MetricCard
            label="Orders"
            value={totalOrders.toLocaleString()}
          />
          <MetricCard
            label="Revenue"
            value={`$${totalRevenue.toFixed(2)}`}
            tone={totalRevenue > 0 ? 'good' : 'neutral'}
          />
          <MetricCard
            label="Conv. Rate"
            value={`${overallCR.toFixed(2)}%`}
            tone={overallCR > 0 ? 'good' : 'neutral'}
          />
        </MetricGrid>

        <SectionCard title="Channel Breakdown" className="overflow-hidden px-0 py-0">
          {data.length > 0 ? (
            <DataTable
              columns={columns}
              data={data}
              keyExtractor={(r) => r.channel}
            />
          ) : (
            <div className="py-16 text-center text-sm text-app-muted">No channel data available for this period.</div>
          )}
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
