'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, RefreshCw, ShieldCheck, UserRound, Workflow } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell } from '@/components/ui/table-primitives'
import { useSiteId } from '@/hooks/use-site-id'
import axios from 'axios'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { BotReportResponse } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

export default function BotsPage() {
  const siteId = useSiteId()
  const [bots, setBots] = useState<BotReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (!bots) setLoading(true)
      else setRefreshing(true)

      setError(null)

      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.bots(siteId, from, to, { signal: controller.signal })
        setBots(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        setError(getApiErrorMessage(err, 'Bot analytics could not be loaded right now.'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()
    return () => controller.abort()
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
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Bot Traffic"
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

      <AnalyticsPageContent>
        {summary.botShare > 20 && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.03] backdrop-blur-sm px-5 py-3.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <div>
              <p className="text-sm font-bold text-rose-900 leading-normal">
                High Bot Activity Detected: <span className="tabular-nums">{summary.botShare.toFixed(1)}%</span> of events flagged as suspicious
              </p>
              <p className="text-xs text-rose-700/80 leading-normal mt-0.5">
                This is above the safe threshold. Consider reviewing your traffic sources and implementing stricter bot filtering rules.
              </p>
            </div>
          </div>
        )}

        {error ? (
          <InlineErrorState
            body={error}
            compact={Boolean(bots)}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <MetricGrid mobileCols={1}>
        <MetricCard icon={<Workflow className="h-4 w-4" />} label="Total Events" value={summary.totalEvents.toLocaleString()} />
        <MetricCard icon={<Bot className="h-4 w-4" />} label="Bot Events" value={summary.botEvents.toLocaleString()} helper="Flagged by scoring rules" tone="warn" />
        <MetricCard icon={<UserRound className="h-4 w-4" />} label="Human Events" value={summary.humanEvents.toLocaleString()} helper="Treated as likely genuine traffic" tone="good" />
        <MetricCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Rule Coverage"
          value={summary.coverage.toString()}
          helper={summary.topReason ? `Lead reason: ${summary.topReason.reason}` : 'No suspicious reasons yet'}
        />
        </MetricGrid>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Traffic Split">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-full bg-slate-100 border border-slate-200/20 h-3">
              <div className="flex h-full w-full">
                <div className="bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.2)]" style={{ width: `${summary.botShare}%` }} />
                <div className="bg-gradient-to-r from-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.2)]" style={{ width: `${100 - summary.botShare}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] backdrop-blur-sm p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-800">Bot Report</div>
                <p className="mt-2 text-sm text-amber-900 font-medium leading-relaxed">
                  <span className="tabular-nums font-bold text-amber-700">{summary.botShare.toFixed(1)}%</span> of scored events were flagged as suspicious in the selected period.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] backdrop-blur-sm p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">Likely Human Traffic</div>
                <p className="mt-2 text-sm text-emerald-900 font-medium leading-relaxed">
                  <span className="tabular-nums font-bold text-emerald-700">{(100 - summary.botShare).toFixed(1)}%</span> of events remained in standard analytics views.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Suspicious Reasons"
          action={<StatusChip label={`${bots?.top_bot_reasons.length ?? 0} reasons`} tone="warn" />}
        >
          {bots?.top_bot_reasons && bots.top_bot_reasons.length > 0 ? (
            <div className="space-y-4">
              {bots.top_bot_reasons.map((reason) => (
                <div key={reason.reason} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-app-strong">{reason.reason}</span>
                    <span className="text-sm font-bold tabular-nums text-app-strong">{reason.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 border border-slate-200/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_6px_rgba(245,158,11,0.2)] transition-all duration-500"
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

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Source Coverage"
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
          action={<StatusChip label={`${bots?.top_bot_sessions.length ?? 0} sessions`} tone="warn" />}
          className="overflow-hidden px-0 py-0"
        >
          {bots?.top_bot_sessions && bots.top_bot_sessions.length > 0 ? (
            <table className="min-w-full">
              <thead className="table-header">
                <tr>
                  <TableHeaderCell className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">Session</TableHeaderCell>
                  <TableHeaderCell className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">Fingerprint</TableHeaderCell>
                  <TableHeaderCell align="right" className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">Events</TableHeaderCell>
                  <TableHeaderCell align="right" className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">Bot Score</TableHeaderCell>
                </tr>
              </thead>
              <tbody className="table-body">
                {bots.top_bot_sessions.map((session) => (
                  <tr key={`${session.session_id}-${session.ip_hash}`} className="table-row border-l-2 border-l-transparent hover:border-l-indigo-500 hover:bg-indigo-500/[0.01] transition-all duration-150">
                    <td className="table-cell">
                      <div className="font-mono text-xs font-semibold text-app-strong truncate max-w-[200px]" title={session.session_id || ''}>
                        {session.session_id || 'Unknown session'}
                      </div>
                      <div className="mt-1 text-[11px] text-app-muted truncate max-w-[320px]" title={session.user_agent || ''}>
                        {session.user_agent || 'No user agent'}
                      </div>
                    </td>
                    <td className="table-cell font-mono text-xs text-app-muted">{session.ip_hash || '-'}</td>
                    <td className="table-cell text-right font-semibold tabular-nums text-sm text-app-strong">{session.event_count.toLocaleString()}</td>
                    <td className="table-cell text-right">
                      <StatusChip label={session.bot_score.toString()} tone={session.bot_score >= 90 ? 'danger' : 'warn'} className="justify-end font-mono tabular-nums" />
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
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
