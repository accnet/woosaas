import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'

type AppTone = 'neutral' | 'info' | 'good' | 'warn'

export type WebsiteAppStatus = {
  key: 'analytics' | 'orders' | 'contacts'
  title: string
  label: string
  tone: AppTone
  description: string
  href: string
}

export type WorkspaceAppSummary = {
  key: 'analytics' | 'orders' | 'contacts'
  title: string
  label: string
  tone: AppTone
  detail: string
}

export function getWebsiteAppStatuses(site: Site): WebsiteAppStatus[] {
  const trackingState = getSiteTrackingState(site)

  const analyticsStatus =
    trackingState.label === 'Active'
      ? {
          label: 'Live',
          tone: 'good' as const,
          description: 'Receiving events and ready for day-to-day reporting.',
        }
      : trackingState.label === 'Verified'
        ? {
            label: 'Connected',
            tone: 'info' as const,
            description: 'Verified and ready, but not yet actively streaming production events.',
          }
        : {
            label: 'Needs setup',
            tone: 'warn' as const,
            description: 'Finish onboarding before the analytics app becomes operational.',
          }

  return [
    {
      key: 'analytics',
      title: 'Analytics',
      label: analyticsStatus.label,
      tone: analyticsStatus.tone,
      description: analyticsStatus.description,
      href: `/dashboard/${site.id}/overview`,
    },
    {
      key: 'orders',
      title: 'Orders',
      label: 'Available',
      tone: 'good',
      description: 'Canonical WooCommerce order directory, detail views, and commerce sync state.',
      href: `/dashboard/${site.id}/orders`,
    },
    {
      key: 'contacts',
      title: 'Contacts',
      label: 'Available',
      tone: 'info',
      description: 'Customer and contact directory driven by commerce and event identity.',
      href: `/dashboard/${site.id}/contacts`,
    },
  ]
}

export function getWorkspaceAppSummaries(sites: Site[]): WorkspaceAppSummary[] {
  const activeCount = sites.filter((site) => getSiteTrackingState(site).label === 'Active').length
  const connectedCount = sites.filter((site) => getSiteTrackingState(site).label !== 'Pending').length

  return [
    {
      key: 'analytics',
      title: 'Analytics',
      label: `${activeCount} live`,
      tone: activeCount > 0 ? 'good' : 'warn',
      detail:
        connectedCount > 0
          ? `${connectedCount} website${connectedCount === 1 ? '' : 's'} connected to the analytics app`
          : 'No websites connected yet',
    },
    {
      key: 'orders',
      title: 'Orders',
      label: 'Live',
      tone: 'good',
      detail: 'Canonical order app is available for synced commerce data',
    },
    {
      key: 'contacts',
      title: 'Contacts',
      label: 'Live',
      tone: 'info',
      detail: 'Contact app is available for customer and commerce identity views',
    },
  ]
}
