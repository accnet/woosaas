'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, CircleAlert, Globe, Layers3, Plus, ShieldCheck, TimerOff } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DetailNote } from '@/components/ui/detail-note'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { sitesApi } from '@/lib/api'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'
import { useAuthStore } from '@/store/auth'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [sites, setSites] = useState<Site[]>([])
  const [loadingSites, setLoadingSites] = useState(true)

  useEffect(() => {
    const loadSites = async () => {
      try {
        const res = await sitesApi.list()
        setSites(res.data)
      } catch (err) {
        console.error('Failed to load sites', err)
      } finally {
        setLoadingSites(false)
      }
    }

    void loadSites()
  }, [])

  if (!user) {
    return null
  }

  const activeSites = sites.filter((site) => getSiteTrackingState(site).label === 'Active').length
  const verifiedSites = sites.filter((site) => getSiteTrackingState(site).label === 'Verified').length
  const pendingSites = sites.filter((site) => getSiteTrackingState(site).label === 'Pending').length

  // Sites that need attention: pending for > 24h or no signal in 7 days
  const needsAttentionSites = useMemo(() => {
    const now = Date.now()
    return sites.filter((site) => {
      const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
      const lastSignalTime = new Date(lastSignal).getTime()
      const state = getSiteTrackingState(site)
      
      // Pending sites that were created > 24h ago
      if (state.label === 'Pending') {
        const createdTime = new Date(site.created_at).getTime()
        return now - createdTime > 24 * 60 * 60 * 1000
      }
      
      // Sites with no events for 7+ days
      if (state.label === 'Verified' && lastSignalTime) {
        return now - lastSignalTime > 7 * 24 * 60 * 60 * 1000
      }
      
      return false
    }).slice(0, 4)
  }, [sites])

  const hasIssues = needsAttentionSites.length > 0

  // Smart runbook based on workspace state
  const runbookSteps = useMemo(() => {
    if (sites.length === 0) {
      return [
        { icon: <Plus className="h-4 w-4" />, title: 'Create a site', body: 'Add store name and canonical domain.', href: '/dashboard/sites' },
        { icon: <ShieldCheck className="h-4 w-4" />, title: 'Get API key', body: 'Open API Keys and issue a credential for the plugin.', href: undefined },
        { icon: <Layers3 className="h-4 w-4" />, title: 'Install plugin', body: 'Configure the WordPress plugin and verify collection.', href: undefined },
      ]
    }
    
    if (hasIssues) {
      return [
        { icon: <AlertTriangle className="h-4 w-4" />, title: `Resolve ${needsAttentionSites.length} site issue(s)`, body: 'Sites need setup completion or have not received events.', href: `/dashboard/sites` },
        { icon: <ShieldCheck className="h-4 w-4" />, title: 'Review API keys', body: 'Ensure credentials are active for all sites.', href: undefined },
        { icon: <Activity className="h-4 w-4" />, title: 'Check analytics', body: 'Use Overview and Health pages to confirm pipeline.', href: undefined },
      ]
    }
    
    return [
      { icon: <Activity className="h-4 w-4" />, title: 'Monitor traffic', body: `All ${sites.length} site(s) are active. Watch realtime activity.`, href: undefined },
      { icon: <ShieldCheck className="h-4 w-4" />, title: 'Optimize tracking', body: 'Review events, funnels, and conversion data.', href: undefined },
      { icon: <Globe className="h-4 w-4" />, title: 'Explore analytics', body: 'Dive into Sources, Campaigns, and Customer 360 insights.', href: undefined },
    ]
  }, [sites.length, hasIssues, needsAttentionSites.length])

  return (
    <div className="space-y-5">

      {/* Workspace Summary */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="card px-6 py-6">
          <div className="panel-header">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-app-subtle px-3 py-1 text-xs font-medium text-app-muted">
                <Layers3 className="h-3.5 w-3.5" />
                Workspace summary
              </div>
              <h2 className="text-2xl font-semibold text-app-strong">Welcome back, {user.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-app-muted">
                This view shows which stores are actively sending events, which ones are verified but quiet,
                and which installations still need setup work.
              </p>
            </div>
            <Link href="/dashboard/sites" className="btn-primary">
              <Plus className="mr-1.5 h-4 w-4" />
              New Site
            </Link>
          </div>

          <div className="metric-grid">
            <MetricCard
              icon={<Globe className="h-4 w-4" />}
              label="Total Sites"
              value={sites.length.toString()}
              tone="neutral"
              helper="Tracked stores in this workspace"
            />
            <MetricCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Active"
              value={activeSites.toString()}
              tone="good"
              helper="Recently received production events"
            />
            <MetricCard
              icon={<Activity className="h-4 w-4" />}
              label="Verified"
              value={verifiedSites.toString()}
              tone="neutral"
              helper="Connected, but not yet actively streaming"
            />
            <MetricCard
              icon={<CircleAlert className="h-4 w-4" />}
              label="Pending"
              value={pendingSites.toString()}
              tone="warn"
              helper="Still waiting on setup or validation"
            />
          </div>
        </div>

        <div className="card px-6 py-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-app-strong">Runbook</h3>
            <p className="mt-1 text-sm text-app-muted">
              {sites.length === 0
                ? 'Start by adding your first connected website.'
                : hasIssues
                  ? `${needsAttentionSites.length} site(s) require action.`
                  : `All ${sites.length} site(s) look healthy.`}
            </p>
          </div>
          <div className="space-y-3">
            {runbookSteps.map((step, i) => (
              step.href ? (
                <Link key={i} href={step.href}>
                  <DetailNote icon={step.icon} title={step.title} body={step.body} />
                </Link>
              ) : (
                <DetailNote key={i} icon={step.icon} title={step.title} body={step.body} />
              )
            ))}
          </div>
        </div>
      </section>

      {/* Needs Attention */}
      {hasIssues && (
        <section className="space-y-4">
          <div className="panel-header">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Needs Attention
              </h2>
              <p className="section-desc">Sites that require setup completion or have not received events recently.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {needsAttentionSites.map((site) => {
              const state = getSiteTrackingState(site)
              const isPending = state.label === 'Pending'
              return (
                <div key={`attention-${site.id}`} className="card px-6 py-5 border-l-4 border-l-amber-400">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-app-strong">{site.name}</h3>
                        <StatusChip label={isPending ? 'Pending' : 'Stale'} tone="warn" />
                      </div>
                      <p className="truncate text-sm text-app-muted">{site.domain}</p>
                      <p className="mt-2 text-sm text-app-soft">
                        {isPending
                          ? 'Setup not yet completed. Finish onboarding to start collecting events.'
                          : 'No events received for over 7 days. Check pipeline health.'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/dashboard/${site.id}/overview`} className="btn-primary">
                      Open Analytics
                    </Link>
                    <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-secondary">
                      Setup Guide
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Site Portfolio */}
      <section className="space-y-4">
        <div className="panel-header">
          <div>
            <h2 className="section-title">Site Portfolio</h2>
            <p className="section-desc">Recent tracking state and the quickest next action for each store.</p>
          </div>
          {sites.length > 0 && (
            <Link href="/dashboard/sites" className="btn-secondary">
              View all
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          )}
        </div>

        {loadingSites ? (
          <LoadingSpinner className="py-20" />
        ) : sites.length === 0 ? (
          <div className="card px-8 py-16 text-center">
            <EmptyState
              icon={<Plus className="h-7 w-7" />}
              title="No sites yet"
              body="Add the first store, issue an API key, then wire the WordPress plugin to start filling the dashboard."
              className="mx-auto max-w-md px-0 py-0"
            />
            <div className="mt-6">
              <Link href="/dashboard/sites" className="btn-primary">
                <Plus className="mr-1.5 h-4 w-4" />
                Add first site
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {sites.slice(0, 6).map((site) => {
              const trackingState = getSiteTrackingState(site)
              const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at

              return (
                <div key={site.id} className="card px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-app-subtle text-sm font-semibold text-app-strong">
                          {site.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-app-strong">{site.name}</h3>
                          <p className="truncate text-sm text-app-muted">{site.domain}</p>
                        </div>
                      </div>
                    </div>
                    <TrackingStatusChip site={site} />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <InfoCell label="Status detail" value={trackingState.detail} />
                    <InfoCell label="Last signal" value={formatRelativeTimeLabel(lastSignal)} />
                    <InfoCell label="Next step" value={trackingState.label === 'Pending' ? 'Finish setup' : 'Review analytics'} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Link href={`/dashboard/${site.id}/overview`} className="btn-primary">
                      Open Analytics
                    </Link>
                    <Link href={`/dashboard/sites/${site.id}/api-keys`} className="btn-secondary">
                      API Keys
                    </Link>
                    <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-ghost">
                      Setup Guide
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-app-soft">{label}</div>
      <div className="mt-1.5 text-sm font-medium text-app-strong">{value}</div>
    </div>
  )
}
