import type { Site } from '@/lib/types'

type TrackableSite = Pick<
  Site,
  'tracking_status' | 'tracking_last_checked_at' | 'tracking_last_event_at'
>

export type SiteTrackingLabel = 'Pending' | 'Verified' | 'Active'

export type SiteTrackingState = {
  label: SiteTrackingLabel
  badgeClassName: string
  detail: string
}

export function getSiteTrackingState(site: TrackableSite): SiteTrackingState {
  if (site.tracking_last_event_at) {
    return {
      label: 'Active',
      badgeClassName: 'bg-green-100 text-green-800',
      detail: `Last event ${formatTrackingTimestamp(site.tracking_last_event_at)}`,
    }
  }

  if (site.tracking_last_checked_at || site.tracking_status === 'verified') {
    return {
      label: 'Verified',
      badgeClassName: 'bg-blue-100 text-blue-800',
      detail: `Verified ${formatTrackingTimestamp(site.tracking_last_checked_at)}`,
    }
  }

  return {
    label: 'Pending',
    badgeClassName: 'bg-amber-100 text-amber-800',
    detail: 'Waiting for plugin verification',
  }
}

export function getSiteTrackingRank(label: SiteTrackingLabel) {
  switch (label) {
    case 'Active':
      return 0
    case 'Verified':
      return 1
    default:
      return 2
  }
}

function formatTrackingTimestamp(value: string | null) {
  if (!value) {
    return 'recently'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
