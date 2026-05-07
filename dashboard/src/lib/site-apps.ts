import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'

type AppTone = 'neutral' | 'info' | 'good' | 'warn'

export type WebsiteAppStatus = {
  key: 'analytics' | 'supportTickets' | 'emailCampaigns'
  title: string
  label: string
  tone: AppTone
  description: string
  href: string
}

export type WorkspaceAppSummary = {
  key: 'analytics' | 'supportTickets' | 'emailCampaigns'
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
      key: 'supportTickets',
      title: 'Support Tickets',
      label: 'Coming soon',
      tone: 'neutral',
      description: 'Coming soon app surface for shared inbox, ticket routing, and support operations.',
      href: `/dashboard/sites/${site.id}/support-tickets`,
    },
    {
      key: 'emailCampaigns',
      title: 'Email Campaigns',
      label: 'Coming soon',
      tone: 'neutral',
      description: 'Coming soon app surface for audience messaging, journeys, and campaign reporting.',
      href: `/dashboard/sites/${site.id}/email-campaigns`,
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
      key: 'supportTickets',
      title: 'Support Tickets',
      label: 'Coming soon',
      tone: 'neutral',
      detail: 'Will be built after the analytics workspace is stable',
    },
    {
      key: 'emailCampaigns',
      title: 'Email Campaigns',
      label: 'Coming soon',
      tone: 'neutral',
      detail: 'Will be built later on top of website, customer, and analytics context',
    },
  ]
}
