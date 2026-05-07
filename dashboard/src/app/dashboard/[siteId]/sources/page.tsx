'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Globe, RadioTower, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
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

  if (loading) return <LoadingSpinner className="py-16" />

  const totalSessions = sources.reduce((sum, s) => sum + s.sessions, 0)
  const totalRevenue = sources.reduce((sum, s) => sum + s.revenue, 0)
  const totalUsers = sources.reduce((sum, s) => sum + s.users, 0)

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Traffic Sources</h2>
          <p className="mt-2 text-sm text-app-muted">Which channels and mediums are driving visits, users, and revenue.</p>
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value as PresetDateRange)} className="select">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<RadioTower className="h-4 w-4" />} label="Sources" value={sources.length.toString()} />
        <MetricCard icon={<Globe className="h-4 w-4" />} label="Sessions" value={totalSessions.toLocaleString()} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Users" value={totalUsers.toLocaleString()} />
        <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
      </div>

      <div className="table-container">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Source</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Medium</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Pageviews</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Sessions</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Users</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Conversions</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Conv. Rate</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Revenue</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {sources.map((source, i) => (
              <tr key={i} className="table-row">
                <td className="table-cell font-medium text-app-strong">{source.source || '(direct)'}</td>
                <td className="table-cell text-app-muted">{source.medium || '(none)'}</td>
                <td className="table-cell text-right">{source.pageviews?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{source.sessions?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{source.users?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{source.conversions?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{(source.conversion_rate || 0).toFixed(2)}%</td>
                <td className="table-cell text-right font-medium">${(source.revenue || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sources.length === 0 && <EmptyState body="No source data available" />}
      </div>
    </div>
  )
}
