'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, Globe, Loader2, Plus, ShoppingBag, Star, X } from 'lucide-react'
import { FilterPills } from '@/components/ui/filter-pills'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { PlatformIcon } from '@/components/ui/platform-icon'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { settingsApi, shopbaseApi, sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getWebsiteAppStatuses } from '@/lib/site-apps'
import { getSiteTrackingRank, getSiteTrackingState, type SiteTrackingLabel } from '@/lib/tracking-status'
import type { CreateSiteInput, ShopMetadata, Site, SyncOptions } from '@/lib/types'

const RECENT_SITES_KEY = 'woosaas-recent-sites'
const PINNED_SITES_KEY = 'woosaas-pinned-sites'

const FILTER_OPTIONS: Array<{ label: string; value: 'All' | SiteTrackingLabel }> = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Pending', value: 'Pending' },
]

type Platform = 'woocommerce' | 'shopbase'

interface ShopBaseFormState {
  shopDomain: string
  apiKey: string
  apiPassword: string
  syncOrders: boolean
  syncCustomers: boolean
  syncProducts: boolean
  step: 'form' | 'verified' | 'connecting'
  verified: ShopMetadata | null
  error: string | null
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [platform, setPlatform] = useState<Platform>('woocommerce')
  const [form, setForm] = useState<CreateSiteInput>({ name: '', domain: '' })
  const [siteDefaults, setSiteDefaults] = useState<Pick<CreateSiteInput, 'timezone' | 'currency'>>({})
  const [statusFilter, setStatusFilter] = useState<'All' | SiteTrackingLabel>('All')
  const [query, setQuery] = useState('')
  const [recentSiteIds, setRecentSiteIds] = useState<string[]>([])
  const [pinnedSiteIds, setPinnedSiteIds] = useState<string[]>([])

  const [sbForm, setSbForm] = useState<ShopBaseFormState>({
    shopDomain: '',
    apiKey: '',
    apiPassword: '',
    syncOrders: true,
    syncCustomers: true,
    syncProducts: true,
    step: 'form',
    verified: null,
    error: null,
  })

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

  const handleShopBaseVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setSbForm((f) => ({ ...f, error: null }))
    try {
      const res = await shopbaseApi.verify({
        shop_domain: sbForm.shopDomain,
        api_key: sbForm.apiKey,
        api_password: sbForm.apiPassword,
      })
      if (res.data.ok) {
        setSbForm((f) => ({ ...f, step: 'verified', verified: res.data.shop }))
      }
    } catch {
      setSbForm((f) => ({ ...f, error: 'Could not connect. Check your credentials.' }))
    }
  }

  const handleShopBaseConnect = async () => {
    setSbForm((f) => ({ ...f, step: 'connecting', error: null }))
    try {
      const syncOptions: SyncOptions = {
        orders: sbForm.syncOrders,
        customers: sbForm.syncCustomers,
        products: sbForm.syncProducts,
      }
      await shopbaseApi.connect({
        shop_domain: sbForm.shopDomain,
        api_key: sbForm.apiKey,
        api_password: sbForm.apiPassword,
        sync_options: syncOptions,
      })
      setShowForm(false)
      setSbForm({ shopDomain: '', apiKey: '', apiPassword: '', syncOrders: true, syncCustomers: true, syncProducts: true, step: 'form', verified: null, error: null })
      await loadSites()
    } catch {
      setSbForm((f) => ({ ...f, step: 'verified', error: 'Connection failed. Please try again.' }))
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
<button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Website
        </button>
      </div>

      {/* Modal */}
      {showForm && (
        <AddWebsiteModal
          platform={platform}
          setPlatform={setPlatform}
          form={form}
          setForm={setForm}
          sbForm={sbForm}
          setSbForm={setSbForm}
          onClose={() => {
            setShowForm(false)
            setSbForm({ shopDomain: '', apiKey: '', apiPassword: '', syncOrders: true, syncCustomers: true, syncProducts: true, step: 'form', verified: null, error: null })
          }}
          onWooSubmit={handleCreate}
          onShopBaseVerify={handleShopBaseVerify}
          onShopBaseConnect={handleShopBaseConnect}
        />
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
  const isShopBase = site.platform === 'shopbase'

  return (
    <div className="flex flex-col rounded-xl border border-app-line bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <PlatformIcon platform={site.platform} size={32} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-semibold text-app-strong">{site.name}</div>
            <PlatformIcon platform={site.platform} size={16} />
          </div>
          <div className="truncate text-xs text-app-muted">{site.domain}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isShopBase && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">ShopBase</span>
          )}
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

// ---------- AddWebsiteModal ----------

function AddWebsiteModal({
  platform,
  setPlatform,
  form,
  setForm,
  sbForm,
  setSbForm,
  onClose,
  onWooSubmit,
  onShopBaseVerify,
  onShopBaseConnect,
}: {
  platform: Platform
  setPlatform: (p: Platform) => void
  form: CreateSiteInput
  setForm: React.Dispatch<React.SetStateAction<CreateSiteInput>>
  sbForm: ShopBaseFormState
  setSbForm: React.Dispatch<React.SetStateAction<ShopBaseFormState>>
  onClose: () => void
  onWooSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onShopBaseVerify: (e: React.FormEvent) => void
  onShopBaseConnect: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const isBusy = sbForm.step === 'connecting'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-app-strong">Add Website</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-app-muted hover:bg-slate-100 hover:text-app-strong"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-5">
          {/* Platform selector */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPlatform('woocommerce')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                platform === 'woocommerce'
                  ? 'border-violet-500 bg-violet-50 text-violet-700'
                  : 'border-app-line bg-white text-app-muted hover:border-slate-300'
              }`}
            >
              <Globe className="h-4 w-4" />
              WooCommerce
            </button>
            <button
              type="button"
              onClick={() => setPlatform('shopbase')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                platform === 'shopbase'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-app-line bg-white text-app-muted hover:border-slate-300'
              }`}
            >
              <ShoppingBag className="h-4 w-4" />
              ShopBase
            </button>
          </div>

          {/* WooCommerce form */}
          {platform === 'woocommerce' && (
            <form onSubmit={onWooSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Name</label>
                <input
                  type="text"
                  placeholder="My Storefront"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Domain</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create
                </button>
              </div>
            </form>
          )}

          {/* ShopBase form — step: credentials */}
          {platform === 'shopbase' && sbForm.step === 'form' && (
            <form onSubmit={onShopBaseVerify} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Shop Domain</label>
                <input
                  type="text"
                  placeholder="myshop.onshopbase.com"
                  value={sbForm.shopDomain}
                  onChange={(e) => setSbForm((f) => ({ ...f, shopDomain: e.target.value }))}
                  className="input"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">API Key</label>
                <input
                  type="text"
                  placeholder="API Key"
                  value={sbForm.apiKey}
                  onChange={(e) => setSbForm((f) => ({ ...f, apiKey: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">API Password</label>
                <input
                  type="password"
                  placeholder="API Password"
                  value={sbForm.apiPassword}
                  onChange={(e) => setSbForm((f) => ({ ...f, apiPassword: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              {sbForm.error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {sbForm.error}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Verify Credentials</button>
              </div>
            </form>
          )}

          {/* ShopBase form — step: verified / sync options */}
          {platform === 'shopbase' && sbForm.step === 'verified' && sbForm.verified && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">{sbForm.verified.name}</p>
                  <p className="text-xs text-green-700">{sbForm.verified.domain} · {sbForm.verified.currency} · {sbForm.verified.timezone}</p>
                </div>
              </div>

              <div>
                <p className="mb-2.5 text-sm font-medium text-app-strong">Sync Options</p>
                <div className="flex flex-wrap gap-4">
                  {(['orders', 'customers', 'products'] as const).map((key) => {
                    const checked = key === 'orders' ? sbForm.syncOrders : key === 'customers' ? sbForm.syncCustomers : sbForm.syncProducts
                    return (
                      <label key={key} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSbForm((f) => ({
                              ...f,
                              [`sync${key.charAt(0).toUpperCase() + key.slice(1)}`]: e.target.checked,
                            }))
                          }
                          className="rounded"
                        />
                        <span className="text-sm capitalize text-app-strong">{key}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {sbForm.error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {sbForm.error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSbForm((f) => ({ ...f, step: 'form', verified: null, error: null }))}
                >
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={onShopBaseConnect}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Connect Store
                </button>
              </div>
            </div>
          )}

          {/* ShopBase — connecting spinner */}
          {platform === 'shopbase' && isBusy && (
            <div className="flex items-center justify-center gap-3 py-8 text-sm text-app-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Connecting…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
