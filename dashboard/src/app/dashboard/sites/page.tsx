'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, Globe, Plus, Star } from 'lucide-react'
import { FilterPills } from '@/components/ui/filter-pills'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { settingsApi, sitesApi } from '@/lib/api'
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
  const [siteDefaults, setSiteDefaults] = useState<Pick<CreateSiteInput, 'timezone' | 'currency'>>({})
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
      setForm({ name: '', domain: '', ...siteDefaults })
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
    let cancelled = false
    const loadDefaults = async () => {
      try {
        const res = await settingsApi.get()
        if (cancelled) return
        const defaults = { timezone: res.data.timezone, currency: res.data.currency }
        setSiteDefaults(defaults)
        setForm((current) => ({ ...current, ...defaults }))
      } catch {
        // Website creation still works without user-level defaults.
      }
    }
    void loadDefaults()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setRecentSiteIds(JSON.parse(window.localStorage.getItem(RECENT_SITES_KEY) || '[]'))
    setPinnedSiteIds(JSON.parse(window.localStorage.getItem(PINNED_SITES_KEY) || '[]'))
  }, [sites.length])

  const filteredSites = useMemo(() => {
    return [...sites]
      .filter((site) => {
        const haystack = `${site.name} ${site.domain}`.toLowerCase()
        if (!haystack.includes(query.toLowerCase())) return false
        if (statusFilter === 'All') return true
        return getSiteTrackingState(site).label === statusFilter
      })
      .sort((left, right) => {
        const rankDiff = getSiteTrackingRank(getSiteTrackingState(left).label) - getSiteTrackingRank(getSiteTrackingState(right).label)
        if (rankDiff !== 0) return rankDiff
        const lt = Date.parse(left.tracking_last_event_at || left.tracking_last_checked_at || left.created_at) || 0
        const rt = Date.parse(right.tracking_last_event_at || right.tracking_last_checked_at || right.created_at) || 0
        return rt - lt
      })
  }, [query, sites, statusFilter])

  const pinnedSites = useMemo(
    () => pinnedSiteIds.map((id) => filteredSites.find((s) => s.id === id)).filter((s): s is Site => !!s),
    [filteredSites, pinnedSiteIds]
  )

  const recentSites = useMemo(
    () => recentSiteIds.map((id) => filteredSites.find((s) => s.id === id)).filter((s): s is Site => !!s && !pinnedSiteIds.includes(s.id)),
    [filteredSites, pinnedSiteIds, recentSiteIds]
  )

  const allSites = useMemo(() => {
    const excluded = new Set([...pinnedSiteIds, ...recentSites.map((s) => s.id)])
    return filteredSites.filter((s) => !excluded.has(s.id))
  }, [filteredSites, pinnedSiteIds, recentSites])

  const statusCounts = useMemo(
    () =>
      sites.reduce<Record<'Active' | 'Verified' | 'Pending', number>>(
        (acc, site) => { acc[getSiteTrackingState(site).label] += 1; return acc },
        { Active: 0, Verified: 0, Pending: 0 }
      ),
    [sites]
  )

  const togglePinnedSite = (siteId: string) => {
    if (typeof window === 'undefined') return
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-app-strong">Websites</h1>
          <p className="mt-0.5 text-sm text-app-muted">
            {sites.length} total · {statusCounts.Active} live · {statusCounts.Verified} verified · {statusCounts.Pending} pending
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          {showForm ? 'Cancel' : 'Add Website'}
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card px-6 py-5">
          <h3 className="mb-4 text-sm font-semibold text-app-strong">New Website</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-app-strong">Name</label>
              <input
                type="text"
                placeholder="My Storefront"
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
          <div className="mt-4 flex justify-end">
            <button type="submit" className="btn-primary">
              <Plus className="mr-1.5 h-4 w-4" />
              Create
            </button>
          </div>
        </form>
      )}

      {sites.length === 0 ? (
        <div className="card px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-app-subtle text-app-muted">
            <Globe className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-app-strong">No websites yet</h3>
          <p className="mt-1.5 text-sm text-app-muted">Add the first website to start collecting analytics.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Search + filter */}
          <div className="card p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SearchInput value={query} onChange={setQuery} placeholder="Search websites…" className="w-full xl:max-w-sm" />
              <FilterPills
                value={statusFilter}
                onChange={setStatusFilter}
                options={FILTER_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  count: o.value === 'All' ? sites.length : statusCounts[o.value],
                }))}
              />
            </div>
          </div>

          {filteredSites.length === 0 && (
            <div className="card p-12 text-center">
              <p className="text-sm text-app-muted">No websites match this filter.</p>
            </div>
          )}

          {pinnedSites.length > 0 && (
            <SiteSection title="Pinned" sites={pinnedSites} pinnedSiteIds={pinnedSiteIds} onTogglePinned={togglePinnedSite} />
          )}
          {recentSites.length > 0 && (
            <SiteSection title="Recent" sites={recentSites} pinnedSiteIds={pinnedSiteIds} onTogglePinned={togglePinnedSite} />
          )}
          {allSites.length > 0 && (
            <SiteSection title="All Websites" sites={allSites} pinnedSiteIds={pinnedSiteIds} onTogglePinned={togglePinnedSite} />
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
  sites: Site[]
  pinnedSiteIds: string[]
  onTogglePinned: (siteId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-strong">{title}</h3>
        <span className="text-xs text-app-soft">{sites.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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

function SiteCard({ site, pinned, onTogglePinned }: { site: Site; pinned: boolean; onTogglePinned: () => void }) {
  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const apps = getWebsiteAppStatuses(site)

  return (
    <div className="flex flex-col rounded-xl border border-app-line bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-app-subtle text-sm font-bold text-app-strong">
          {site.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-app-strong">{site.name}</div>
          <div className="truncate text-xs text-app-muted">{site.domain}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePinned}
            className={`icon-button ${pinned ? 'text-amber-400' : ''}`}
            aria-label={pinned ? 'Unpin' : 'Pin'}
          >
            <Star className={`h-4 w-4 ${pinned ? 'fill-current' : ''}`} />
          </button>
          <TrackingStatusChip site={site} />
        </div>
      </div>

      {/* Last signal */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-app-muted">
        <Activity className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{trackingState.detail} · {formatRelativeTimeLabel(lastSignal)}</span>
      </div>

      {/* App pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {apps.map((app) => (
          <StatusChip key={app.key} label={`${app.title}: ${app.label}`} tone={app.tone} />
        ))}
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
        <Link href={`/dashboard/sites/${site.id}`} className="btn-primary text-xs">
          Open
        </Link>
        <Link href={`/dashboard/${site.id}/overview`} className="btn-secondary text-xs">
          Analytics
        </Link>
        <Link href={`/dashboard/${site.id}/orders`} className="btn-secondary text-xs">
          Orders
        </Link>
      </div>
    </div>
  )
}
