'use client'

import Link from 'next/link'
import { Activity, ArrowRight, Mail, Store, Users } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { useSiteId } from '@/hooks/use-site-id'

export default function EmailCampaignsPage() {
  const siteId = useSiteId()

  return (
    <div className="space-y-6">
      <SectionCard
        title="Email Campaigns"
        description="This app slot is reserved for lifecycle messaging and campaign reporting for the selected website."
        icon={<Mail className="h-4 w-4" />}
        action={<StatusChip label="Coming soon" tone="neutral" />}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-app-line bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-app-strong">
              <Users className="h-4 w-4" />
              Audience
            </div>
            <p className="mt-3 text-sm text-app-muted">Segments, subscriber health, and synced customer profiles.</p>
          </div>
          <div className="rounded-lg border border-app-line bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-app-strong">
              <Mail className="h-4 w-4" />
              Campaigns
            </div>
            <p className="mt-3 text-sm text-app-muted">Broadcasts, journeys, templates, and send operations.</p>
          </div>
          <div className="rounded-lg border border-app-line bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-app-strong">
              <Activity className="h-4 w-4" />
              Reporting
            </div>
            <p className="mt-3 text-sm text-app-muted">Attribution back into the same analytics foundation already active for this website.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/dashboard/sites/${siteId}`} className="btn-secondary">
            <Store className="mr-1.5 h-4 w-4" />
            Website home
          </Link>
          <Link href={`/dashboard/${siteId}/campaigns`} className="btn-primary">
            <ArrowRight className="mr-1.5 h-4 w-4" />
            See analytics campaigns
          </Link>
        </div>
      </SectionCard>
    </div>
  )
}
