'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  DatabaseZap,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { DetailRow } from '@/components/ui/detail-row'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { StatusChip } from '@/components/ui/status-chip'
import { statsApi, getApiErrorMessage } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { PipelineHealth } from '@/lib/types'

type Tone = 'neutral' | 'good' | 'warn' | 'danger'

function formatDateTime(value: string | null) {
  if (!value) {
    return 'N/A'
  }
  return new Date(value).toLocaleString()
}

function formatAge(seconds: number) {
  if (seconds <= 0) {
    return 'Just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m ago`
  }
  return `${Math.round(seconds / 3600)}h ago`
}

function toneFromStatus(status: PipelineHealth['status']): Tone {
  switch (status) {
    case 'healthy':
      return 'good'
    case 'degraded':
      return 'danger'
    case 'waiting':
    case 'idle':
      return 'warn'
    default:
      return 'neutral'
  }
}

function detailToneToRowTone(tone: Tone): 'neutral' | 'good' | 'warn' {
  if (tone === 'good') {
    return 'good'
  }
  if (tone === 'warn' || tone === 'danger') {
    return 'warn'
  }
  return 'neutral'
}

export default function HealthPage() {
  const siteId = useSiteId()
  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (!health) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const res = await statsApi.health(siteId, { signal: controller.signal })
        setHealth(res.data)
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getApiErrorMessage(err, 'Pipeline health could not be loaded right now.'))
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()

    return () => controller.abort()
  }, [reloadKey, siteId])

  const groups = useMemo(() => {
    if (!health) {
      return []
    }

    const collectionTone: Tone =
      !health.last_processed_at || health.last_processed_age_seconds > 900 ? 'warn' : 'good'
    const processingTone: Tone =
      health.consumer_count === 0 && health.stream_length > 0
        ? 'danger'
        : health.queue_depth > 1000
          ? 'warn'
          : 'good'
    const deliveryTone: Tone = health.dead_letter_length > 0 ? 'danger' : 'good'
    const verificationTone = toneFromStatus(health.status)

    return [
      {
        title: 'Collection',
        description: 'Event intake freshness and stream readiness.',
        tone: collectionTone,
        icon: <DatabaseZap className="h-4.5 w-4.5" />,
        summary: health.last_processed_at
          ? `Last processed ${formatAge(health.last_processed_age_seconds)}`
          : 'No processed events yet',
        checks: [
          {
            label: 'Input stream',
            value: <span className="font-mono text-xs text-app-strong">{health.stream}</span>,
            tone: 'neutral' as const,
          },
          {
            label: 'Stream length',
            value: <span className="font-mono text-xs tabular-nums font-semibold">{health.stream_length.toLocaleString()}</span>,
            tone: 'neutral' as const,
          },
          {
            label: 'Last processed age',
            value: (
              <span className="font-mono text-xs tabular-nums font-semibold">
                {health.last_processed_at ? formatAge(health.last_processed_age_seconds) : 'N/A'}
              </span>
            ),
            tone: detailToneToRowTone(collectionTone),
          },
        ],
      },
      {
        title: 'Processing',
        description: 'Workers, backlog, and queue pressure.',
        tone: processingTone,
        icon: <Users className="h-4.5 w-4.5" />,
        summary: `${health.consumer_count.toLocaleString()} consumers with ${health.queue_depth.toLocaleString()} queued items`,
        checks: [
          {
            label: 'Consumer group',
            value: <span className="font-mono text-xs text-app-strong">{health.consumer_group}</span>,
            tone: 'neutral' as const,
          },
          {
            label: 'Consumers',
            value: <span className="font-mono text-xs tabular-nums font-semibold">{health.consumer_count.toLocaleString()}</span>,
            tone: detailToneToRowTone(processingTone),
          },
          {
            label: 'Pending / Lag',
            value: (
              <span className="font-mono text-xs tabular-nums font-semibold">
                {health.pending.toLocaleString()} / {health.lag.toLocaleString()}
              </span>
            ),
            tone: detailToneToRowTone(processingTone),
          },
        ],
      },
      {
        title: 'Delivery',
        description: 'Downstream delivery quality and dead-letter risk.',
        tone: deliveryTone,
        icon: <PackageCheck className="h-4.5 w-4.5" />,
        summary:
          health.dead_letter_length > 0
            ? `${health.dead_letter_length.toLocaleString()} dead-letter events need review`
            : 'No dead-letter backlog detected',
        checks: [
          {
            label: 'Dead stream',
            value: <span className="font-mono text-xs text-app-strong">{health.dead_stream}</span>,
            tone: 'neutral' as const,
          },
          {
            label: 'Dead-letter length',
            value: (
              <span className={`font-mono text-xs tabular-nums font-semibold ${health.dead_letter_length > 0 ? 'text-rose-600' : ''}`}>
                {health.dead_letter_length.toLocaleString()}
              </span>
            ),
            tone: detailToneToRowTone(deliveryTone),
          },
          {
            label: 'Last delivered ID',
            value: (
              <span className="font-mono text-[11px] font-medium text-app-muted truncate max-w-[130px] inline-block" title={health.last_delivered_id || ''}>
                {health.last_delivered_id || 'N/A'}
              </span>
            ),
            tone: 'neutral' as const,
          },
        ],
      },
      {
        title: 'Verification',
        description: 'Operator-facing interpretation of current state.',
        tone: verificationTone,
        icon: <ShieldCheck className="h-4.5 w-4.5" />,
        summary: health.message,
        checks: [
          {
            label: 'Pipeline status',
            value: <span className="font-mono text-xs uppercase font-bold">{health.status}</span>,
            tone: detailToneToRowTone(verificationTone),
          },
          {
            label: 'Last processed at',
            value: <span className="font-mono text-xs tabular-nums font-medium">{formatDateTime(health.last_processed_at)}</span>,
            tone: 'neutral' as const,
          },
          {
            label: 'Last checked at',
            value: <span className="font-mono text-xs tabular-nums font-medium">{formatDateTime(health.checked_at)}</span>,
            tone: 'neutral' as const,
          },
        ],
      },
    ]
  }, [health])

  if (loading && !health) {
    return <LoadingSpinner className="py-16" />
  }

  if (!health) {
    return (
      <InlineErrorState
        body={error || 'No health data is available for this site yet.'}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  const overallTone = toneFromStatus(health.status)

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Pipeline Health"
        controls={
          <div className="flex items-center gap-2">
            <StatusChip label={health.status} tone={overallTone} />
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
      />

      <AnalyticsPageContent>
        {error ? (
          <InlineErrorState
            body={error}
            compact
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title} className="card-glass border-slate-200/50 hover:border-indigo-500/20 shadow-sm hover:shadow-md transition-all duration-200 px-5 py-4 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150 ${
                    group.tone === 'good' ? 'bg-emerald-500/10 text-emerald-600' :
                    group.tone === 'warn' ? 'bg-amber-500/10 text-amber-600' :
                    group.tone === 'danger' ? 'bg-rose-500/10 text-rose-600 animate-pulse' :
                    'bg-slate-500/10 text-slate-600'
                  }`}>
                    {group.icon}
                  </div>
                  <div className="text-sm font-semibold text-app-strong">{group.title}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      group.tone === 'good' ? 'bg-emerald-400' :
                      group.tone === 'warn' ? 'bg-amber-400' :
                      group.tone === 'danger' ? 'bg-rose-400' :
                      'bg-slate-400'
                    }`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      group.tone === 'good' ? 'bg-emerald-500' :
                      group.tone === 'warn' ? 'bg-amber-500' :
                      group.tone === 'danger' ? 'bg-rose-500' :
                      'bg-slate-500'
                    }`}></span>
                  </span>
                  <StatusChip label={group.tone} tone={group.tone} />
                </div>
              </div>
              <p className="text-xs font-medium text-app-muted leading-relaxed mb-4">{group.summary}</p>
              <div className="space-y-1">
                {group.checks.map((check) => (
                  <DetailRow key={check.label} label={check.label} value={check.value} tone={check.tone} />
                ))}
              </div>
            </div>
          ))}
        </div>


      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
