'use client'

import { useEffect, useState } from 'react'
import { Bot, ShieldCheck, UserRound, Workflow } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { BotReportResponse } from '@/lib/types'

export default function BotsPage() {
  const siteId = useSiteId()
  const [bots, setBots] = useState<BotReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.bots(siteId, from, to)
        setBots(res.data)
      } catch (err) {
        console.error('Failed to load bot stats', err)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [dateRange, siteId])

  if (loading) return <LoadingSpinner className="py-16" />

  const botTraffic = bots?.bot_events ?? 0
  const totalTraffic = (bots?.bot_events ?? 0) + (bots?.human_events ?? 1)
  const botPercentage = totalTraffic > 0 ? ((botTraffic / totalTraffic) * 100).toFixed(2) : '0.00'

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Bot Traffic</h2>
          <p className="mt-2 text-sm text-app-muted">Detection volume, reasons, and likely automated traffic sources.</p>
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value as PresetDateRange)} className="select">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Workflow className="h-4 w-4" />} label="Total Events" value={bots?.total_events?.toLocaleString() ?? '0'} />
        <MetricCard icon={<Bot className="h-4 w-4" />} label="Bot Events" value={botTraffic.toLocaleString()} />
        <MetricCard icon={<UserRound className="h-4 w-4" />} label="Human Events" value={bots?.human_events?.toLocaleString() ?? '0'} />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Bot %" value={`${botPercentage}%`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card px-6 py-6">
          <h3 className="mb-5 text-base font-semibold text-app-strong">Top Bot Reasons</h3>
          {bots?.top_bot_reasons && bots.top_bot_reasons.length > 0 ? (
            <div className="space-y-4">
              {bots.top_bot_reasons.map((reason, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-app-strong">{reason.reason}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-36 overflow-hidden rounded-full bg-primary-100 sm:w-48">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${botTraffic > 0 ? (reason.count / botTraffic) * 100 : 0}%` }} />
                    </div>
                    <span className="w-20 text-right text-sm font-semibold text-app-strong">{reason.count.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState body="No bot data available" className="py-8" />}
        </div>

        <div className="card px-6 py-6">
          <h3 className="mb-5 text-base font-semibold text-app-strong">Top Bot Sources</h3>
          {bots?.top_bot_sources && bots.top_bot_sources.length > 0 ? (
            <div className="space-y-4">
              {bots.top_bot_sources.map((source, i) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
                  <span className="text-sm font-medium text-app-strong">{source.source}</span>
                  <span className="text-sm font-semibold text-app-strong">{source.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState body="No bot source data" className="py-8" />}
        </div>
      </div>
    </div>
  )
}
