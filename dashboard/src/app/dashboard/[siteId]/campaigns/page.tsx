'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BadgeDollarSign,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Target,
  Tags,
} from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableSection } from '@/components/ui/table-section'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { CampaignStats } from '@/lib/types'

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export default function CampaignsPage() {
  const siteId = useSiteId()
  const [campaigns, setCampaigns] = useState<CampaignStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (loading || campaigns.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.campaigns(siteId, from, to)
        if (!cancelled) {
          setCampaigns(res.data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Campaign analytics could not be loaded right now.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [dateRange, reloadKey, siteId])

  const totals = useMemo(() => {
    const totalSessions = campaigns.reduce((sum, campaign) => sum + (campaign.sessions || 0), 0)
    const totalConversions = campaigns.reduce((sum, campaign) => sum + (campaign.conversions || 0), 0)
    const totalRevenue = campaigns.reduce((sum, campaign) => sum + (campaign.revenue || 0), 0)
    const topCampaign = campaigns.reduce<CampaignStats | null>((leader, campaign) => {
      if (!leader || campaign.revenue > leader.revenue) {
        return campaign
      }
      return leader
    }, null)

    return { totalSessions, totalConversions, totalRevenue, topCampaign }
  }, [campaigns])

  if (loading && campaigns.length === 0) {
    return <LoadingSpinner className="py-16" />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Campaigns"
        description="Performance by campaign, source, and medium for the selected attribution window."
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <DateRangeSelect
              value={dateRange}
              onChange={(value) => setDateRange(value as PresetDateRange)}
              options={DATE_RANGE_OPTIONS}
            />
          </>
        }
      />

      {error ? (
        <InlineErrorState
          body={error}
          compact={campaigns.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard
          icon={<Megaphone className="h-4 w-4" />}
          label="Tracked Campaigns"
          value={campaigns.length.toString()}
          helper="Rows with campaign attribution"
        />
        <MetricCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Sessions"
          value={totals.totalSessions.toLocaleString()}
          helper="Attributed campaign sessions"
        />
        <MetricCard
          icon={<Target className="h-4 w-4" />}
          label="Conversions"
          value={totals.totalConversions.toLocaleString()}
          helper="Total converted sessions"
        />
        <MetricCard
          icon={<BadgeDollarSign className="h-4 w-4" />}
          label="Revenue"
          value={`$${totals.totalRevenue.toFixed(2)}`}
          helper={
            totals.topCampaign
              ? `Leader: ${totals.topCampaign.campaign || '(none)'}`
              : 'No attributed revenue in this range'
          }
        />
      </div>

      <TableSection
        title="Campaign Breakdown"
        description="Compare campaign traffic quality, conversion efficiency, and monetization in one place."
        icon={<Tags className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-2">
            <StatusChip label={`${campaigns.length} campaigns`} tone="neutral" />
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </div>
        }
        isEmpty={campaigns.length === 0}
        emptyTitle="No campaign data yet"
        emptyBody="Campaign metrics will appear once visits arrive with campaign, source, or medium attribution."
        emptyIcon={<Megaphone className="h-12 w-12" />}
      >
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th>Campaign</th>
              <th>Source / Medium</th>
              <th className="text-right">Sessions</th>
              <th className="text-right">Conversions</th>
              <th className="text-right">Conv. Rate</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Rev / Session</th>
              <th className="text-right">Signal Coverage</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {campaigns.map((campaign) => {
              const signalCount =
                campaign.gclid_events +
                campaign.fbclid_events +
                campaign.ttclid_events +
                campaign.msclkid_events

              return (
                <tr
                  key={`${campaign.campaign}-${campaign.source}-${campaign.medium}`}
                  className="table-row"
                >
                  <td className="table-cell max-w-[240px]">
                    <div className="truncate font-medium text-app-strong" title={campaign.campaign || '(none)'}>
                      {campaign.campaign || '(none)'}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="font-medium text-app-strong">{campaign.source || '(direct)'}</div>
                    <div className="mt-1 text-xs text-app-muted">{campaign.medium || '(none)'}</div>
                  </td>
                  <td className="table-cell text-right">{campaign.sessions.toLocaleString()}</td>
                  <td className="table-cell text-right">{campaign.conversions.toLocaleString()}</td>
                  <td className="table-cell text-right">{campaign.conversion_rate.toFixed(2)}%</td>
                  <td className="table-cell text-right font-medium">${campaign.revenue.toFixed(2)}</td>
                  <td className="table-cell text-right">${campaign.revenue_per_session.toFixed(2)}</td>
                  <td className="table-cell text-right">
                    <StatusChip
                      label={signalCount > 0 ? `${signalCount.toLocaleString()} ids` : 'Organic'}
                      tone={signalCount > 0 ? 'info' : 'neutral'}
                      className="justify-center"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableSection>
    </div>
  )
}
