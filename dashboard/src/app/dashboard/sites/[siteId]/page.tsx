'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Globe, ReceiptText, Settings, ShieldCheck, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { PlatformIcon } from '@/components/ui/platform-icon'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'

export default function WebsiteHomePage() {
  const siteId = useSiteId()
  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSite = async () => {
      setLoading(true)
      try {
        const res = await sitesApi.get(siteId)
        setSite(res.data)
      } catch (error) {
        console.error('Failed to load site workspace', error)
      } finally {
        setLoading(false)
      }
    }

    void loadSite()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  if (!site) {
    return null
  }

  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const isPending = trackingState.label === 'Pending'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center">
            <PlatformIcon platform={site.platform} size={40} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-app-strong">{site.name}</h1>
              <PlatformIcon platform={site.platform} size={18} />
              <TrackingStatusChip site={site} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-app-muted">
              <span className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {site.domain}
              </span>
              <span className="text-app-line">·</span>
              <span className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                {formatRelativeTimeLabel(lastSignal)}
              </span>
              {site.timezone && (
                <>
                  <span className="text-app-line">·</span>
                  <span>{site.timezone}</span>
                </>
              )}
              {site.currency && (
                <>
                  <span className="text-app-line">·</span>
                  <span>{site.currency}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-secondary text-xs">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Setup
          </Link>
        </div>
      </div>

      {/* Pending tracking banner */}
      {isPending && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-800">Tracking not verified yet</div>
            <p className="mt-0.5 text-sm text-amber-700">{trackingState.detail}</p>
            <Link href={`/dashboard/sites/${site.id}/onboarding`} className="mt-3 inline-flex items-center text-sm font-medium text-amber-800 underline underline-offset-2 hover:no-underline">
              Finish setup
            </Link>
          </div>
        </div>
      )}

      {/* App grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AppCard
          title="Analytics"
          description="Traffic, funnels, revenue, geo, devices, campaigns, and customer analytics."
          href={`/dashboard/${site.id}/overview`}
          icon={<Activity className="h-5 w-5" />}
          tone="emerald"
        />
        <AppCard
          title="Orders"
          description="WooCommerce order directory, order details, refunds, and commerce sync state."
          href={`/dashboard/${site.id}/orders`}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="blue"
        />
        <AppCard
          title="Contacts"
          description="Customer and contact directory anchored to event identity and purchase history."
          href={`/dashboard/${site.id}/contacts`}
          icon={<Users className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <QuickLink href={`/dashboard/${site.id}/realtime`} icon={<Activity className="h-4 w-4" />} label="Realtime" />
        <QuickLink href={`/dashboard/${site.id}/health`} icon={<ShieldCheck className="h-4 w-4" />} label="Pipeline Health" />
        <QuickLink href={`/dashboard/teams?siteId=${site.id}`} icon={<Users className="h-4 w-4" />} label="Team" />
        <QuickLink href={`/dashboard/sites/${site.id}/onboarding`} icon={<Settings className="h-4 w-4" />} label="Setup" />
      </div>
    </div>
  )
}

const TONE_CLASSES: Record<string, { bg: string; icon: string; btn: string }> = {
  emerald: {
    bg: 'bg-emerald-50 border-emerald-100',
    icon: 'bg-emerald-100 text-emerald-700',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  blue: {
    bg: 'bg-blue-50 border-blue-100',
    icon: 'bg-blue-100 text-blue-700',
    btn: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  violet: {
    bg: 'bg-violet-50 border-violet-100',
    icon: 'bg-violet-100 text-violet-700',
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
}

function AppCard({
  title,
  description,
  href,
  icon,
  tone,
}: {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  tone: 'emerald' | 'blue' | 'violet'
}) {
  const t = TONE_CLASSES[tone]
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border p-5 transition hover:shadow-md ${t.bg}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${t.icon}`}>
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-app-strong">{title}</div>
      <p className="mt-1.5 flex-1 text-sm text-app-muted">{description}</p>
      <div className={`mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition ${t.btn}`}>
        Open {title}
      </div>
    </Link>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-app-line bg-white px-4 py-3 text-sm font-medium text-app-strong transition hover:border-slate-300 hover:shadow-sm"
    >
      <span className="text-app-muted">{icon}</span>
      {label}
    </Link>
  )
}

