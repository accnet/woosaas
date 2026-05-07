'use client'

import { useEffect, useState } from 'react'
import { Activity, Clock3, Radio, RefreshCw } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { statsApi } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { RealtimeEvent, RealtimeStats } from '@/lib/types'

export default function RealtimePage() {
  const siteId = useSiteId()
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null)
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [realtimeRes, eventsRes] = await Promise.all([
          statsApi.realtime(siteId),
          statsApi.realtimeEvents(siteId),
        ])
        setRealtime(realtimeRes.data)
        setEvents(eventsRes.data)
      } catch (err) {
        console.error('Failed to load realtime data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()

    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Realtime Activity</h2>
          <p className="mt-2 text-sm text-app-muted">
            Short-window activity feed and live user count, refreshed every 15 seconds.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-app-line bg-white px-3 py-2 text-sm text-app-muted shadow-card">
          <RefreshCw className="h-4 w-4" />
          Auto refresh
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<Radio className="h-4 w-4" />}
          label="Online Users"
          value={(realtime?.online_users ?? 0).toString()}
          helper="Unique users seen in the active window"
          live
        />
        <MetricCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Time Window"
          value={`${realtime?.minutes ?? 5} min`}
          helper="Sliding period used for realtime aggregation"
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Recent Events"
          value={events.length.toString()}
          helper="Latest event rows visible in the live feed"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="panel-header border-b border-slate-100 px-6 py-4">

          <div>
            <h3 className="text-base font-semibold text-app-strong">Live Feed</h3>
            <p className="mt-1 text-sm text-app-muted">Newest events across the last 30 minutes.</p>
          </div>
        </div>
        {events.length > 0 ? (
          <div className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto">
            {events.map((event, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3 text-sm">
                <div className="relative h-2.5 w-2.5 shrink-0">
                  <div className="absolute inset-0 rounded-full bg-emerald-400" />
                </div>
                <span className="w-28 shrink-0 font-medium text-app-muted">{event.event_name}</span>
                <span className="flex-1 truncate text-app-strong">{event.path || '-'}</span>
                {event.revenue > 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    ${event.revenue.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Clock3 className="h-12 w-12" />} body="No recent events" />
        )}
      </div>
    </div>
  )
}
