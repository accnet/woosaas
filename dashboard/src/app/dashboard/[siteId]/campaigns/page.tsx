'use client'

import { useEffect, useState } from 'react'
import { BadgeDollarSign, Megaphone, MousePointerClick, TrendingUp } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { useSiteId } from '@/hooks/use-site-id'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { CampaignStats } from '@/lib/types'

export default function CampaignsPage() {
  const siteId = useSiteId()
  const [campaigns, setCampaigns] = useState<CampaignStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.campaigns(siteId, from, to)
        setCampaigns(res.data)
      } catch (err) {
        console.error('Failed to load campaign data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const topCampaign = campaigns[0]
  const totalSessions = campaigns.reduce((sum, campaign) => sum + (campaign.sessions || 0), 0)
  const totalRevenue = campaigns.reduce((sum, campaign) => sum + (campaign.revenue || 0), 0)

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Campaigns</h2>
          <p className="mt-2 text-sm text-app-muted">
            Performance by campaign, source, and medium for the selected attribution window.
          </p>
        </div>

        <select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value as PresetDateRange)}
          className="select"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Megaphone className="h-4 w-4" />} label="Tracked Campaigns" value={campaigns.length.toString()} helper="Rows with attribution data" />
        <MetricCard icon={<MousePointerClick className="h-4 w-4" />} label="Sessions" value={totalSessions.toLocaleString()} helper="Total campaign sessions" />
        <MetricCard icon={<BadgeDollarSign className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} helper="Attributed revenue across campaigns" />
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Top Campaign" value={topCampaign?.campaign || '(none)'} helper={topCampaign ? `${(topCampaign.conversion_rate || 0).toFixed(2)}% conversion` : 'No campaign leader yet'} valueClassName="truncate text-2xl" />
      </div>

      <div className="card overflow-hidden">
        <div className="panel-header border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-app-strong">Campaign Breakdown</h3>
            <p className="mt-1 text-sm text-app-muted">Use this view to compare traffic quality and monetization by source.</p>
          </div>
        </div>
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="table-header-th">Campaign</th>
              <th className="table-header-th">Source</th>
              <th className="table-header-th">Medium</th>
              <th className="table-header-th text-right">Sessions</th>
              <th className="table-header-th text-right">Conversions</th>
              <th className="table-header-th text-right">Conv. Rate</th>
              <th className="table-header-th text-right">Revenue</th>
              <th className="table-header-th text-right">Rev / Session</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {campaigns.map((camp, i) => (
              <tr key={i} className="table-row">
                <td className="table-cell font-medium text-app-strong">{camp.campaign || '(none)'}</td>
                <td className="table-cell text-app-muted">{camp.source || '-'}</td>
                <td className="table-cell text-app-muted">{camp.medium || '-'}</td>
                <td className="table-cell text-right">{camp.sessions?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{camp.conversions?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{(camp.conversion_rate || 0).toFixed(2)}%</td>
                <td className="table-cell text-right font-medium">${(camp.revenue || 0).toFixed(2)}</td>
                <td className="table-cell text-right">${(camp.revenue_per_session || 0).toFixed(2)}</td>
              </tr>

            ))}
          </tbody>
        </table>
        {campaigns.length === 0 && (
          <EmptyState icon={<Megaphone className="h-12 w-12" />} body="No campaign data available" />
        )}
      </div>
    </div>
  )
}
