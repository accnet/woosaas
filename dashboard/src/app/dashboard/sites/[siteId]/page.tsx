'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, ArrowRight, KeyRound, Mail, ReceiptText, Settings2, ShieldCheck, Store, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import { sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'

type WebsiteApp = {
  title: string
  description: string
  href: string
  icon: ReactNode
  status: 'active' | 'comingSoon'
  cta: string
}

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

  const apps: WebsiteApp[] = [
    {
      title: 'Analytics',
      description: 'Traffic, content, commerce, and customer analytics for this website.',
      href: `/dashboard/${site.id}/overview`,
      icon: <Activity className="h-5 w-5" />,
      status: 'active',
      cta: 'Open analytics',
    },
    {
      title: 'Orders',
      description: 'Canonical WooCommerce order directory and order detail workspace.',
      href: `/dashboard/${site.id}/orders`,
      icon: <ReceiptText className="h-5 w-5" />,
      status: 'active',
      cta: 'Open orders',
    },
    {
      title: 'Contacts',
      description: 'Contact and customer directory anchored to event and commerce identity.',
      href: `/dashboard/${site.id}/contacts`,
      icon: <Users className="h-5 w-5" />,
      status: 'active',
      cta: 'Open contacts',
    },
  ]

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="card px-6 py-6">
          <div className="panel-header">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-app-subtle px-3 py-1 text-xs font-medium text-app-muted">
                <Store className="h-3.5 w-3.5" />
                Website workspace
              </div>
              <h2 className="text-2xl font-semibold text-app-strong">{site.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-app-muted">
                Manage the apps attached to this website and keep setup, access, and analytics in one place.
              </p>
            </div>
            <TrackingStatusChip site={site} />
          </div>

          <div className="metric-grid">
            <MetricCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Tracking"
              value={trackingState.label}
              helper={trackingState.detail}
              tone={trackingState.label === 'Active' ? 'good' : trackingState.label === 'Pending' ? 'warn' : 'neutral'}
            />
            <MetricCard
              icon={<Activity className="h-4 w-4" />}
              label="Last Signal"
              value={formatRelativeTimeLabel(lastSignal)}
              helper="Most recent event or verification check"
            />
            <MetricCard
              icon={<Settings2 className="h-4 w-4" />}
              label="Timezone"
              value={site.timezone || 'UTC'}
              helper="Default reporting timezone"
            />
            <MetricCard
              icon={<KeyRound className="h-4 w-4" />}
              label="Currency"
              value={site.currency || 'USD'}
              helper="Store reporting currency"
            />
          </div>
        </div>

        <SectionCard
          title="Next Actions"
          icon={<ArrowRight className="h-4 w-4" />}
        >
          <div className="space-y-2">
            <Link href={`/dashboard/${site.id}/overview`} className="site-switcher-footer">
              Open analytics snapshot
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={`/dashboard/sites/${site.id}/onboarding`} className="site-switcher-footer">
              Review onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={`/dashboard/sites/${site.id}/api-keys`} className="site-switcher-footer">
              Manage API keys
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={`/dashboard/teams?siteId=${site.id}`} className="site-switcher-footer">
              Manage team access
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Apps"
        icon={<Store className="h-4 w-4" />}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {apps.map((app) => (
            <div key={app.title} className="rounded-lg border border-app-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-app-subtle text-app-strong">
                  {app.icon}
                </div>
                <StatusChip
                  label={app.status === 'active' ? 'Available' : 'Coming soon'}
                  tone={app.status === 'active' ? 'good' : 'neutral'}
                />
              </div>
              <div className="mt-4 text-base font-semibold text-app-strong">{app.title}</div>
              <p className="mt-2 text-sm text-app-muted">{app.description}</p>
              <div className="mt-5">
                {app.status === 'active' ? (
                  <Link href={app.href} className="btn-secondary w-full justify-between">
                    {app.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button type="button" className="btn-secondary w-full cursor-not-allowed justify-between opacity-65" disabled>
                    {app.cta}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Analytics Foundation"
          icon={<Activity className="h-4 w-4" />}
        >
          <div className="space-y-2 text-sm text-app-muted">
            <p>Keep the existing reports, funnels, health checks, realtime feed, and customer analytics.</p>
            <p>Reorganize navigation around apps first, then analytics sections inside the Analytics app.</p>
          </div>
        </SectionCard>

        <SectionCard
          title="Commerce Apps"
          icon={<Mail className="h-4 w-4" />}
        >
          <div className="space-y-2 text-sm text-app-muted">
            <p>Orders and Contacts now sit as app surfaces next to Analytics in the website workspace.</p>
            <p>Additional apps can still be layered later without mixing commerce directories back into Analytics navigation.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
