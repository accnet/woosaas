'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Star, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { appNav, buildAnalyticsHref, buildPageMeta, buildSetupHref, getAppHref, getCurrentSiteId, resolveSiteRoute, siteAnalyticsNav, siteOperationsNav, siteSetupNav } from '@/lib/navigation'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'
import { useAuthStore } from '@/store/auth'

const RECENT_SITES_KEY = 'woosaas-recent-sites'
const PINNED_SITES_KEY = 'woosaas-pinned-sites'

function getTrackingBadgeClass(site: Site) {
  const state = getSiteTrackingState(site)
  const badgeClass =
    state.label === 'Active'
      ? 'badge-success'
      : state.label === 'Verified'
        ? 'badge-info'
        : 'badge-warning'

  return { state, badgeClass }
}

function SiteSwitcherOption({
  site,
  active,
  pinned,
  highlighted,
  onSelect,
  onTogglePinned,
  onKeyDown,
}: {
  site: Site
  active: boolean
  pinned: boolean
  highlighted: boolean
  onSelect: () => void
  onTogglePinned: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
}) {
  const { state, badgeClass } = getTrackingBadgeClass(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`site-switcher-row ${active ? 'site-switcher-row-active' : ''} ${highlighted ? 'site-switcher-row-highlighted' : ''}`}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="site-switcher-row-top">
          <span className="truncate text-sm font-medium text-app-strong">{site.domain}</span>
          <button
            type="button"
            aria-label={pinned ? 'Unpin website' : 'Pin website'}
            className={`site-switcher-star ${pinned ? 'site-switcher-star-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onTogglePinned()
            }}
          >
            <Star className={`h-3.5 w-3.5 ${pinned ? 'fill-current' : ''}`} />
          </button>
        </div>
        <div className="truncate text-xs text-app-muted">{site.name}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className={badgeClass}>{state.label}</span>
          <span className="truncate text-[11px] text-app-soft">Last signal {formatRelativeTimeLabel(lastSignal)}</span>
        </div>
      </div>
    </div>
  )
}

function SiteDirectoryRow({
  site,
  pinned = false,
  onNavigate,
}: {
  site: Site
  pinned?: boolean
  onNavigate?: () => void
}) {
  const { state, badgeClass } = getTrackingBadgeClass(site)

  return (
    <Link href={`/dashboard/${site.id}/overview`} className="site-list-row" onClick={onNavigate}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-medium text-app-strong">{site.name}</div>
          {pinned ? <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" /> : <span className={badgeClass}>{state.label}</span>}
        </div>
        <div className="truncate text-xs text-app-muted">{site.domain}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-app-soft" />
    </Link>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [sites, setSites] = useState<Site[]>([])
  const [loadingSites, setLoadingSites] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const currentSiteId = useMemo(() => getCurrentSiteId(pathname), [pathname])
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentSiteId) || null,
    [sites, currentSiteId]
  )
  const page = useMemo(() => buildPageMeta(pathname), [pathname])

  useEffect(() => {
    const loadSites = async () => {
      try {
        const res = await sitesApi.list()
        setSites(res.data)
      } catch (err) {
        console.error('Failed to load shell sites', err)
      } finally {
        setLoadingSites(false)
      }
    }

    void loadSites()
  }, [])

  useEffect(() => {
    if (!currentSiteId || typeof window === 'undefined') {
      return
    }

    const next = [
      currentSiteId,
      ...JSON.parse(window.localStorage.getItem(RECENT_SITES_KEY) || '[]').filter((id: string) => id !== currentSiteId),
    ].slice(0, 8)
    window.localStorage.setItem(RECENT_SITES_KEY, JSON.stringify(next))
  }, [currentSiteId])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-app">
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <AppRail pathname={pathname} currentSiteId={currentSiteId} user={user} logout={logout} />
        <SiteSidebar pathname={pathname} siteId={currentSiteId} site={currentSite} sites={sites} loadingSites={loadingSites} />

        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          pathname={pathname}
          currentSiteId={currentSiteId}
          currentSite={currentSite}
          sites={sites}
          loadingSites={loadingSites}
          user={user}
          logout={logout}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopNav
            pathname={pathname}
            siteId={currentSiteId}
            currentSite={currentSite}
            sites={sites}
            loadingSites={loadingSites}
            page={page}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  )
}

function AppRail({
  pathname,
  currentSiteId,
  user,
  logout,
}: {
  pathname: string
  currentSiteId: string | null
  user: { name?: string | null; email?: string | null } | null
  logout: () => void
}) {
  return (
    <aside className="hidden w-[72px] shrink-0 border-r border-app-line bg-app-panel xl:flex xl:flex-col">
      <div className="flex h-20 items-center justify-center border-b border-app-line">
        <Link href="/dashboard" className="app-rail-logo" title="Woosaas">
          W
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <nav className="space-y-2">
          {appNav.map((item) => {
            const Icon = item.icon
            const href = getAppHref(item.href, currentSiteId)
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : item.href === '/dashboard/sites'
                  ? pathname.startsWith('/dashboard/sites')
                  : currentSiteId !== null && pathname.startsWith(`/dashboard/${currentSiteId}`)

            return (
              <Link
                key={`${item.label}-${href}`}
                href={href}
                className={`app-rail-item ${isActive ? 'app-rail-item-active' : 'app-rail-item-idle'}`}
                title={item.label}
              >
                <Icon className="h-5 w-5" />
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-app-line px-3 py-4">
        <div className="space-y-2">
          <div className="app-rail-user" title={user?.email || 'User'}>
            {(user?.name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <button onClick={logout} className="app-rail-item app-rail-item-idle w-full" title="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function MobileNavDrawer({
  open,
  onClose,
  pathname,
  currentSiteId,
  currentSite,
  sites,
  loadingSites,
  user,
  logout,
}: {
  open: boolean
  onClose: () => void
  pathname: string
  currentSiteId: string | null
  currentSite: Site | null
  sites: Site[]
  loadingSites: boolean
  user: { name?: string | null; email?: string | null } | null
  logout: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="mobile-shell-overlay xl:hidden">
      <button type="button" aria-label="Close navigation" className="mobile-shell-backdrop" onClick={onClose} />
      <div className="mobile-shell-drawer">
        <div className="flex items-center justify-between border-b border-app-line px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-app-strong">Workspace</div>
            <div className="text-xs text-app-muted">{currentSite ? currentSite.domain : 'Connected websites'}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-app-line px-4 py-4">
          <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
            Applications
          </div>
          <div className="grid grid-cols-2 gap-2">
            {appNav.map((item) => {
              const Icon = item.icon
              const href = getAppHref(item.href, currentSiteId)
              const isActive =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : item.href === '/dashboard/sites'
                    ? pathname.startsWith('/dashboard/sites')
                    : currentSiteId !== null && pathname.startsWith(`/dashboard/${currentSiteId}`)

              return (
                <Link
                  key={`mobile-${item.label}-${href}`}
                  href={href}
                  className={`mobile-app-link ${isActive ? 'mobile-app-link-active' : ''}`}
                  onClick={onClose}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <SiteSidebarContent pathname={pathname} siteId={currentSiteId} site={currentSite} sites={sites} loadingSites={loadingSites} compact onNavigate={onClose} />
        </div>

        <div className="border-t border-app-line px-4 py-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-app-line bg-slate-50 px-3 py-3">
            <div className="app-rail-user h-10 w-10 shrink-0">
              {(user?.name || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-app-strong">{user?.name || 'Admin'}</div>
              <div className="truncate text-xs text-app-muted">{user?.email || 'Signed in'}</div>
            </div>
          </div>
          <button
            onClick={() => {
              onClose()
              logout()
            }}
            className="btn-secondary w-full justify-between"
          >
            Sign out
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SiteSidebar({
  pathname,
  siteId,
  site,
  sites,
  loadingSites,
}: {
  pathname: string
  siteId: string | null
  site: Site | null
  sites: Site[]
  loadingSites: boolean
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 border-r border-app-line bg-white xl:flex xl:flex-col">
      <div className="flex h-20 items-center border-b border-app-line px-5">
        {site ? (
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-app-strong">{site.name}</div>
            <div className="truncate text-sm text-app-muted">{site.domain}</div>
          </div>
        ) : (
          <div>
            <div className="text-base font-semibold text-app-strong">Analytics</div>
            <div className="text-sm text-app-muted">Select a connected website</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <SiteSidebarContent pathname={pathname} siteId={siteId} site={site} sites={sites} loadingSites={loadingSites} />
      </div>
    </aside>
  )
}

function SiteSidebarContent({
  pathname,
  siteId,
  site,
  sites,
  loadingSites,
  compact = false,
  onNavigate,
}: {
  pathname: string
  siteId: string | null
  site: Site | null
  sites: Site[]
  loadingSites: boolean
  compact?: boolean
  onNavigate?: () => void
}) {
  const [pinnedSiteIds, setPinnedSiteIds] = useState<string[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    setPinnedSiteIds(JSON.parse(window.localStorage.getItem(PINNED_SITES_KEY) || '[]'))
  }, [siteId, pathname])

  const pinnedSites = pinnedSiteIds
    .map((pinnedId) => sites.find((entry) => entry.id === pinnedId))
    .filter((entry): entry is Site => !!entry)

  if (site) {
    return (
      <div className={compact ? 'space-y-6' : 'space-y-7'}>
        <CurrentSiteCard site={site} />

        <SidebarGroup
          title="Analytics"
          items={siteAnalyticsNav}
          pathname={pathname}
          buildHref={(itemHref) => buildAnalyticsHref(siteId as string, itemHref)}
          onNavigate={onNavigate}
        />

        <SidebarGroup
          title="Operations"
          items={siteOperationsNav}
          pathname={pathname}
          buildHref={(itemHref) => buildAnalyticsHref(siteId as string, itemHref)}
          onNavigate={onNavigate}
        />

        <SidebarGroup
          title="Setup"
          items={siteSetupNav}
          pathname={pathname}
          buildHref={(itemHref) => buildSetupHref(siteId as string, itemHref)}
          onNavigate={onNavigate}
        />

        <div className="rounded-lg border border-app-line bg-slate-50 px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-app-strong">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Environment
          </div>
          <div className="space-y-2 text-sm text-app-muted">
            <div className="flex items-center justify-between">
              <span>API</span>
              <span className="text-app-strong">localhost:8080</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Dashboard</span>
              <span className="text-app-strong">localhost:3000</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {pinnedSites.length > 0 && (
        <div>
          <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
            Pinned Websites
          </div>
          <div className="space-y-2">
            {pinnedSites.slice(0, 4).map((connectedSite) => (
              <SiteDirectoryRow
                key={`pinned-${connectedSite.id}`}
                site={connectedSite}
                pinned
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
          Connected Websites
        </div>
        {loadingSites ? (
          <div className="space-y-2">
            <div className="h-10 rounded-md bg-slate-100" />
            <div className="h-10 rounded-md bg-slate-100" />
            <div className="h-10 rounded-md bg-slate-100" />
          </div>
        ) : sites.length > 0 ? (
          <div className="space-y-2">
            {sites.slice(0, 8).map((connectedSite) => (
              <SiteDirectoryRow
                key={connectedSite.id}
                site={connectedSite}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-app-line bg-slate-50 px-4 py-6 text-sm text-app-muted">
            No connected websites yet.
          </div>
        )}
      </div>

      <Link href="/dashboard/sites" className="btn-secondary w-full justify-between" onClick={onNavigate}>
        Go to site registry
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

function CurrentSiteCard({ site }: { site: Site }) {
  const { state: trackingState, badgeClass } = getTrackingBadgeClass(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at

  return (
    <div className="rounded-lg border border-app-line bg-slate-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-app-strong">{site.domain}</div>
          <div className="mt-1 text-xs text-app-muted">{site.name}</div>
        </div>
        <span className={badgeClass}>{trackingState.label}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-white px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-soft">Status</div>
          <div className="mt-1 text-sm font-medium text-app-strong">{trackingState.detail}</div>
        </div>
        <div className="rounded-md bg-white px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-soft">Last Signal</div>
          <div className="mt-1 text-sm font-medium text-app-strong">{formatRelativeTimeLabel(lastSignal)}</div>
        </div>
      </div>
    </div>
  )
}

function SidebarGroup({
  title,
  items,
  pathname,
  buildHref,
  onNavigate,
}: {
  title: string
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>
  pathname: string
  buildHref: (href: string) => string
  onNavigate?: () => void
}) {
  return (
    <div>
      <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
        {title}
      </div>
      <nav className="space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon
          const href = buildHref(item.href)
          const isActive = pathname === href

          return (
            <Link
              key={href}
              href={href}
              className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-idle'}`}
              onClick={onNavigate}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function TopNav({
  pathname,
  siteId,
  currentSite,
  sites,
  loadingSites,
  page,
  onOpenMobileNav,
}: {
  pathname: string
  siteId: string | null
  currentSite: Site | null
  sites: Site[]
  loadingSites: boolean
  page: { title: string; description: string }
  onOpenMobileNav: () => void
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentSiteIds, setRecentSiteIds] = useState<string[]>([])
  const [pinnedSiteIds, setPinnedSiteIds] = useState<string[]>([])
  const [highlightedSiteId, setHighlightedSiteId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    setRecentSiteIds(JSON.parse(window.localStorage.getItem(RECENT_SITES_KEY) || '[]'))
    setPinnedSiteIds(JSON.parse(window.localStorage.getItem(PINNED_SITES_KEY) || '[]'))
  }, [siteId, open])

  useEffect(() => {
    if (!open) {
      return
    }

    searchRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const filteredSites = sites.filter((site) => {
    const haystack = `${site.name} ${site.domain}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })

  const recentSites = recentSiteIds
    .map((recentId) => sites.find((site) => site.id === recentId))
    .filter((site): site is Site => !!site)

  const pinnedSites = pinnedSiteIds
    .map((pinnedId) => sites.find((site) => site.id === pinnedId))
    .filter((site): site is Site => !!site)

  const recentOnlySites = useMemo(
    () => recentSites.filter((site) => !pinnedSiteIds.includes(site.id)),
    [pinnedSiteIds, recentSites]
  )

  const allWebsiteSites = useMemo(() => {
    if (query) {
      return filteredSites
    }

    const excludedIds = new Set([...pinnedSiteIds, ...recentOnlySites.map((site) => site.id)])
    return filteredSites.filter((site) => !excludedIds.has(site.id))
  }, [filteredSites, pinnedSiteIds, query, recentOnlySites])

  const visibleSites = useMemo(
    () => (query ? filteredSites : [...pinnedSites, ...recentOnlySites, ...allWebsiteSites]),
    [allWebsiteSites, filteredSites, pinnedSites, query, recentOnlySites]
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setHighlightedSiteId(visibleSites[0]?.id ?? null)
  }, [open, query, visibleSites])

  const handleSelectSite = (nextSiteId: string) => {
    const nextHref = resolveSiteRoute(pathname, nextSiteId)
    setOpen(false)
    router.push(nextHref)
  }

  const togglePinnedSite = (targetSiteId: string) => {
    if (typeof window === 'undefined') {
      return
    }

    const next = pinnedSiteIds.includes(targetSiteId)
      ? pinnedSiteIds.filter((id) => id !== targetSiteId)
      : [targetSiteId, ...pinnedSiteIds.filter((id) => id !== targetSiteId)].slice(0, 8)

    setPinnedSiteIds(next)
    window.localStorage.setItem(PINNED_SITES_KEY, JSON.stringify(next))
  }

  const handleSiteRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, targetSiteId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectSite(targetSiteId)
    }
  }

  const moveHighlight = (direction: 1 | -1) => {
    if (visibleSites.length === 0) {
      return
    }

    const currentIndex = visibleSites.findIndex((site) => site.id === highlightedSiteId)
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + direction + visibleSites.length) % visibleSites.length

    setHighlightedSiteId(visibleSites[nextIndex].id)
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
      return
    }

    if (event.key === 'Enter' && highlightedSiteId) {
      event.preventDefault()
      handleSelectSite(highlightedSiteId)
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-app-line bg-app/95 backdrop-blur">
      <div className="flex min-h-20 items-center justify-between gap-4 px-5 py-4 md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" onClick={onOpenMobileNav} className="icon-button xl:hidden">
            <Menu className="h-4 w-4" />
          </button>

          <div className="relative min-w-0 flex-1 sm:min-w-[320px] sm:max-w-[460px]">
            <button onClick={() => setOpen((value) => !value)} className="site-switcher-trigger">
              <div className="min-w-0 text-left">
                <div className="truncate text-sm font-semibold text-app-strong">
                  {currentSite ? currentSite.domain : loadingSites ? 'Loading websites...' : 'Select website'}
                </div>
                <div className="mt-0.5 truncate text-xs text-app-muted">
                  {currentSite ? currentSite.name : `${sites.length} connected website${sites.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 text-app-soft transition ${open ? 'rotate-90' : ''}`} />
            </button>

            {open && (
              <div className="site-switcher-panel">
                <div className="border-b border-app-line p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search websites..."
                      className="input pl-9"
                    />
                  </div>
                </div>

                <div className="max-h-[380px] overflow-y-auto p-2">
                  {!query && pinnedSites.length > 0 && (
                    <div className="pb-2">
                      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                        Pinned Websites
                      </div>
                      <div className="space-y-1">
                        {pinnedSites.slice(0, 4).map((site) => {
                          return (
                            <SiteSwitcherOption
                              key={`pinned-${site.id}`}
                              site={site}
                              active={site.id === siteId}
                              pinned
                              highlighted={site.id === highlightedSiteId}
                              onSelect={() => handleSelectSite(site.id)}
                              onTogglePinned={() => togglePinnedSite(site.id)}
                              onKeyDown={(event) => handleSiteRowKeyDown(event, site.id)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {!query && recentOnlySites.length > 0 && (
                    <div className="pb-2">
                      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                        Recent Websites
                      </div>
                      <div className="space-y-1">
                        {recentOnlySites.slice(0, 4).map((site) => {
                          return (
                            <SiteSwitcherOption
                              key={`recent-${site.id}`}
                              site={site}
                              active={site.id === siteId}
                              pinned={pinnedSiteIds.includes(site.id)}
                              highlighted={site.id === highlightedSiteId}
                              onSelect={() => handleSelectSite(site.id)}
                              onTogglePinned={() => togglePinnedSite(site.id)}
                              onKeyDown={(event) => handleSiteRowKeyDown(event, site.id)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                    All Websites
                  </div>
                  <div className="space-y-1">
                    {allWebsiteSites.map((site) => {
                    return (
                      <SiteSwitcherOption
                        key={site.id}
                        site={site}
                        active={site.id === siteId}
                        pinned={pinnedSiteIds.includes(site.id)}
                        highlighted={site.id === highlightedSiteId}
                        onSelect={() => handleSelectSite(site.id)}
                        onTogglePinned={() => togglePinnedSite(site.id)}
                        onKeyDown={(event) => handleSiteRowKeyDown(event, site.id)}
                      />
                    )
                    })}
                    {visibleSites.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-app-muted">No websites match this search.</div>
                    )}
                  </div>
                </div>

                <div className="border-t border-app-line p-2">
                  <Link href="/dashboard/sites" className="site-switcher-footer" onClick={() => setOpen(false)}>
                    Go to all websites
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-app-subtle px-3 py-1.5 text-xs font-medium text-app-muted 2xl:inline-flex">
            <span>Workspace</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{currentSite ? currentSite.domain : 'Portfolio'}</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden min-w-0 xl:block">
            <div className="text-sm font-semibold text-app-strong">{page.title}</div>
            <div className="truncate text-xs text-app-muted">{page.description}</div>
          </div>

          <div className="flex items-center gap-2">
          {siteId && (
            <>
              <Link href={`/dashboard/sites/${siteId}/api-keys`} className="btn-secondary hidden px-3.5 py-2 md:inline-flex">
                API Keys
              </Link>
              <Link href={`/dashboard/sites/${siteId}/onboarding`} className="btn-secondary hidden px-3.5 py-2 md:inline-flex">
                Setup
              </Link>
            </>
          )}
          <Link href="/dashboard/sites" className="btn-primary px-3.5 py-2">
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Add Site</span>
          </Link>
          <Link href="/dashboard/sites" className="btn-secondary hidden px-3.5 py-2 lg:inline-flex">
            <Settings2 className="mr-1.5 h-4 w-4" />
            Manage Sites
          </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
