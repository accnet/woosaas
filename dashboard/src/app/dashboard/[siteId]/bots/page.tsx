'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, RefreshCw, ShieldCheck, UserRound, Workflow } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell } from '@/components/ui/table-primitives'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { BotReportResponse } from '@/lib/types'

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export default function BotsPage() {
  const siteId = useSiteId()
  const [bots, setBots] = useState<BotReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!bots) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.bots(siteId, from, to)
        if (!cancelled) {
          setBots(res.data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Bot analytics could not be loaded right now.'))
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

  const summary = useMemo(() => {
    const totalEvents = bots?.total_events ?? 0
    const botEvents = bots?.bot_events ?? 0
    const humanEvents = bots?.human_events ?? 0
    const botShare = totalEvents > 0 ? (botEvents / totalEvents) * 100 : 0
    const coverage = bots?.top_bot_reasons?.length ?? 0
    const topReason = bots?.top_bot_reasons?.[0]

    return { totalEvents, botEvents, humanEvents, botShare, coverage, topReason }
  }, [bots])

  if (loading && !bots) {
    return <TableLoadingSkeleton rows={4} columns={4} />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Bot Traffic"
        description="Scored traffic, suspicious reasons, and rule coverage for this website compared against trusted human activity."
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <DateRangeSelect
              value={dateRange}
              onChange={(value) => setDateRange(value as PresetDateRange)}
              options={DATE_RANGE_OPTIONS}
            />
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </>
        }
      />

      {error ? (
        <InlineErrorState
          body={error}
          compact={Boolean(bots)}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Workflow className="h-4 w-4" />} label="Total Events" value={summary.totalEvents.toLocaleString()} />
        <MetricCard icon={<Bot className="h-4 w-4" />} label="Bot Events" value={summary.botEvents.toLocaleString()} helper="Flagged by scoring rules" tone="warn" />
        <MetricCard icon={<UserRound className="h-4 w-4" />} label="Human Events" value={summary.humanEvents.toLocaleString()} helper="Treated as likely genuine traffic" tone="good" />
        <MetricCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Rule Coverage"
          value={summary.coverage.toString()}
          helper={summary.topReason ? `Lead reason: ${summary.topReason.reason}` : 'No suspicious reasons yet'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Traffic Split"
          description="Visual distinction between suspicious bot traffic and likely human traffic."
        >
          <div className="space-y-5">
            <div className="overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-4 w-full">
                <div className="bg-amber-400" style={{ width: `${summary.botShare}%` }} />
                <div className="bg-emerald-400" style={{ width: `${100 - summary.botShare}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-800">Bot report</div>
                <p className="mt-2 text-sm text-amber-700">
                  {summary.botShare.toFixed(1)}% of scored events were flagged as suspicious in the selected period.
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-800">Likely human traffic</div>
                <p className="mt-2 text-sm text-emerald-700">
                  {(100 - summary.botShare).toFixed(1)}% of events remained in the human bucket and continue into standard analytics views.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Suspicious Reasons"
          description="The highest-volume reasons show which bot rules are firing most often."
          action={<StatusChip label={`${bots?.top_bot_reasons.length ?? 0} reasons`} tone="warn" />}
        >
          {bots?.top_bot_reasons && bots.top_bot_reasons.length > 0 ? (
            <div className="space-y-4">
              {bots.top_bot_reasons.map((reason) => (
                <div key={reason.reason} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-app-strong">{reason.reason}</span>
                    <span className="text-sm font-semibold text-app-strong">{reason.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${summary.botEvents > 0 ? (reason.count / summary.botEvents) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ShieldCheck className="h-12 w-12" />}
              title="No suspicious reasons"
              body="Bot rule reasons will appear here once suspicious sessions are detected."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Source Coverage"
          description="Suspicious traffic grouped by inbound source."
          action={<StatusChip label={`${bots?.top_bot_sources.length ?? 0} sources`} tone="neutral" />}
        >
          {bots?.top_bot_sources && bots.top_bot_sources.length > 0 ? (
            <div className="space-y-3">
              {bots.top_bot_sources.map((source) => (
                <div key={source.source} className="flex items-center justify-between rounded-lg border border-app-line bg-white px-4 py-3">
                  <span className="text-sm font-medium text-app-strong">{source.source || '(direct)'}</span>
                  <StatusChip label={source.count.toLocaleString()} tone="warn" />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState body="No bot source data is available for this range." />
          )}
        </SectionCard>

        <SectionCard
          title="Scored Sessions"
          description="Highest-scoring suspicious sessions with rule coverage and event volume."
          action={<StatusChip label={`${bots?.top_bot_sessions.length ?? 0} sessions`} tone="warn" />}
          className="overflow-hidden px-0 py-0"
        >
          {bots?.top_bot_sessions && bots.top_bot_sessions.length > 0 ? (
            <table className="min-w-full">
              <thead className="table-header">
                <tr>
                  <TableHeaderCell>Session</TableHeaderCell>
                  <TableHeaderCell>Fingerprint</TableHeaderCell>
                  <TableHeaderCell align="right">Events</TableHeaderCell>
                  <TableHeaderCell align="right">Bot Score</TableHeaderCell>
                </tr>
              </thead>
              <tbody className="table-body">
                {bots.top_bot_sessions.map((session) => (
                  <tr key={`${session.session_id}-${session.ip_hash}`} className="table-row">
                    <td className="table-cell">
                      <div className="font-medium text-app-strong">{session.session_id || 'Unknown session'}</div>
                      <div className="mt-1 text-xs text-app-muted">{session.user_agent || 'No user agent'}</div>
                    </td>
                    <td className="table-cell text-xs text-app-muted">{session.ip_hash || '-'}</td>
                    <td className="table-cell text-right">{session.event_count.toLocaleString()}</td>
                    <td className="table-cell text-right">
                      <StatusChip label={session.bot_score.toString()} tone={session.bot_score >= 90 ? 'danger' : 'warn'} className="justify-center" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={<Bot className="h-12 w-12" />}
              title="No suspicious sessions"
              body="High-confidence suspicious sessions will appear here when bot scoring is triggered."
            />
          )}
        </SectionCard>
      </div>
    </div>
  )
}
