'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Globe, Plus } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getWebsiteAppStatuses } from '@/lib/site-apps'
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

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-app-strong">Websites</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-app-muted">
            <span>{sites.length} total</span>
            {activeSites > 0 && (
              <>
                <span className="text-app-line">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <Activity className="h-3.5 w-3.5" />
                  {activeSites} live
                </span>
              </>
            )}
            {needsAttentionSites.length > 0 && (
              <>
                <span className="text-app-line">·</span>
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {needsAttentionSites.length} need attention
                </span>
              </>
            )}
          </div>
        </div>
        <Link href="/dashboard/sites" className="btn-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          New website
        </Link>
      </div>

      {/* Needs attention banner */}
      {needsAttentionSites.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {needsAttentionSites.length} website{needsAttentionSites.length === 1 ? '' : 's'} need attention
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsAttentionSites.slice(0, 6).map((site) => (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:border-amber-300"
              >
                <Globe className="h-3.5 w-3.5" />
                {site.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Website grid */}
      <SectionCard title="Website Workspaces" icon={<Globe className="h-4 w-4" />}>
        {loadingSites ? (
          <LoadingSpinner className="py-16" />
        ) : sites.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-7 w-7" />}
            title="No websites yet"
            body="Add the first website to start collecting analytics and managing your workspace."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {sites.map((site) => (
              <WorkspaceSiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function WorkspaceSiteCard({ site }: { site: Site }) {
  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const apps = getWebsiteAppStatuses(site)

  return (
    <div className="flex flex-col rounded-xl border border-app-line bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-app-subtle text-app-strong">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-app-strong">{site.name}</div>
            <div className="truncate text-xs text-app-muted">{site.domain}</div>
          </div>
        </div>
        <TrackingStatusChip site={site} />
      </div>

      {/* Last signal */}
      <div className="mt-4 flex items-center gap-1.5 text-xs text-app-muted">
        <Activity className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {trackingState.detail} · last signal {formatRelativeTimeLabel(lastSignal)}
        </span>
      </div>

      {/* App status pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {apps.map((app) => (
          <StatusChip key={app.key} label={`${app.title}: ${app.label}`} tone={app.tone} />
        ))}
      </div>

      {/* Actions */}
      <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
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
