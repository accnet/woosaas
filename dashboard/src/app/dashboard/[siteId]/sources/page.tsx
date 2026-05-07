'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Globe, RadioTower, Users } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { SourceStats } from '@/lib/types'

export default function SourcesPage() {
  const siteId = useSiteId()
  const [sources, setSources] = useState<SourceStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.sources(siteId, from, to)
        setSources(res.data)
      } catch (err) {
        console.error('Failed to load source data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, siteId])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  const totalSessions = sources.reduce((sum, s) => sum + s.sessions, 0)
  const totalRevenue = sources.reduce((sum, s) => sum + s.revenue, 0)
  const totalUsers = sources.reduce((sum, s) => sum + s.users, 0)

  const columns: Column<SourceStats>[] = [
    { key: 'source', label: 'Source', render: (s) => <span className="font-medium text-app-strong">{s.source || '(direct)'}</span> },
    { key: 'medium', label: 'Medium', render: (s) => <span className="text-app-muted">{s.medium || '(none)'}</span> },
    {
      key: 'sessions',
      label: 'Sessions',
      align: 'right',
      sortable: true,
      render: (s) => {
        const pct = totalSessions > 0 ? (s.sessions / totalSessions) * 100 : 0
        return (
          <div className="min-w-[80px]">
            <div className="text-right text-sm font-medium text-app-strong">{s.sessions?.toLocaleString() || '0'}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-1 rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )
      },
      sortValue: (s) => s.sessions,
    },
    {
      key: 'users',
      label: 'Users',
      align: 'right',
      sortable: true,
      render: (s) => {
        const pct = totalUsers > 0 ? (s.users / totalUsers) * 100 : 0
        return (
          <div className="min-w-[80px]">
            <div className="text-right text-sm font-medium text-app-strong">{s.users?.toLocaleString() || '0'}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-1 rounded-full bg-violet-500 transition-all duration-300"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )
      },
      sortValue: (s) => s.users,
    },
    { key: 'pageviews', label: 'Pageviews', align: 'right', sortable: true, render: (s) => s.pageviews?.toLocaleString() || '0', sortValue: (s) => s.pageviews },
    { key: 'conversions', label: 'Conversions', align: 'right', sortable: true, render: (s) => s.conversions?.toLocaleString() || '0', sortValue: (s) => s.conversions },
    { key: 'conversion_rate', label: 'Conv. Rate', align: 'right', sortable: true, render: (s) => `${(s.conversion_rate || 0).toFixed(2)}%`, sortValue: (s) => s.conversion_rate },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      sortable: true,
      render: (s) => {
        const pct = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0
        return (
          <div className="min-w-[90px]">
            <div className="text-right text-sm font-medium text-emerald-700">${(s.revenue || 0).toFixed(2)}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-1 rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )
      },
      sortValue: (s) => s.revenue,
    },
  ]

  return (
    <div className="space-y-5">

      <AnalyticsPageHeader
        title="Traffic Sources"
        description="Which channels and mediums are driving visits, users, and revenue for this website."
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(value) => setDateRange(value as PresetDateRange)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<RadioTower className="h-4 w-4" />} label="Sources" value={sources.length.toString()} />
        <MetricCard icon={<Globe className="h-4 w-4" />} label="Sessions" value={totalSessions.toLocaleString()} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Users" value={totalUsers.toLocaleString()} />
        <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} tone={totalRevenue > 0 ? 'good' : 'neutral'} />
      </div>

      <SectionCard
        title="Source Breakdown"
        description="Acquisition performance by source and medium inside the analytics app."
        icon={<RadioTower className="h-4 w-4" />}
        className="overflow-hidden px-0 py-0"
      >
        <DataTable columns={columns} data={sources} keyExtractor={(_s) => `${_s.source}-${_s.medium}`} />
      </SectionCard>
    </div>
  )
}
