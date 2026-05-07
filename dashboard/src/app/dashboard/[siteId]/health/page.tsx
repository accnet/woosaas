'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, HeartPulse, ListChecks, RadioTower, ShieldCheck, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { DetailRow } from '@/components/ui/detail-row'
import { DetailNote } from '@/components/ui/detail-note'
import { statsApi } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { PipelineHealth } from '@/lib/types'

export default function HealthPage() {
  const siteId = useSiteId()
  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const res = await statsApi.health(siteId)
        setHealth(res.data)
      } catch (err) {
        console.error('Failed to load health data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const isHealthy = health?.status === 'healthy'

  const healthItems: Array<{
    label: string
    value: string
    status: 'success' | 'warning' | 'danger' | 'neutral'
  }> = [
    {
      label: 'Pipeline Status',
      value: health?.status || 'Unknown',
      status: health?.status === 'healthy' ? 'success' : health?.status === 'degraded' ? 'warning' : 'danger' as const,
    },
    {
      label: 'Stream',
      value: health?.stream || '-',
      status: 'neutral' as const,
    },
    {
      label: 'Consumer Group',
      value: health?.consumer_group || '-',
      status: 'neutral' as const,
    },
    {
      label: 'Consumers',
      value: health?.consumer_count?.toString() || '0',
      status: (health?.consumer_count ?? 0) > 0 ? 'success' as const : 'warning' as const,
    },
  ]

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Pipeline Health</h2>
          <p className="mt-2 text-sm text-app-muted">
            Queue, consumer, and freshness signals for ingestion and processing reliability.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {healthItems.map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            icon={<div className="h-2.5 w-2.5 rounded-full bg-current" />}
            tone={item.status === 'success' ? 'good' : item.status === 'warning' || item.status === 'danger' ? 'warn' : 'neutral'}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <SectionCard title="Operational Detail" description="Current state of the Redis stream and worker group." icon={<ListChecks className="h-4 w-4" />}>
          <div className="space-y-4">
            <DetailRow label="Status" value={isHealthy ? 'Healthy' : 'Degraded'} tone={isHealthy ? 'good' : 'warn'} />
            <DetailRow label="Message" value={health?.message || '-'} />
            <DetailRow label="Stream Length" value={health?.stream_length?.toLocaleString() || '0'} />
            <DetailRow label="Queue Depth" value={health?.queue_depth?.toLocaleString() || '0'} />
            <DetailRow label="Pending" value={health?.pending?.toLocaleString() || '0'} />
            <DetailRow label="Lag" value={health?.lag?.toLocaleString() || '0'} />
            <DetailRow label="Dead Letter Length" value={health?.dead_letter_length?.toLocaleString() || '0'} />
            <DetailRow label="Last Processed" value={health?.last_processed_at ? new Date(health.last_processed_at).toLocaleString() : 'N/A'} />
            <DetailRow label="Last Checked" value={health?.checked_at ? new Date(health.checked_at).toLocaleString() : 'N/A'} />
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Quick Read" description="Fast interpretation of the current pipeline state." icon={<HeartPulse className="h-4 w-4" />}>
            <div className="space-y-3">
              <DetailNote
                icon={isHealthy ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                title={isHealthy ? 'Processing is healthy' : 'Pipeline needs attention'}
                body={health?.message || 'No pipeline message available.'}
                tone={isHealthy ? 'good' : 'warn'}
              />
              <DetailNote
                icon={<RadioTower className="h-4 w-4" />}
                title="Queue depth"
                body={`Current queue depth is ${health?.queue_depth?.toLocaleString() || '0'} with pending count ${health?.pending?.toLocaleString() || '0'}.`}
              />
              <DetailNote
                icon={<Users className="h-4 w-4" />}
                title="Consumers"
                body={`${health?.consumer_count?.toString() || '0'} active consumer(s) in group ${health?.consumer_group || '-'}.`}
              />
            </div>
          </SectionCard>

          {!isHealthy && (
            <div className="card border-amber-200 bg-amber-50 px-6 py-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-800">Pipeline Degraded</h3>
                  <p className="mt-1 text-sm text-amber-700">
                    {health?.message || 'There may be issues with data processing.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
