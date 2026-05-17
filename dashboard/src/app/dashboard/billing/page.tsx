'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CreditCard, Database, Globe2, PackageCheck } from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { billingApi, getApiErrorMessage } from '@/lib/api'
import type { BillingUsage } from '@/lib/types'

export default function TenantBillingPage() {
  const [usage, setUsage] = useState<BillingUsage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const res = await billingApi.usage()
        if (!cancelled) setUsage(res.data)
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Billing usage could not be loaded.'))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!usage && !error) return <LoadingSpinner className="py-16" />

  return (
    <div className="space-y-6">
      {error ? <InlineErrorState body={error} compact={!!usage} /> : null}
      {usage ? (
        <>
          <SectionCard title="Current Plan" icon={<CreditCard className="h-4 w-4" />}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-app-primary">{usage.plan.name}</div>
                <div className="mt-1 text-sm text-app-muted">
                  {usage.subscription.status} · {usage.period}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-app-primary">
                  ${(usage.plan.price_cents / 100).toFixed(0)}
                </div>
                <div className="text-sm text-app-muted">per month</div>
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UsagePanel icon={<Globe2 className="h-4 w-4" />} label="Sites" helperText="Active now" used={usage.sites.used} limit={usage.sites.limit} />
            <UsagePanel icon={<Database className="h-4 w-4" />} label="Events" helperText="This month" used={usage.events.used} limit={usage.events.limit} />
            <UsagePanel icon={<PackageCheck className="h-4 w-4" />} label="Tracking orders" helperText="This month" used={usage.tracking_orders.used} limit={usage.tracking_orders.limit} />
          </div>
        </>
      ) : null}
    </div>
  )
}

function UsagePanel({ icon, label, helperText, used, limit }: { icon: ReactNode; label: string; helperText: string; used: number; limit: number }) {
  const unlimited = limit < 0
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  return (
    <SectionCard title={label} icon={icon}>
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-app-primary">{used.toLocaleString()}</div>
            <div className="text-xs text-app-muted">{helperText}</div>
          </div>
          <div className="text-sm text-app-muted">{unlimited ? 'Unlimited' : `of ${limit.toLocaleString()}`}</div>
        </div>
        {!unlimited ? (
          <div className="h-2 rounded-full bg-app-border">
            <div className="h-2 rounded-full bg-app-accent" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}
