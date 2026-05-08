'use client'

import Link from 'next/link'
import { ArrowRight, LifeBuoy, Mail, Store } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { useSiteId } from '@/hooks/use-site-id'

export default function SupportTicketsPage() {
  const siteId = useSiteId()

  return (
    <div className="space-y-6">
      <SectionCard
        title="Support Tickets"
        icon={<LifeBuoy className="h-4 w-4" />}
        action={<StatusChip label="Coming soon" tone="neutral" />}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-app-line bg-slate-50 p-5">
            <div className="text-sm font-semibold text-app-strong">Coming soon scope</div>
            <ul className="mt-3 space-y-2 text-sm text-app-muted">
              <li>Shared inbox by website</li>
              <li>Ticket routing, assignee, priority, SLA</li>
              <li>Customer context linked back to analytics and orders</li>
            </ul>
          </div>
          <div className="rounded-lg border border-app-line bg-slate-50 p-5">
            <div className="text-sm font-semibold text-app-strong">Current best next step</div>
            <p className="mt-3 text-sm text-app-muted">
              Keep using the website workspace and analytics app while we shape the ticket model and operational views.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/dashboard/sites/${siteId}`} className="btn-secondary">
                <Store className="mr-1.5 h-4 w-4" />
                Website home
              </Link>
              <Link href={`/dashboard/${siteId}/overview`} className="btn-primary">
                <ArrowRight className="mr-1.5 h-4 w-4" />
                Open analytics
              </Link>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Cross-app direction"
        icon={<Mail className="h-4 w-4" />}
      >
        <p className="text-sm text-app-muted">
          Ticketing will work best when agents can see traffic source, customer history, and campaign context beside the conversation itself.
        </p>
      </SectionCard>
    </div>
  )
}
