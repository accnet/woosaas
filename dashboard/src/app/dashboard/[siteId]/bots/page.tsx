'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { BotReportResponse } from '@/lib/types'

export default function BotsPage() {
  const siteId = useSiteId()

  const [report, setReport] = useState<BotReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.bots(siteId, from, to)
        setReport(res.data)
      } catch (err) {
        console.error('Failed to load bot report', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId, dateRange])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  const totalEvents = report?.total_events ?? 0
  const botEvents = report?.bot_events ?? 0
  const humanEvents = report?.human_events ?? 0
  const botPercentage = report?.bot_percentage ?? 0
  const topReason = report?.top_bot_reasons[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bot Detection</h1>
          <p className="text-gray-600">Review suspicious traffic before it pollutes your attribution and revenue metrics.</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as PresetDateRange)}
          className="rounded border px-3 py-2"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Total Events" value={totalEvents.toLocaleString()} />
        <Card title="Bot Events" value={botEvents.toLocaleString()} />
        <Card title="Human Events" value={humanEvents.toLocaleString()} />
        <Card
          title="Bot Share"
          value={`${botPercentage.toFixed(2)}%`}
          change={topReason ? `Top reason: ${formatReason(topReason.reason)}` : 'No bot signatures detected'}
          changeType={botPercentage > 5 ? 'negative' : 'neutral'}
        />
      </div>

      {totalEvents === 0 ? (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-bold">No bot data yet</h2>
          <p className="text-gray-600">Once tracking events arrive, this report will show flagged traffic patterns and the sessions behind them.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold">Top Bot Reasons</h2>
          {report && report.top_bot_reasons.length > 0 ? (
            <div className="space-y-4">
              {report.top_bot_reasons.map((reason) => {
                const percentage = botEvents > 0 ? (reason.count / botEvents) * 100 : 0
                return (
                  <div key={reason.reason}>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <span className="font-medium text-gray-900">{formatReason(reason.reason)}</span>
                      <span className="text-sm text-gray-600">
                        {reason.count.toLocaleString()} events
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-red-500"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600">No classified bot reasons in the selected range.</p>
          )}
        </section>

        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold">Top Bot Sources</h2>
          {report && report.top_bot_sources.length > 0 ? (
            <div className="space-y-3">
              {report.top_bot_sources.map((source) => (
                <div
                  key={source.source}
                  className="flex items-center justify-between rounded border border-gray-100 px-4 py-3"
                >
                  <span className="font-medium text-gray-900">{source.source}</span>
                  <span className="text-sm text-gray-600">{source.count.toLocaleString()} events</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No bot-heavy traffic sources found.</p>
          )}
        </section>
      </div>

      <section className="rounded-lg bg-white shadow">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-bold">Suspicious Sessions</h2>
          <p className="mt-1 text-sm text-gray-600">High-volume sessions with strong bot scores help you spot scraper patterns and noisy traffic quickly.</p>
        </div>

        {report && report.top_bot_sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Session</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">IP Hash</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Bot Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Events</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">User Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.top_bot_sessions.map((session) => (
                  <tr key={`${session.session_id}-${session.ip_hash}`}>
                    <td className="px-6 py-4 font-mono text-sm text-gray-900">{truncateMiddle(session.session_id, 18)}</td>
                    <td className="px-6 py-4 font-mono text-sm text-gray-600">{truncateMiddle(session.ip_hash, 16)}</td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        {session.bot_score}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{session.event_count.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{session.user_agent || 'Unknown user agent'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-gray-600">No suspicious sessions detected in the selected range.</div>
        )}
      </section>
    </div>
  )
}

function formatReason(reason: string) {
  return reason.replace(/_/g, ' ')
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  const sideLength = Math.max(4, Math.floor((maxLength - 3) / 2))
  return `${value.slice(0, sideLength)}...${value.slice(-sideLength)}`
}
