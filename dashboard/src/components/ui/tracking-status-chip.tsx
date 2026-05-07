import { StatusChip } from '@/components/ui/status-chip'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'

export function TrackingStatusChip({ site }: { site: Pick<Site, 'tracking_status' | 'tracking_last_checked_at' | 'tracking_last_event_at'> }) {
  const trackingState = getSiteTrackingState(site)

  const tone =
    trackingState.label === 'Active'
      ? 'good'
      : trackingState.label === 'Verified'
        ? 'info'
        : 'warn'

  return <StatusChip label={trackingState.label} tone={tone} />
}
