'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  KeyRound,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { APIKey, Site } from '@/lib/types'

type StepState = 'complete' | 'current' | 'blocked'

function StepBadge({ state }: { state: StepState }) {
  if (state === 'complete') {
    return <StatusChip label="Complete" tone="good" />
  }
  if (state === 'current') {
    return <StatusChip label="Next" tone="info" />
  }
  return <StatusChip label="Blocked" tone="warn" />
}

export default function OnboardingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [site, setSite] = useState<Site | null>(null)
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!site) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const [siteRes, keyRes] = await Promise.all([sitesApi.get(siteId), sitesApi.getApiKeys(siteId)])
        if (!cancelled) {
          setSite(siteRes.data)
          setApiKeys(keyRes.data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Onboarding data could not be loaded right now.'))
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
  }, [reloadKey, siteId])

  const stepModel = useMemo(() => {
    if (!site) {
      return { steps: [], progress: 0, nextStep: null as null | { title: string; detail: string } }
    }

    const trackingState = getSiteTrackingState(site)
    const hasKey = apiKeys.length > 0
    const isVerified = trackingState.label === 'Verified' || trackingState.label === 'Active'
    const isActive = trackingState.label === 'Active'

    const steps = [
      {
        title: 'Generate API key',
        description: 'Issue a credential that the WooCommerce plugin can use.',
        state: hasKey ? 'complete' : 'current',
        href: `/dashboard/sites/${siteId}/api-keys`,
        cta: hasKey ? 'Manage keys' : 'Generate key',
      },
      {
        title: 'Install plugin',
        description: 'Place the Woosaas plugin in WordPress and activate it.',
        state: isVerified ? 'complete' : hasKey ? 'current' : 'blocked',
        href: `/dashboard/sites/${siteId}/api-keys`,
        cta: 'Use issued key',
      },
      {
        title: 'Configure plugin',
        description: 'Enter the issued key and site domain in WooCommerce settings.',
        state: isVerified ? 'complete' : hasKey ? 'current' : 'blocked',
        href: `/dashboard/sites/${siteId}/api-keys`,
        cta: 'Review key and domain',
      },
      {
        title: 'Verify live collection',
        description: 'Use Health and Realtime to confirm the first events are flowing.',
        state: isActive ? 'complete' : isVerified ? 'current' : 'blocked',
        href: `/dashboard/${siteId}/health`,
        cta: 'Open health checks',
      },
    ] as Array<{
      title: string
      description: string
      state: StepState
      href: string
      cta: string
    }>

    const progress = steps.filter((step) => step.state === 'complete').length
    const nextStep = steps.find((step) => step.state === 'current') ?? null

    return {
      steps,
      progress,
      nextStep:
        nextStep && site
          ? {
              title: nextStep.title,
              detail: nextStep.description,
            }
          : null,
    }
  }, [apiKeys, site, siteId])

  if (loading && !site) {
    return <SectionCard title="Loading setup" description="Preparing onboarding context..." children={<div className="py-12" />} />
  }

  if (!site) {
    return <div className="card"><EmptyState body={error || 'Site not found'} /></div>
  }

  const trackingState = getSiteTrackingState(site)
  const primaryKey = apiKeys[0]

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Setup Guide"
        description={`Bring ${site.name} online with a clear checklist, progress readout, and next blocking step.`}
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <TrackingStatusChip site={site} />
            <button type="button" className="btn-secondary gap-2" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </>
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
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Progress" value={`${stepModel.progress}/${stepModel.steps.length}`} helper="Completed onboarding steps" />
        <MetricCard icon={<KeyRound className="h-4 w-4" />} label="API Keys" value={apiKeys.length.toString()} helper={primaryKey ? `${primaryKey.key_prefix}...` : 'No credential issued yet'} />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Tracking State" value={trackingState.label} helper={trackingState.detail} valueClassName="text-2xl" />
        <MetricCard icon={<Settings2 className="h-4 w-4" />} label="Next Blocker" value={stepModel.nextStep?.title || 'All steps complete'} helper={stepModel.nextStep?.detail || 'The site is fully active.'} valueClassName="truncate text-2xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <SectionCard title="Checklist" description="A clearer stepper-style flow with blocking state and direct calls to action.">
          <div className="space-y-5">
            {stepModel.steps.map((step, index) => (
              <div key={step.title} className="rounded-lg border border-app-line bg-white px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-app-subtle text-sm font-semibold text-app-strong">
                        {index + 1}
                      </div>
                      <div className="text-sm font-semibold text-app-strong">{step.title}</div>
                    </div>
                    <p className="mt-3 text-sm text-app-muted">{step.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StepBadge state={step.state} />
                    <Link href={step.href} className="btn-secondary px-3 py-2 text-sm">
                      {step.cta}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Next Blocking Step" description="The single next action to unblock progress.">
            {stepModel.nextStep ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
                <div className="text-sm font-semibold text-blue-800">{stepModel.nextStep.title}</div>
                <p className="mt-2 text-sm text-blue-700">{stepModel.nextStep.detail}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
                <div className="text-sm font-semibold text-emerald-800">Setup complete</div>
                <p className="mt-2 text-sm text-emerald-700">
                  This site is already streaming live events. Use Realtime and Health for ongoing verification.
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Operator Notes" description="Current setup context for this site.">
            <div className="space-y-4">
              <div className="rounded-lg border border-app-line bg-app-panel px-4 py-4">
                <div className="text-sm font-semibold text-app-strong">Target domain</div>
                <p className="mt-2 text-sm text-app-muted">{site.domain}</p>
              </div>
              <div className="rounded-lg border border-app-line bg-app-panel px-4 py-4">
                <div className="text-sm font-semibold text-app-strong">Key status</div>
                <p className="mt-2 text-sm text-app-muted">
                  {primaryKey
                    ? `First available key prefix: ${primaryKey.key_prefix}...`
                    : 'No API key has been issued yet.'}
                </p>
              </div>
              <div className="rounded-lg border border-app-line bg-app-panel px-4 py-4">
                <div className="text-sm font-semibold text-app-strong">Verification route</div>
                <p className="mt-2 text-sm text-app-muted">
                  Start with Health, then cross-check Realtime once the plugin is active.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Quick Links" description="Jump directly into the next operational screens.">
            <div className="space-y-3">
              <Link href={`/dashboard/sites/${siteId}/api-keys`} className="flex items-center justify-between rounded-lg border border-app-line bg-white px-4 py-3 text-sm font-medium text-app-strong transition hover:border-slate-300">
                Manage API keys
                <ArrowRight className="h-4 w-4 text-app-muted" />
              </Link>
              <Link href={`/dashboard/${siteId}/health`} className="flex items-center justify-between rounded-lg border border-app-line bg-white px-4 py-3 text-sm font-medium text-app-strong transition hover:border-slate-300">
                Open health checks
                <ArrowRight className="h-4 w-4 text-app-muted" />
              </Link>
              <Link href={`/dashboard/${siteId}/realtime`} className="flex items-center justify-between rounded-lg border border-app-line bg-white px-4 py-3 text-sm font-medium text-app-strong transition hover:border-slate-300">
                Open realtime
                <ArrowRight className="h-4 w-4 text-app-muted" />
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
