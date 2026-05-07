'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Globe, KeyRound, Plus, Search, Star, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { sitesApi } from '@/lib/api'
import {
  getSiteTrackingRank,
  getSiteTrackingState,
  type SiteTrackingLabel,
} from '@/lib/tracking-status'
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

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      await sitesApi.create(form)
      setForm({ name: '', domain: '' })
      setShowForm(false)
      await loadSites()
    } catch (err) {
      console.error('Failed to create site', err)
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
        const leftState = getSiteTrackingState(left)
        const rightState = getSiteTrackingState(right)
        const rankDifference =
          getSiteTrackingRank(leftState.label) - getSiteTrackingRank(rightState.label)

        if (rankDifference !== 0) {
          return rankDifference
        }

        const leftTime =
          Date.parse(left.tracking_last_event_at || left.tracking_last_checked_at || left.created_at) || 0
        const rightTime =
          Date.parse(
            right.tracking_last_event_at || right.tracking_last_checked_at || right.created_at
          ) || 0

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Site Registry</h2>
          <p className="mt-2 text-sm text-app-muted">
            Create stores, inspect readiness, and jump into configuration or analytics.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {showForm ? 'Cancel' : 'Add Site'}
        </button>
      </div>

      {/* Create form */}

      {showForm && (
        <form onSubmit={handleCreate} className="card animate-slide-up px-6 py-6">
          <h3 className="mb-4 text-base font-semibold text-app-strong">New Site</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-app-strong">Site Name</label>
              <input
                type="text"
                placeholder="My Store"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="input"
                required
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button type="submit" className="btn-primary">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Site
            </button>
          </div>
        </form>
      )}

      {sites.length === 0 ? (
        <div className="card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-app-subtle text-app-muted">
            <Plus className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold text-app-strong">No sites yet</h3>
          <p className="mt-2 text-sm text-app-muted">Add your first website to start tracking analytics.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="card p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search websites..."
                  className="input pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
              {FILTER_OPTIONS.map((option) => {
                const count =
                  option.value === 'All'
                    ? sites.length
                    : statusCounts[option.value]

                const isActive = statusFilter === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-app-strong text-white shadow-soft'
                        : 'bg-slate-50 text-app-muted hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                    <span className={`ml-2 text-xs ${isActive ? 'text-slate-200' : 'text-app-soft'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
              </div>
            </div>
          </div>

          {filteredSites.length === 0 && (
            <div className="card p-12 text-center">
              <p className="text-app-muted">No sites match this filter yet.</p>
            </div>
          )}

          {pinnedSites.length > 0 && (
            <SiteSection
              title="Pinned Websites"
              description="Priority stores you switch into often."
              sites={pinnedSites}
              pinnedSiteIds={pinnedSiteIds}
              onTogglePinned={togglePinnedSite}
            />
          )}

          {recentSites.length > 0 && (
            <SiteSection
              title="Recent Websites"
              description="Recently opened sites from your analytics workspace."
              sites={recentSites}
              pinnedSiteIds={pinnedSiteIds}
              onTogglePinned={togglePinnedSite}
            />
          )}

          {allSites.length > 0 && (
            <SiteSection
              title="All Websites"
              description="Full registry ordered by tracking health and recent activity."
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
  description,
  sites,
  pinnedSiteIds,
  onTogglePinned,
}: {
  title: string
  description: string
  sites: Site[]
  pinnedSiteIds: string[]
  onTogglePinned: (siteId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-app-strong">{title}</h3>
          <p className="mt-1 text-sm text-app-muted">{description}</p>
        </div>
        <div className="text-xs font-medium text-app-soft">{sites.length} sites</div>
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
  const badgeColor = trackingState.label === 'Active' ? 'badge-success' :
    trackingState.label === 'Verified' ? 'badge-info' : 'badge-warning'
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at

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
          <span className={badgeColor}>{trackingState.label}</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-app-muted">{trackingState.detail}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SiteFact icon={<Globe className="h-4 w-4" />} label="Domain" value={site.domain} />
        <SiteFact icon={<ActivityBadge />} label="Last signal" value={formatRelativeTimeLabel(lastSignal)} />
        <SiteFact icon={<Users className="h-4 w-4" />} label="Next step" value={trackingState.label === 'Pending' ? 'Complete setup' : 'Review data'} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link href={`/dashboard/${site.id}/overview`} className="btn-primary">
          View Analytics
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
        <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-secondary">
          Setup
        </Link>
        <Link href={`/dashboard/sites/${site.id}/team`} className="btn-ghost">
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
  icon: React.ReactNode
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

function ActivityBadge() {
  return <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
}
