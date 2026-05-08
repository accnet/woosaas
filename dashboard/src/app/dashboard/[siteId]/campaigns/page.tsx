'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { DataTable, type Column } from '@/components/ui/data-table'
import { useSiteId } from '@/hooks/use-site-id'
import axios from 'axios'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { CampaignStats } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

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
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (!campaigns.length) setLoading(true)
      else setRefreshing(true)

      setError(null)

      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.campaigns(siteId, from, to, { signal: controller.signal })
        setCampaigns(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        setError(getApiErrorMessage(err, 'Campaign analytics could not be loaded right now.'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()
    return () => controller.abort()
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

  const columns: Column<CampaignStats>[] = [
    {
      key: 'campaign',
      label: 'Campaign',
      render: (c) => <span className="truncate max-w-[200px] block font-medium text-app-strong" title={c.campaign || '(none)'}>{c.campaign || '(none)'}</span>,
    },
    {
      key: 'source_medium',
      label: 'Source / Medium',
      render: (c) => (
        <div>
          <div className="font-medium text-app-strong">{c.source || '(direct)'}</div>
          <div className="mt-0.5 text-xs text-app-muted">{c.medium || '(none)'}</div>
        </div>
      ),
    },
    { key: 'sessions', label: 'Sessions', align: 'right', sortable: true, render: (c) => c.sessions.toLocaleString(), sortValue: (c) => c.sessions },
    { key: 'conversions', label: 'Conversions', align: 'right', sortable: true, render: (c) => c.conversions.toLocaleString(), sortValue: (c) => c.conversions },
    { key: 'conversion_rate', label: 'Conv. Rate', align: 'right', sortable: true, render: (c) => `${c.conversion_rate.toFixed(2)}%`, sortValue: (c) => c.conversion_rate },
    { key: 'revenue', label: 'Revenue', align: 'right', sortable: true, render: (c) => <span className="font-medium">${c.revenue.toFixed(2)}</span>, sortValue: (c) => c.revenue },
    { key: 'revenue_per_session', label: 'Rev / Session', align: 'right', sortable: true, render: (c) => `$${c.revenue_per_session.toFixed(2)}`, sortValue: (c) => c.revenue_per_session },
    {
      key: 'signal_coverage',
      label: 'Signal Coverage',
      align: 'right',
      render: (c) => {
        const signalCount = c.gclid_events + c.fbclid_events + c.ttclid_events + c.msclkid_events
        return <StatusChip label={signalCount > 0 ? `${signalCount.toLocaleString()} ids` : 'Organic'} tone={signalCount > 0 ? 'info' : 'neutral'} className="justify-center" />
      },
    },
  ]

  if (loading && campaigns.length === 0) {
    return <LoadingSpinner className="py-16" />
  }

  return (
    <div className="space-y-5">

      <AnalyticsPageHeader
        title="Campaigns"
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

      <div className="px-5 md:px-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Campaigns"
            value={campaigns.length.toString()}
          />
          <MetricCard
            label="Sessions"
            value={totals.totalSessions.toLocaleString()}
          />
          <MetricCard
            label="Conversions"
            value={totals.totalConversions.toLocaleString()}
          />
          <MetricCard
            label="Revenue"
            value={`$${totals.totalRevenue.toFixed(2)}`}
          />
        </div>

        <div className="mt-4">
          <SectionCard
            title="Campaign Breakdown"
            className="overflow-hidden px-0 py-0"
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
          >
            <DataTable columns={columns} data={campaigns} keyExtractor={(c) => `${c.campaign}-${c.source}-${c.medium}`} />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
