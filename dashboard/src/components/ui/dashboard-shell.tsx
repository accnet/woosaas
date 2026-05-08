'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronsUpDown, LogOut, Menu, Star, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { SearchInput } from '@/components/ui/search-input'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { appNav, buildAnalyticsHref, buildSetupHref, getAppHref, getCurrentSiteId, resolveSiteRoute, siteAcquisitionNav, siteAnalyticsNav, siteAppsNav, siteCommerceNav, siteOperationsNav, siteSetupNav } from '@/lib/navigation'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'
import { useAuthStore } from '@/store/auth'

const RECENT_SITES_KEY = 'woosaas-recent-sites'
const PINNED_SITES_KEY = 'woosaas-pinned-sites'
const APP_RAIL_EXPANDED_KEY = 'woosaas-app-rail-expanded'

function SiteSwitcherOption({
  site,
  active,
  pinned,
  highlighted,
  onSelect,
  onTogglePinned,
  onKeyDown,
  rowRef,
}: {
  site: Site
  active: boolean
  pinned: boolean
  highlighted: boolean
  onSelect: () => void
  onTogglePinned: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  rowRef?: (node: HTMLDivElement | null) => void
}) {
  const state = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at

  return (
    <div
      ref={rowRef}
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
          <TrackingStatusChip site={site} />
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
  const state = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at

  return (
    <Link href={`/dashboard/sites/${site.id}`} className="site-list-row" onClick={onNavigate}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-medium text-app-strong">{site.name}</div>
          <div className="flex shrink-0 items-center gap-2">
            {pinned && <Star className="h-4 w-4 fill-current text-amber-500" />}
            <TrackingStatusChip site={site} />
          </div>
        </div>
        <div className="truncate text-xs text-app-muted">{site.domain}</div>
        <div className="mt-1 truncate text-[11px] text-app-soft">Last signal {formatRelativeTimeLabel(lastSignal)}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-app-soft" />
    </Link>
  )
}

function SiteSwitcherControl({
  pathname,
  siteId,
  currentSite,
  sites,
  loadingSites,
}: {
  pathname: string
  siteId: string | null
  currentSite: Site | null
  sites: Site[]
  loadingSites: boolean
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement | null>(null)
  const switcherRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
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

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && switcherRef.current && !switcherRef.current.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
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

  const recentOnlySites = recentSites.filter((site) => !pinnedSiteIds.includes(site.id))

  const allWebsiteSites = query
    ? filteredSites
    : filteredSites.filter((site) => {
        const excludedIds = new Set([...pinnedSiteIds, ...recentOnlySites.map((entry) => entry.id)])
        return !excludedIds.has(site.id)
      })

  const visibleSites = query ? filteredSites : [...pinnedSites, ...recentOnlySites, ...allWebsiteSites]

  useEffect(() => {
    if (!open) {
      return
    }

    setHighlightedSiteId(visibleSites[0]?.id ?? null)
  }, [open, query, visibleSites])

  useEffect(() => {
    if (!open || !highlightedSiteId) {
      return
    }

    rowRefs.current[highlightedSiteId]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedSiteId, open])

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
      currentIndex === -1 ? 0 : (currentIndex + direction + visibleSites.length) % visibleSites.length

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
    <div ref={switcherRef} className="relative w-full">
      <button onClick={() => setOpen((value) => !value)} className="site-switcher-trigger">
        <div className="min-w-0 text-left">
          <div className="truncate text-lg font-semibold text-app-strong">
            {currentSite ? currentSite.domain : loadingSites ? 'Loading websites...' : 'Select website'}
          </div>
          <div className="sr-only">
            {currentSite ? currentSite.name : `${sites.length} connected website${sites.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-app-soft" />
      </button>

      {open && (
        <div className="site-switcher-panel">
          <div className="border-b border-app-line p-3">
            <SearchInput
              inputRef={searchRef}
              value={query}
              onChange={setQuery}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search websites..."
            />
          </div>

          <div className="max-h-[380px] overflow-y-auto p-2">
            {!query && pinnedSites.length > 0 && (
              <div className="pb-2">
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                  Pinned Websites
                </div>
                <div className="space-y-1">
                  {pinnedSites.slice(0, 4).map((site) => (
                    <SiteSwitcherOption
                      key={`pinned-${site.id}`}
                      site={site}
                      active={site.id === siteId}
                      pinned
                      highlighted={site.id === highlightedSiteId}
                      rowRef={(node) => {
                        rowRefs.current[site.id] = node
                      }}
                      onSelect={() => handleSelectSite(site.id)}
                      onTogglePinned={() => togglePinnedSite(site.id)}
                      onKeyDown={(event) => handleSiteRowKeyDown(event, site.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {!query && recentOnlySites.length > 0 && (
              <div className="pb-2">
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                  Recent Websites
                </div>
                <div className="space-y-1">
                  {recentOnlySites.slice(0, 4).map((site) => (
                    <SiteSwitcherOption
                      key={`recent-${site.id}`}
                      site={site}
                      active={site.id === siteId}
                      pinned={pinnedSiteIds.includes(site.id)}
                      highlighted={site.id === highlightedSiteId}
                      rowRef={(node) => {
                        rowRefs.current[site.id] = node
                      }}
                      onSelect={() => handleSelectSite(site.id)}
                      onTogglePinned={() => togglePinnedSite(site.id)}
                      onKeyDown={(event) => handleSiteRowKeyDown(event, site.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
              All Websites
            </div>
            <div className="space-y-1">
              {allWebsiteSites.map((site) => (
                <SiteSwitcherOption
                  key={site.id}
                  site={site}
                  active={site.id === siteId}
                  pinned={pinnedSiteIds.includes(site.id)}
                  highlighted={site.id === highlightedSiteId}
                  rowRef={(node) => {
                    rowRefs.current[site.id] = node
                  }}
                  onSelect={() => handleSelectSite(site.id)}
                  onTogglePinned={() => togglePinnedSite(site.id)}
                  onKeyDown={(event) => handleSiteRowKeyDown(event, site.id)}
                />
              ))}
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
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [sites, setSites] = useState<Site[]>([])
  const [loadingSites, setLoadingSites] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [appRailExpanded, setAppRailExpanded] = useState(false)
  const currentSiteId = useMemo(() => getCurrentSiteId(pathname), [pathname])
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentSiteId) || null,
    [sites, currentSiteId]
  )

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

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = mobileNavOpen ? 'hidden' : previousOverflow

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setAppRailExpanded(window.localStorage.getItem(APP_RAIL_EXPANDED_KEY) === 'true')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(APP_RAIL_EXPANDED_KEY, String(appRailExpanded))
  }, [appRailExpanded])

  return (
    <div className="min-h-screen bg-app">
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <AppRail
          pathname={pathname}
          currentSiteId={currentSiteId}
          user={user}
          logout={logout}
          expanded={appRailExpanded}
          onToggleExpanded={() => setAppRailExpanded((value) => !value)}
        />
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
            currentSite={currentSite}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          <main className="flex-1 px-5 py-4 md:px-6 md:py-5">{children}</main>
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
  expanded,
  onToggleExpanded,
}: {
  pathname: string
  currentSiteId: string | null
  user: { name?: string | null; email?: string | null } | null
  logout: () => void
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const isRailItemActive = (itemHref: string, href: string) => {
    if (itemHref === '/dashboard') {
      return pathname === '/dashboard'
    }

    if (itemHref === '/dashboard/sites') {
      return pathname === '/dashboard/sites'
    }

    if (itemHref === '/dashboard/sites/[siteId]') {
      return pathname === href
    }

    if (itemHref === '/dashboard/[siteId]/overview') {
      return currentSiteId !== null && pathname.startsWith(`/dashboard/${currentSiteId}/`)
    }

    return pathname === href
  }

  return (
    <aside
      className={`hidden shrink-0 border-r border-app-line bg-app-panel transition-[width] duration-200 xl:flex xl:flex-col ${
        expanded ? 'w-[220px]' : 'w-[72px]'
      }`}
    >
      <div className={`relative flex h-20 items-center border-b border-app-line px-3 ${expanded ? 'justify-between' : 'justify-center'}`}>
        <Link href="/dashboard" className="app-rail-logo" title="Woosaas">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 7l-8 8-4-4-6 6" />
            <path d="M16 7h6v6" />
          </svg>
        </Link>
        {expanded ? (
          <button type="button" onClick={onToggleExpanded} className="app-rail-expand-button" aria-label="Collapse app rail">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="app-rail-expand-button"
            aria-label="Expand app rail"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <nav className="space-y-2">
          {appNav.map((item) => {
            const Icon = item.icon
            const href = getAppHref(item.href, currentSiteId)
            const isActive = isRailItemActive(item.href, href)

            return (
              <Link
                key={`${item.label}-${href}`}
                href={href}
                className={`group relative ${expanded ? 'app-rail-link' : 'app-rail-item'} ${isActive ? 'app-rail-item-active' : 'app-rail-item-idle'}`}
              >
                <Icon className="h-5 w-5" />
                {expanded ? (
                  <span className="truncate text-sm font-medium">{item.label}</span>
                ) : (
                  <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-app-strong px-2.5 py-1.5 text-xs font-medium text-white shadow-card group-hover:block">
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {currentSiteId ? (
          <div className="mt-4 border-t border-app-line pt-4">
            {expanded ? (
              <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">Apps</div>
            ) : null}
            <nav className="space-y-2">
              {siteAppsNav.map((item) => {
                const Icon = item.icon
                const href = getAppHref(item.href, currentSiteId)
                const isActive = isRailItemActive(item.href, href)
                const isComingSoon = item.status === 'comingSoon'
                const className = `group relative ${expanded ? 'app-rail-link' : 'app-rail-item'} ${isComingSoon ? 'app-rail-item-disabled' : isActive ? 'app-rail-item-active' : 'app-rail-item-idle'}`

                const content = (
                  <>
                    <Icon className="h-5 w-5" />
                    {expanded ? (
                      <>
                        <span className="truncate text-sm font-medium">{item.label}</span>
                        <span className="ml-auto rounded-full bg-app-subtle px-1.5 py-0.5 text-[10px] font-semibold text-app-soft">
                          Soon
                        </span>
                      </>
                    ) : (
                      <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-app-strong px-2.5 py-1.5 text-xs font-medium text-white shadow-card group-hover:block">
                        {item.label} - Coming soon
                      </span>
                    )}
                  </>
                )

                return isComingSoon ? (
                  <span
                    key={`site-app-${item.label}-${href}`}
                    className={className}
                    aria-disabled="true"
                    title={`${item.label} - Coming soon`}
                  >
                    {content}
                  </span>
                ) : (
                  <Link
                    key={`site-app-${item.label}-${href}`}
                    href={href}
                    className={className}
                  >
                    <Icon className="h-5 w-5" />
                    {expanded ? (
                      <span className="truncate text-sm font-medium">{item.label}</span>
                    ) : (
                      <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-app-strong px-2.5 py-1.5 text-xs font-medium text-white shadow-card group-hover:block">
                        {item.label}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
        ) : null}
      </div>

      <div className="border-t border-app-line px-3 py-4">
        <div className="space-y-2">
          {expanded ? (
            <div className="flex items-center gap-3 rounded-lg border border-app-line bg-white px-3 py-3">
              <div className="app-rail-user h-10 w-10 shrink-0">{(user?.name || 'U').slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-app-strong">{user?.name || 'User'}</div>
                <div className="truncate text-xs text-app-muted">{user?.email || 'Signed in'}</div>
              </div>
            </div>
          ) : (
            <div className="group relative app-rail-user">
              {(user?.name || 'U').slice(0, 1).toUpperCase()}
              <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-app-strong px-2.5 py-1.5 text-xs font-medium text-white shadow-card group-hover:block">
                {user?.email || 'User'}
              </span>
            </div>
          )}
          <button onClick={logout} className={`${expanded ? 'app-rail-link justify-between' : 'group relative app-rail-item'} app-rail-item-idle w-full`}>
            <LogOut className="h-5 w-5" />
            {expanded ? (
              <span className="text-sm font-medium">Sign out</span>
            ) : (
              <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-app-strong px-2.5 py-1.5 text-xs font-medium text-white shadow-card group-hover:block">
                Sign out
              </span>
            )}
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

  const isMobileAppActive = (itemHref: string, href: string) => {
    if (itemHref === '/dashboard') {
      return pathname === '/dashboard'
    }

    if (itemHref === '/dashboard/sites') {
      return pathname === '/dashboard/sites'
    }

    if (itemHref === '/dashboard/sites/[siteId]') {
      return pathname === href
    }

    if (itemHref === '/dashboard/[siteId]/overview') {
      return currentSiteId !== null && pathname.startsWith(`/dashboard/${currentSiteId}/`)
    }

    return pathname === href
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
            Workspace
          </div>
          <div className="grid grid-cols-2 gap-2">
            {appNav.map((item) => {
              const Icon = item.icon
              const href = getAppHref(item.href, currentSiteId)
              const isActive = isMobileAppActive(item.href, href)

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

          {currentSiteId ? (
            <>
              <div className="pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                Apps
              </div>
              <div className="grid grid-cols-2 gap-2">
                {siteAppsNav.map((item) => {
                  const Icon = item.icon
                  const href = getAppHref(item.href, currentSiteId)
                  const isActive = isMobileAppActive(item.href, href)
                  const isComingSoon = item.status === 'comingSoon'
                  const className = `mobile-app-link ${isComingSoon ? 'mobile-app-link-disabled' : isActive ? 'mobile-app-link-active' : ''}`

                  return isComingSoon ? (
                    <span
                      key={`mobile-site-app-${item.label}-${href}`}
                      className={className}
                      aria-disabled="true"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      <span className="ml-auto rounded-full bg-app-subtle px-1.5 py-0.5 text-[10px] font-semibold text-app-soft">
                        Soon
                      </span>
                    </span>
                  ) : (
                    <Link
                      key={`mobile-site-app-${item.label}-${href}`}
                      href={href}
                      className={className}
                      onClick={onClose}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </>
          ) : null}
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
    <aside className="hidden w-[280px] shrink-0 border-r border-app-line bg-white xl:flex xl:flex-col">
      <div className="border-b border-app-line px-5 py-4">
        <SiteSwitcherControl
          pathname={pathname}
          siteId={siteId}
          currentSite={site}
          sites={sites}
          loadingSites={loadingSites}
        />
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
  const [recentSiteIds, setRecentSiteIds] = useState<string[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    setPinnedSiteIds(JSON.parse(window.localStorage.getItem(PINNED_SITES_KEY) || '[]'))
    setRecentSiteIds(JSON.parse(window.localStorage.getItem(RECENT_SITES_KEY) || '[]'))
  }, [siteId, pathname])

  const matchesQuery = (entry: Site) => {
    if (!query.trim()) {
      return true
    }

    const haystack = `${entry.name} ${entry.domain}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  }

  const pinnedSites = pinnedSiteIds
    .map((pinnedId) => sites.find((entry) => entry.id === pinnedId))
    .filter((entry): entry is Site => !!entry && matchesQuery(entry))

  const recentSites = recentSiteIds
    .map((recentId) => sites.find((entry) => entry.id === recentId))
    .filter((entry): entry is Site => !!entry && !pinnedSiteIds.includes(entry.id) && matchesQuery(entry))

  const connectedSites = sites.filter(
    (entry) => !pinnedSiteIds.includes(entry.id) && !recentSiteIds.includes(entry.id) && matchesQuery(entry)
  )

  if (site) {
    const isAnalyticsApp = pathname.startsWith(`/dashboard/${siteId}/`)

    return (
      <div className={compact ? 'space-y-6' : 'space-y-7'}>
        {isAnalyticsApp ? (
          <>
            <SidebarGroup
              title="Analytics Home"
              items={siteAnalyticsNav}
              pathname={pathname}
              buildHref={(itemHref) => buildAnalyticsHref(siteId as string, itemHref)}
              onNavigate={onNavigate}
            />

            <SidebarGroup
              title="Acquisition"
              items={siteAcquisitionNav}
              pathname={pathname}
              buildHref={(itemHref) => buildAnalyticsHref(siteId as string, itemHref)}
              onNavigate={onNavigate}
            />

            <SidebarGroup
              title="Content & Commerce"
              items={siteCommerceNav}
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
          </>
        ) : null}

        <SidebarGroup
          title="Setup"
          items={siteSetupNav}
          pathname={pathname}
          buildHref={(itemHref) => buildSetupHref(siteId as string, itemHref)}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {sites.length > 6 ? <SearchInput value={query} onChange={setQuery} placeholder="Search websites" /> : null}

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

      {recentSites.length > 0 && (
        <div>
          <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
            Recent Websites
          </div>
          <div className="space-y-2">
            {recentSites.slice(0, 4).map((connectedSite) => (
              <SiteDirectoryRow
                key={`recent-${connectedSite.id}`}
                site={connectedSite}
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
        ) : connectedSites.length > 0 ? (
          <div className="space-y-2">
            {connectedSites.slice(0, 8).map((connectedSite) => (
              <SiteDirectoryRow
                key={connectedSite.id}
                site={connectedSite}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-app-line bg-slate-50 px-4 py-6 text-sm text-app-muted">
            {query ? 'No connected websites match this search.' : 'No connected websites yet.'}
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

function SidebarGroup({
  title,
  items,
  pathname,
  buildHref,
  isItemActive,
  onNavigate,
}: {
  title: string
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>
  pathname: string
  buildHref: (href: string) => string
  isItemActive?: (itemHref: string, href: string) => boolean
  onNavigate?: () => void
}) {
  return (
    <div>
      <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
        {title}
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon
          const href = buildHref(item.href)
          const isActive = isItemActive ? isItemActive(item.href, href) : pathname === href

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
  currentSite,
  onOpenMobileNav,
}: {
  currentSite: Site | null
  onOpenMobileNav: () => void
}) {
  const trackingState = currentSite ? getSiteTrackingState(currentSite) : null
  const lastSignal = currentSite?.tracking_last_event_at || currentSite?.tracking_last_checked_at || currentSite?.created_at

  return (
    <header className="sticky top-0 z-20 border-b border-app-line bg-app/95 backdrop-blur">
      <div className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" onClick={onOpenMobileNav} className="icon-button xl:hidden">
            <Menu className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-4">
          {currentSite && trackingState && lastSignal ? (
            <div className="hidden shrink-0 items-center gap-3 rounded-lg border border-app-line bg-white px-3 py-2 md:flex">
              <TrackingStatusChip site={currentSite} />
              <div className="hidden max-w-[220px] truncate text-xs font-medium text-app-muted 2xl:block">
                {trackingState.detail}
              </div>
              <div className="hidden h-5 w-px bg-slate-200 xl:block" />
              <div className="whitespace-nowrap text-xs text-app-muted">
                Last signal <span className="font-semibold text-app-strong">{formatRelativeTimeLabel(lastSignal)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
