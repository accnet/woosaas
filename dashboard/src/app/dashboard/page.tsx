'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, AlertTriangle, Globe, Plus } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { useUserSettings } from '@/lib/settings-context'
import { getWebsiteAppStatuses } from '@/lib/site-apps'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'
import { useAuthStore } from '@/store/auth'

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { settings, loading: loadingSettings } = useUserSettings()
  const [sites, setSites] = useState<Site[]>([])
  const [loadingSites, setLoadingSites] = useState(true)

  useEffect(() => {
    const loadSites = async () => {
      try {
        const res = await sitesApi.list()
        setSites(res.data)
      } catch (err) {
        console.error('Failed to load dashboard sites', err)
      } finally {
        setLoadingSites(false)
      }
    }

    void loadSites()
  }, [])

  useEffect(() => {
    if (!loadingSettings && settings.landing_page === 'sites') {
      router.replace('/dashboard/sites')
    }
  }, [loadingSettings, router, settings.landing_page])

  const activeSites = sites.filter((site) => getSiteTrackingState(site).label === 'Active').length

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

  const getGreeting = () => {
    const hours = new Date().getHours()
    if (hours < 12) return 'Good morning'
    if (hours < 18) return 'Good afternoon'
    return 'Good evening'
  }

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Premium Greeting Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-violet-50/40 border border-indigo-100/50 p-6 shadow-[0_4px_24px_rgba(99,102,241,0.02)]">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-500/5 blur-2xl" />
        <div className="absolute -right-5 -bottom-10 h-32 w-32 rounded-full bg-violet-500/5 blur-xl" />
        
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-indigo-950">{getGreeting()}, {user?.name || 'Admin'}</h1>
            <p className="mt-1 text-sm text-indigo-900/70 font-medium">Welcome back! Here is a summary of your connected ecommerce channels.</p>
            
            <div className="mt-4 flex flex-wrap items-center gap-3.5 text-xs font-semibold text-indigo-900/80 bg-white/70 backdrop-blur-sm rounded-xl px-4 py-2 border border-indigo-100/20 w-fit shadow-[0_2px_8px_rgba(99,102,241,0.02)]">
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-indigo-500" />
                {sites.length} total website{sites.length === 1 ? '' : 's'}
              </span>
              {activeSites > 0 && (
                <>
                  <span className="h-3 w-px bg-indigo-100" />
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    {activeSites} live synchronization{activeSites === 1 ? '' : 's'}
                  </span>
                </>
              )}
              {needsAttentionSites.length > 0 && (
                <>
                  <span className="h-3 w-px bg-indigo-100" />
                  <span className="flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="h-4 w-4 text-amber-500 animate-bounce" />
                    {needsAttentionSites.length} action required
                  </span>
                </>
              )}
            </div>
          </div>
          
          <Link href="/dashboard/sites" className="btn-primary shrink-0 self-center">
            <Plus className="mr-1.5 h-4 w-4" />
            New website
          </Link>
        </div>
      </div>

      {/* Needs attention banner */}
      {needsAttentionSites.length > 0 && (
        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/70 to-orange-50/20 p-5 shadow-[0_4px_16px_rgba(245,158,11,0.02)] animate-slide-up">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
            <span>{needsAttentionSites.length} website{needsAttentionSites.length === 1 ? '' : 's'} require immediate attention</span>
          </div>
          <p className="mt-1 text-xs text-amber-800/80 font-medium">These sites are pending connection setup or haven't sent signal updates in a while.</p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {needsAttentionSites.slice(0, 6).map((site) => (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-white px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm transition-all duration-200 hover:bg-amber-50 hover:border-amber-300"
              >
                <Globe className="h-3.5 w-3.5 text-amber-500" />
                <span>{site.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Website grid */}
      <SectionCard title="Websites" icon={<Globe className="h-4 w-4 text-indigo-500" />}>
        {loadingSites ? (
          <LoadingSpinner className="py-16" />
        ) : sites.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-7 w-7" />}
            title="No websites yet"
            body="Add the first website to start collecting analytics and managing your sites."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {sites.map((site) => (
              <DashboardSiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function DashboardSiteCard({ site }: { site: Site }) {
  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const apps = getWebsiteAppStatuses(site)

  return (
    <div className="card group relative overflow-hidden flex flex-col p-6 hover:scale-[1.01]">
      {/* Decorative top color stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-60" />
      
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100/80 transition-colors duration-300">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-app-strong group-hover:text-indigo-950 transition-colors duration-300">{site.name}</div>
            <div className="truncate text-xs text-app-muted font-medium mt-0.5">{site.domain}</div>
          </div>
        </div>
        <TrackingStatusChip site={site} />
      </div>

      {/* Signal metadata */}
      <div className="mt-5 flex items-center gap-2 text-xs text-app-muted bg-slate-50/50 rounded-lg px-2.5 py-1.5 border border-slate-100/50">
        <Activity className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate font-medium">
          {trackingState.detail} · last signal {formatRelativeTimeLabel(lastSignal)}
        </span>
      </div>

      {/* App status pills */}
      <div className="mt-4 flex-1">
        <div className="text-[10px] font-bold text-app-soft uppercase tracking-wider mb-2">Integration Streams</div>
        <div className="flex flex-wrap gap-1.5">
          {apps.map((app) => (
            <StatusChip key={app.key} label={`${app.title}: ${app.label}`} tone={app.tone} />
          ))}
        </div>
      </div>

      {/* Action panel */}
      <div className="mt-6 flex gap-2 border-t border-slate-100/60 pt-4">
        <Link href={`/dashboard/sites/${site.id}`} className="btn-primary text-xs !px-4 !py-2 font-bold">
          Configure
        </Link>
        <Link href={`/dashboard/${site.id}/overview`} className="btn-secondary text-xs !px-4 !py-2 font-bold">
          Analytics
        </Link>
        <Link href={`/dashboard/${site.id}/orders`} className="btn-secondary text-xs !px-4 !py-2 font-bold">
          Orders
        </Link>
      </div>
    </div>
  )
}
