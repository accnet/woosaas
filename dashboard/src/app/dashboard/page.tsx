'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, Globe, Layers3, LifeBuoy, Mail, Plus, ShieldCheck, Store } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getWorkspaceAppSummaries, getWebsiteAppStatuses } from '@/lib/site-apps'
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
        console.error('Failed to load workspace sites', err)
      } finally {
        setLoadingSites(false)
      }
    }

    void loadSites()
  }, [])

  const activeSites = sites.filter((site) => getSiteTrackingState(site).label === 'Active').length
  const connectedAnalyticsSites = sites.filter((site) => getSiteTrackingState(site).label !== 'Pending').length

  const needsAttentionSites = useMemo(() => {
    const now = Date.now()
    return sites.filter((site) => {
      const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
      const lastSignalTime = new Date(lastSignal).getTime()
      const state = getSiteTrackingState(site)

      if (state.label === 'Pending') {
        return now - new Date(site.created_at).getTime() > 24 * 60 * 60 * 1000
      }

      if (state.label === 'Verified') {
        return now - lastSignalTime > 7 * 24 * 60 * 60 * 1000
      }

      return false
    })
  }, [sites])

  const workspaceApps = useMemo(() => getWorkspaceAppSummaries(sites), [sites])
  const featuredSites = useMemo(() => sites.slice(0, 6), [sites])

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="card px-6 py-6">
          <div className="panel-header">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-app-subtle px-3 py-1 text-xs font-medium text-app-muted">
                <Layers3 className="h-3.5 w-3.5" />
                Workspace home
              </div>
              <h2 className="text-2xl font-semibold text-app-strong">Welcome back, {user.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-app-muted">
                Run your websites as app workspaces. Analytics is live today, while Support Tickets and Email Campaigns
                already have reserved space in the product structure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/sites" className="btn-secondary">
                View websites
              </Link>
              <Link href="/dashboard/sites" className="btn-primary">
                <Plus className="mr-1.5 h-4 w-4" />
                New website
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <MetricCard
              icon={<Globe className="h-4 w-4" />}
              label="Websites"
              value={sites.length.toString()}
              helper="Tracked websites in this workspace"
            />
            <MetricCard
              icon={<Activity className="h-4 w-4" />}
              label="Analytics Live"
              value={activeSites.toString()}
              tone={activeSites > 0 ? 'good' : 'warn'}
              helper="Websites actively streaming events"
            />
            <MetricCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Apps Ready"
              value={connectedAnalyticsSites.toString()}
              tone={connectedAnalyticsSites > 0 ? 'good' : 'neutral'}
              helper="Websites already connected to the first app"
            />
            <MetricCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Needs Attention"
              value={needsAttentionSites.length.toString()}
              tone={needsAttentionSites.length > 0 ? 'warn' : 'neutral'}
              helper="Websites blocked on setup or recent signal"
            />
          </div>
        </div>

        <SectionCard
          title="Rollout Focus"
          icon={<Store className="h-4 w-4" />}
        >
          <div className="space-y-2">
            <QuickAction
              href="/dashboard/sites"
              title="Curate website portfolio"
              body="Keep names, domains, and ownership clean before more apps arrive."
            />
            <QuickAction
              href={sites[0] ? `/dashboard/sites/${sites[0].id}` : '/dashboard/sites'}
              title="Use website home as the entrypoint"
              body="Website-level app navigation is now the main mental model."
            />
            <QuickAction
              href={sites[0] ? `/dashboard/${sites[0].id}/overview` : '/dashboard/sites'}
              title="Keep analytics stable"
              body="Existing analytics reports stay intact while the shell evolves around them."
            />
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="App Portfolio"
        icon={<Layers3 className="h-4 w-4" />}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {workspaceApps.map((app) => (
            <div key={app.key} className="rounded-lg border border-app-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-app-subtle text-app-strong">
                  {app.key === 'analytics' ? <Activity className="h-5 w-5" /> : app.key === 'supportTickets' ? <LifeBuoy className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                </div>
                <StatusChip label={app.label} tone={app.tone} />
              </div>
              <div className="mt-4 text-base font-semibold text-app-strong">{app.title}</div>
              <p className="mt-2 text-sm text-app-muted">{app.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {needsAttentionSites.length > 0 ? (
        <SectionCard
          title="Needs Attention"
          icon={<AlertTriangle className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {needsAttentionSites.slice(0, 4).map((site) => {
              const trackingState = getSiteTrackingState(site)
              return (
                <div key={site.id} className="rounded-lg border border-app-line bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-app-strong">{site.name}</div>
                      <div className="truncate text-sm text-app-muted">{site.domain}</div>
                    </div>
                    <TrackingStatusChip site={site} />
                  </div>
                  <p className="mt-3 text-sm text-app-muted">{trackingState.detail}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/dashboard/sites/${site.id}`} className="btn-secondary">
                      Website home
                    </Link>
                    <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-primary">
                      Finish setup
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Website Workspaces"
        icon={<Globe className="h-4 w-4" />}
        action={
          sites.length > 0 ? (
            <Link href="/dashboard/sites" className="btn-secondary">
              Open registry
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          ) : null
        }
      >
        {loadingSites ? (
          <LoadingSpinner className="py-16" />
        ) : featuredSites.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-7 w-7" />}
            title="No websites yet"
            body="Create the first website to activate the workspace model and unlock analytics."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {featuredSites.map((site) => (
              <WorkspaceSiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function QuickAction({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="site-switcher-footer">
      <div>
        <div className="text-sm font-semibold text-app-strong">{title}</div>
        <div className="mt-1 text-sm text-app-muted">{body}</div>
      </div>
      <ArrowRight className="h-4 w-4" />
    </Link>
  )
}

function WorkspaceSiteCard({ site }: { site: Site }) {
  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const apps = getWebsiteAppStatuses(site)

  return (
    <div className="rounded-lg border border-app-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-app-strong">{site.name}</div>
          <div className="truncate text-sm text-app-muted">{site.domain}</div>
        </div>
        <TrackingStatusChip site={site} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InfoCell label="Tracking detail" value={trackingState.detail} />
        <InfoCell label="Last signal" value={formatRelativeTimeLabel(lastSignal)} />
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-app-soft">Apps</div>
        <div className="flex flex-wrap gap-2">
          {apps.map((app) => (
            <StatusChip key={app.key} label={`${app.title}: ${app.label}`} tone={app.tone} />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link href={`/dashboard/sites/${site.id}`} className="btn-primary">
          Open website
        </Link>
        <Link href={`/dashboard/${site.id}/overview`} className="btn-secondary">
          Analytics
        </Link>
      </div>
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
