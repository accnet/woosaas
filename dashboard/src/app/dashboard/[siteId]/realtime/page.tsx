'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Clock3,
  PauseCircle,
  Radio,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { statsApi, getApiErrorMessage } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { RealtimeEvent, RealtimeStats } from '@/lib/types'

const WINDOW_OPTIONS = [5, 15, 30]

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function RealtimePage() {
  const siteId = useSiteId()
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null)
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [minutes, setMinutes] = useState(15)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [query, setQuery] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!realtime && events.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const [realtimeRes, eventsRes] = await Promise.all([
          statsApi.realtime(siteId, minutes),
          statsApi.realtimeEvents(siteId, minutes, 50),
        ])

        if (!cancelled) {
          setRealtime(realtimeRes.data)
          setEvents(eventsRes.data)
          setLastUpdatedAt(new Date().toISOString())
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Realtime activity could not be loaded right now.'))
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
  }, [minutes, refreshKey, siteId])

  useEffect(() => {
    if (!autoRefresh) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setRefreshKey((value) => value + 1)
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [autoRefresh])

  const eventOptions = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.event_name))).sort()
  }, [events])

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return events.filter((event) => {
      const matchesEvent = eventFilter === 'all' || event.event_name === eventFilter
      const matchesQuery =
        !normalizedQuery ||
        event.path.toLowerCase().includes(normalizedQuery) ||
        event.event_name.toLowerCase().includes(normalizedQuery) ||
        event.source.toLowerCase().includes(normalizedQuery) ||
        event.medium.toLowerCase().includes(normalizedQuery)

      return matchesEvent && matchesQuery
    })
  }, [eventFilter, events, query])

  const stats = useMemo(() => {
    const uniqueSessions = new Set(filteredEvents.map((event) => event.session_id)).size
    const purchaseEvents = filteredEvents.filter((event) => event.event_name === 'purchase').length
    const activeSources = filteredEvents.reduce<Record<string, number>>((accumulator, event) => {
      const key = event.source || '(direct)'
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    }, {})

    return {
      uniqueSessions,
      purchaseEvents,
      sources: Object.entries(activeSources)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5),
    }
  }, [filteredEvents])

  const liveStatus = refreshing ? 'refreshing' : autoRefresh ? 'live' : 'paused'

  if (loading && !realtime && events.length === 0) {
    return <LoadingSpinner className="py-16" />
  }

  return (
    <div className="space-y-4">

      <AnalyticsPageHeader
        title="Realtime Activity"
        controls={
          <StatusChip
            label={liveStatus === 'refreshing' ? 'Refreshing' : liveStatus === 'live' ? 'Live' : 'Paused'}
            tone={liveStatus === 'live' ? 'good' : liveStatus === 'refreshing' ? 'info' : 'warn'}
            icon={liveStatus === 'paused' ? <PauseCircle className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
          />
        }
      />

      {error ? (
        <InlineErrorState
          body={error}
          compact={Boolean(realtime) || events.length > 0}
          onRetry={() => setRefreshKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard
          icon={<Radio className="h-4 w-4" />}
          label="Online Users"
          value={(realtime?.online_users ?? 0).toString()}
          helper="Unique users seen in the current window"
          live={liveStatus === 'live'}
        />
        <MetricCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Time Window"
          value={`${realtime?.minutes ?? minutes} min`}
          helper="Sliding period for the realtime summary"
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Visible Events"
          value={filteredEvents.length.toString()}
          helper={`${stats.uniqueSessions.toLocaleString()} active sessions in the filtered feed`}
        />
        <MetricCard
          icon={<Zap className="h-4 w-4" />}
          label="Purchase Events"
          value={stats.purchaseEvents.toString()}
          helper={lastUpdatedAt ? `Last updated at ${formatTimestamp(lastUpdatedAt)}` : 'Awaiting first refresh'}
        />
      </div>

      <div className="sticky top-4 z-10 rounded-lg border border-app-line bg-white px-4 py-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              label={liveStatus === 'refreshing' ? 'Refreshing now' : liveStatus === 'live' ? 'Auto refresh every 15s' : 'Auto refresh paused'}
              tone={liveStatus === 'live' ? 'good' : liveStatus === 'refreshing' ? 'info' : 'warn'}
            />
            <span className="text-sm text-app-muted">
              Keep the feed live while adjusting window length and event filters.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="select min-w-[150px]"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              {WINDOW_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  Last {value} minutes
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setAutoRefresh((value) => !value)}
            >
              {autoRefresh ? <PauseCircle className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
              {autoRefresh ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.85fr]">
        <SectionCard
          title="Live Feed"
          action={<StatusChip label={`${filteredEvents.length} rows`} tone="neutral" />}
          className="overflow-hidden px-0 py-0"
        >
          {filteredEvents.length > 0 ? (
            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {filteredEvents.map((event, index) => (
                <div key={`${event.session_id}-${event.event_time}-${index}`} className="px-6 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip label={event.event_name} tone="info" />
                        <span className="text-xs text-app-muted">{formatTimestamp(event.event_time)}</span>
                        {event.revenue > 0 ? (
                          <StatusChip label={`$${event.revenue.toFixed(2)}`} tone="good" />
                        ) : null}
                      </div>
                      <div className="mt-2 truncate text-sm font-medium text-app-strong">
                        {event.path || '-'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-app-muted">
                        <span>Source: {event.source || '(direct)'}</span>
                        <span>Medium: {event.medium || '(none)'}</span>
                        <span>Session: {event.session_id || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Clock3 className="h-12 w-12" />}
              title={events.length === 0 ? 'No recent events' : 'No events match the current filters'}
              body={
                events.length === 0
                  ? 'Realtime activity will appear here as new events arrive for this site.'
                  : 'Adjust the search query or event filter to widen the live feed again.'
              }
            />
          )}
        </SectionCard>

        <SectionCard title="Filters">
          <div className="space-y-4">
            <SearchInput value={query} onChange={setQuery} placeholder="Search path, source, or event" />

            <div>
              <label className="mb-2 block text-sm font-medium text-app-strong">Event type</label>
              <select
                className="select w-full"
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value)}
              >
                <option value="all">All events</option>
                {eventOptions.map((eventName) => (
                  <option key={eventName} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm font-medium text-app-strong">Active sources</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.sources.length > 0 ? (
                  stats.sources.map(([source, count]) => (
                    <StatusChip key={source} label={`${source} (${count})`} tone="neutral" />
                  ))
                ) : (
                  <p className="text-sm text-app-muted">Source activity will appear once events are flowing.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-app-line bg-app-panel p-4">
              <div className="text-sm font-semibold text-app-strong">Current mode</div>
              <p className="mt-2 text-sm text-app-muted">
                {liveStatus === 'live'
                  ? 'The page is automatically polling every 15 seconds.'
                  : liveStatus === 'refreshing'
                    ? 'A refresh is currently in flight.'
                    : 'Auto refresh is paused until you resume it or trigger a manual refresh.'}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
