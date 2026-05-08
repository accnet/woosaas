'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  AlertTriangle,
  ArrowRight,
  DatabaseZap,
  HeartPulse,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { DetailRow } from '@/components/ui/detail-row'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
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
        icon: <DatabaseZap className="h-4 w-4" />,
        summary: health.last_processed_at
          ? `Last processed ${formatAge(health.last_processed_age_seconds)}`
          : 'No processed events yet',
        checks: [
          { label: 'Input stream', value: health.stream, tone: 'neutral' as const },
          { label: 'Stream length', value: health.stream_length.toLocaleString(), tone: 'neutral' as const },
          {
            label: 'Last processed age',
            value: health.last_processed_at ? formatAge(health.last_processed_age_seconds) : 'N/A',
            tone: detailToneToRowTone(collectionTone),
          },
        ],
      },
      {
        title: 'Processing',
        description: 'Workers, backlog, and queue pressure.',
        tone: processingTone,
        icon: <Users className="h-4 w-4" />,
        summary: `${health.consumer_count.toLocaleString()} consumers with ${health.queue_depth.toLocaleString()} queued items`,
        checks: [
          {
            label: 'Consumer group',
            value: health.consumer_group,
            tone: 'neutral' as const,
          },
          {
            label: 'Consumers',
            value: health.consumer_count.toLocaleString(),
            tone: detailToneToRowTone(processingTone),
          },
          {
            label: 'Pending / Lag',
            value: `${health.pending.toLocaleString()} / ${health.lag.toLocaleString()}`,
            tone: detailToneToRowTone(processingTone),
          },
        ],
      },
      {
        title: 'Delivery',
        description: 'Downstream delivery quality and dead-letter risk.',
        tone: deliveryTone,
        icon: <PackageCheck className="h-4 w-4" />,
        summary:
          health.dead_letter_length > 0
            ? `${health.dead_letter_length.toLocaleString()} dead-letter events need review`
            : 'No dead-letter backlog detected',
        checks: [
          {
            label: 'Dead stream',
            value: health.dead_stream,
            tone: 'neutral' as const,
          },
          {
            label: 'Dead-letter length',
            value: health.dead_letter_length.toLocaleString(),
            tone: detailToneToRowTone(deliveryTone),
          },
          {
            label: 'Last delivered ID',
            value: health.last_delivered_id || 'N/A',
            tone: 'neutral' as const,
          },
        ],
      },
      {
        title: 'Verification',
        description: 'Operator-facing interpretation of current state.',
        tone: verificationTone,
        icon: <ShieldCheck className="h-4 w-4" />,
        summary: health.message,
        checks: [
          {
            label: 'Pipeline status',
            value: health.status,
            tone: detailToneToRowTone(verificationTone),
          },
          {
            label: 'Last processed at',
            value: formatDateTime(health.last_processed_at),
            tone: 'neutral' as const,
          },
          {
            label: 'Last checked at',
            value: formatDateTime(health.checked_at),
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
  const needsAttention = health.status !== 'healthy'

  return (
    <div className="space-y-8">
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

      {error ? (
        <InlineErrorState
          body={error}
          compact
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {groups.map((group) => (
          <div key={group.title} className="card px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-app-subtle text-app-strong">
                  {group.icon}
                </div>
                <div className="text-sm font-semibold text-app-strong">{group.title}</div>
              </div>
              <StatusChip label={group.tone} tone={group.tone} />
            </div>
            <p className="text-xs text-app-muted mb-4">{group.summary}</p>
            <div className="space-y-2">
              {group.checks.map((check) => (
                <DetailRow key={check.label} label={check.label} value={check.value} tone={check.tone} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {needsAttention ? (
        <SectionCard
          title="Needs Attention"
          icon={<AlertTriangle className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <HeartPulse className="h-4 w-4" />
                Current state
              </div>
              <p className="mt-2 text-sm text-amber-700">{health.message}</p>
            </div>

            <Link
              href={`/dashboard/${siteId}/realtime`}
              className="rounded-lg border border-app-line bg-white p-4 transition hover:border-slate-300"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-app-strong">Inspect live traffic</div>
                <ArrowRight className="h-4 w-4 text-app-muted" />
              </div>
              <p className="mt-2 text-sm text-app-muted">
                Check whether new human events are still arriving in realtime.
              </p>
            </Link>

            <Link
              href={`/dashboard/sites/${siteId}/onboarding`}
              className="rounded-lg border border-app-line bg-white p-4 transition hover:border-slate-300"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-app-strong">Review setup</div>
                <ArrowRight className="h-4 w-4 text-app-muted" />
              </div>
              <p className="mt-2 text-sm text-app-muted">
                Re-check tracking prerequisites, plugin setup, and site-level collection steps.
              </p>
            </Link>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}
