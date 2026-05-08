'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, ArrowRight, Globe, KeyRound, Mail, Plus, Star, Store, Users } from 'lucide-react'
import { FilterPills } from '@/components/ui/filter-pills'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getWebsiteAppStatuses } from '@/lib/site-apps'
import { getSiteTrackingRank, getSiteTrackingState, type SiteTrackingLabel } from '@/lib/tracking-status'
import type { CreateSiteInput, Site } from '@/lib/types'

const RECENT_SITES_KEY = 'woosaas-recent-sites'
const PINNED_SITES_KEY = 'woosaas-pinned-sites'

const FILTER_OPTIONS: Array<{ label: string; value: 'All' | SiteTrackingLabel }> = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Pending', value: 'Pending' },
]

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateSiteInput>({ name: '', domain: '' })
  const [statusFilter, setStatusFilter] = useState<'All' | SiteTrackingLabel>('All')
  const [query, setQuery] = useState('')
  const [recentSiteIds, setRecentSiteIds] = useState<string[]>([])
  const [pinnedSiteIds, setPinnedSiteIds] = useState<string[]>([])

  const loadSites = async () => {
    try {
      const res = await sitesApi.list()
      setSites(res.data)
    } catch (err) {
      console.error('Failed to load sites', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await sitesApi.create(form)
      setForm({ name: '', domain: '' })
      setShowForm(false)
      await loadSites()
    } catch (err) {
      console.error('Failed to create website', err)
    }
  }

  useEffect(() => {
    void loadSites()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setRecentSiteIds(JSON.parse(window.localStorage.getItem(RECENT_SITES_KEY) || '[]'))
    setPinnedSiteIds(JSON.parse(window.localStorage.getItem(PINNED_SITES_KEY) || '[]'))
  }, [sites.length])

  const filteredSites = useMemo(() => {
    return [...sites]
      .filter((site) => {
        const haystack = `${site.name} ${site.domain}`.toLowerCase()
        if (!haystack.includes(query.toLowerCase())) {
          return false
        }

        if (statusFilter === 'All') {
          return true
        }

        return getSiteTrackingState(site).label === statusFilter
      })
      .sort((left, right) => {
        const rankDifference = getSiteTrackingRank(getSiteTrackingState(left).label) - getSiteTrackingRank(getSiteTrackingState(right).label)
        if (rankDifference !== 0) {
          return rankDifference
        }

        const leftTime = Date.parse(left.tracking_last_event_at || left.tracking_last_checked_at || left.created_at) || 0
        const rightTime = Date.parse(right.tracking_last_event_at || right.tracking_last_checked_at || right.created_at) || 0

        return rightTime - leftTime
      })
  }, [query, sites, statusFilter])

  const pinnedSites = useMemo(
    () =>
      pinnedSiteIds
        .map((siteId) => filteredSites.find((site) => site.id === siteId))
        .filter((site): site is Site => !!site),
    [filteredSites, pinnedSiteIds]
  )

  const recentSites = useMemo(
    () =>
      recentSiteIds
        .map((siteId) => filteredSites.find((site) => site.id === siteId))
        .filter((site): site is Site => !!site && !pinnedSiteIds.includes(site.id)),
    [filteredSites, pinnedSiteIds, recentSiteIds]
  )

  const allSites = useMemo(() => {
    const excludedIds = new Set([...pinnedSiteIds, ...recentSites.map((site) => site.id)])
    return filteredSites.filter((site) => !excludedIds.has(site.id))
  }, [filteredSites, pinnedSiteIds, recentSites])

  const statusCounts = useMemo(() => {
    return sites.reduce<Record<'Active' | 'Verified' | 'Pending', number>>(
      (counts, site) => {
        counts[getSiteTrackingState(site).label] += 1
        return counts
      },
      { Active: 0, Verified: 0, Pending: 0 }
    )
  }, [sites])

  const activeSites = statusCounts.Active
  const connectedSites = statusCounts.Active + statusCounts.Verified

  const togglePinnedSite = (siteId: string) => {
    if (typeof window === 'undefined') {
      return
    }

    const next = pinnedSiteIds.includes(siteId)
      ? pinnedSiteIds.filter((id) => id !== siteId)
      : [siteId, ...pinnedSiteIds.filter((id) => id !== siteId)].slice(0, 8)

    setPinnedSiteIds(next)
    window.localStorage.setItem(PINNED_SITES_KEY, JSON.stringify(next))
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="card px-6 py-6">
          <div className="panel-header">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-app-subtle px-3 py-1 text-xs font-medium text-app-muted">
                <Store className="h-3.5 w-3.5" />
                Website registry
              </div>
              <h2 className="text-2xl font-semibold text-app-strong">Websites</h2>
              <p className="mt-2 max-w-2xl text-sm text-app-muted">
                Each website is now the container for apps, setup, ownership, and future operational workflows.
              </p>
            </div>
            <button onClick={() => setShowForm((value) => !value)} className="btn-primary">
              <Plus className="mr-1.5 h-4 w-4" />
              {showForm ? 'Cancel' : 'Add Website'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Websites" value={sites.length.toString()} />
            <MetricCard label="Analytics Live" value={activeSites.toString()} tone={activeSites > 0 ? 'good' : 'warn'} />
            <MetricCard label="Apps Ready" value={connectedSites.toString()} tone={connectedSites > 0 ? 'good' : 'neutral'} />
            <MetricCard label="Future Apps" value={(sites.length * 2).toString()} />
          </div>
        </div>

        <div className="card px-6 py-6">
          <div className="text-base font-semibold text-app-strong">Registry Focus</div>
          <div className="mt-2 text-sm text-app-muted">
            Keep websites clean and ready so future apps can inherit the same ownership, setup, and customer context.
          </div>
          <div className="mt-5 space-y-2">
            <Link href="/dashboard" className="site-switcher-footer">
              Workspace home
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={sites[0] ? `/dashboard/sites/${sites[0].id}` : '/dashboard/sites'} className="site-switcher-footer">
              Website home pattern
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={sites[0] ? `/dashboard/${sites[0].id}/overview` : '/dashboard/sites'} className="site-switcher-footer">
              Analytics app
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {showForm && (
        <form onSubmit={handleCreate} className="card animate-slide-up px-6 py-6">
          <h3 className="mb-4 text-base font-semibold text-app-strong">New Website</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-app-strong">Website Name</label>
              <input
                type="text"
                placeholder="Main Storefront"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-app-strong">Domain</label>
              <input
                type="url"
                placeholder="https://example.com"
                value={form.domain}
                onChange={(event) => setForm({ ...form, domain: event.target.value })}
                className="input"
                required
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button type="submit" className="btn-primary">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Website
            </button>
          </div>
        </form>
      )}

      {sites.length === 0 ? (
        <div className="card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-app-subtle text-app-muted">
            <Plus className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold text-app-strong">No websites yet</h3>
          <p className="mt-2 text-sm text-app-muted">Create the first website to activate the workspace and analytics app.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SearchInput value={query} onChange={setQuery} placeholder="Search websites..." className="w-full xl:max-w-sm" />
              <FilterPills
                value={statusFilter}
                onChange={setStatusFilter}
                options={FILTER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  count: option.value === 'All' ? sites.length : statusCounts[option.value],
                }))}
              />
            </div>
          </div>

          {filteredSites.length === 0 && (
            <div className="card p-12 text-center">
              <p className="text-app-muted">No websites match this filter yet.</p>
            </div>
          )}

          {pinnedSites.length > 0 && (
            <SiteSection
              title="Pinned Websites"
              sites={pinnedSites}
              pinnedSiteIds={pinnedSiteIds}
              onTogglePinned={togglePinnedSite}
            />
          )}

          {recentSites.length > 0 && (
            <SiteSection
              title="Recent Websites"
              sites={recentSites}
              pinnedSiteIds={pinnedSiteIds}
              onTogglePinned={togglePinnedSite}
            />
          )}

          {allSites.length > 0 && (
            <SiteSection
              title="All Websites"
              sites={allSites}
              pinnedSiteIds={pinnedSiteIds}
              onTogglePinned={togglePinnedSite}
            />
          )}
        </div>
      )}
    </div>
  )
}

function SiteSection({
  title,
  sites,
  pinnedSiteIds,
  onTogglePinned,
}: {
  title: string
  description?: string
  sites: Site[]
  pinnedSiteIds: string[]
  onTogglePinned: (siteId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-app-strong">{title}</h3>
        <div className="text-xs text-app-soft">{sites.length} sites</div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            pinned={pinnedSiteIds.includes(site.id)}
            onTogglePinned={() => onTogglePinned(site.id)}
          />
        ))}
      </div>
    </section>
  )
}

function SiteCard({
  site,
  pinned,
  onTogglePinned,
}: {
  site: Site
  pinned: boolean
  onTogglePinned: () => void
}) {
  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const apps = getWebsiteAppStatuses(site)

  return (
    <div className="card px-6 py-5">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePinned}
            className={`icon-button ${pinned ? 'text-amber-500' : ''}`}
            aria-label={pinned ? 'Unpin website' : 'Pin website'}
            title={pinned ? 'Unpin website' : 'Pin website'}
          >
            <Star className={`h-4 w-4 ${pinned ? 'fill-current' : ''}`} />
          </button>
          <TrackingStatusChip site={site} />
        </div>
      </div>

      <p className="mt-4 text-sm text-app-muted">{trackingState.detail}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SiteFact icon={<Globe className="h-4 w-4" />} label="Domain" value={site.domain} />
        <SiteFact icon={<ActivityDot />} label="Last signal" value={formatRelativeTimeLabel(lastSignal)} />
        <SiteFact icon={<Store className="h-4 w-4" />} label="Entry point" value="Website home" />
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
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
        <Link href={`/dashboard/${site.id}/overview`} className="btn-secondary">
          View analytics
        </Link>
        <Link href={`/dashboard/teams?siteId=${site.id}`} className="btn-ghost">
          <Users className="mr-1.5 h-4 w-4" />
          Team
        </Link>
        <Link href={`/dashboard/sites/${site.id}/api-keys`} className="btn-ghost">
          <KeyRound className="mr-1.5 h-4 w-4" />
          API Keys
        </Link>
      </div>
    </div>
  )
}

function SiteFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-app-soft">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 truncate text-sm font-medium text-app-strong">{value}</div>
    </div>
  )
}

function ActivityDot() {
  return <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
}
