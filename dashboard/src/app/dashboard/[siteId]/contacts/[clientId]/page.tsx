'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeDollarSign,
  Clock3,
  ShoppingBag,
  ShoppingCart,
  UserRound,
} from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { DetailRow } from '@/components/ui/detail-row'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import type { Customer, CustomerDetailResponse, CustomerEvent } from '@/lib/types'

export default function ContactDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const siteId = useSiteId()
  const { clientId } = use(params)
  const [contact, setContact] = useState<Customer | null>(null)
  const [events, setEvents] = useState<CustomerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!contact) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const res = await statsApi.customer(siteId, clientId, 50)
        const data = res.data as CustomerDetailResponse
        if (!cancelled) {
          setContact(data.customer)
          setEvents(data.events)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Contact profile could not be loaded right now.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [clientId, reloadKey, siteId])

  const purchaseEvents = useMemo(
    () => events.filter((event) => event.event_name === 'purchase' || event.order_id),
    [events]
  )

  if (loading && !contact) {
    return <LoadingSpinner className="py-16" />
  }

  if (!contact) {
    return (
      <InlineErrorState
        body={error || 'Contact not found.'}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  return (
    <AnalyticsPage>
      <div className="sticky top-20 z-10 rounded-lg border border-app-line bg-white px-5 py-4 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link href={`/dashboard/${siteId}/contacts`} className="link inline-flex items-center gap-1 text-sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Contacts
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-subtle text-lg font-semibold text-app-strong">
                {(contact.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-app-strong">
                  {contact.email || 'Anonymous contact'}
                </div>
                <div className="truncate text-sm text-app-muted">Client ID {contact.client_id}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={contact.customer_type || 'Profile'} tone="info" />
            <StatusChip label={contact.email ? 'Known identity' : 'Anonymous'} tone={contact.email ? 'good' : 'neutral'} />
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <AnalyticsPageHeader title="Contact Detail" />

      <AnalyticsPageContent>
        {error ? (
          <InlineErrorState
            body={error}
            compact
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <MetricGrid mobileCols={1}>
          <MetricCard icon={<ShoppingBag className="h-4 w-4" />} label="Sessions" value={contact.total_sessions.toLocaleString()} />
          <MetricCard icon={<ShoppingCart className="h-4 w-4" />} label="Orders" value={contact.total_orders.toLocaleString()} />
          <MetricCard icon={<BadgeDollarSign className="h-4 w-4" />} label="Revenue" value={`$${contact.total_revenue.toFixed(2)}`} />
          <MetricCard icon={<UserRound className="h-4 w-4" />} label="LTV" value={`$${contact.ltv.toFixed(2)}`} helper={`AOV $${contact.avg_order_value.toFixed(2)}`} />
        </MetricGrid>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            title="Summary"
            action={<StatusChip label={`${events.length} timeline events`} tone="neutral" />}
          >
            <div className="space-y-4">
              <DetailRow label="Last source" value={contact.last_source || '(direct)'} />
              <DetailRow label="Last medium" value={contact.last_medium || '(none)'} />
              <DetailRow label="Last campaign" value={contact.last_campaign || '(none)'} />
              <DetailRow label="Primary device" value={contact.primary_device || '-'} />
              <DetailRow label="Primary browser" value={contact.primary_browser || '-'} />
            </div>
          </SectionCard>

          <SectionCard title="Identity">
            <div className="space-y-4">
              <DetailRow label="Client ID" value={contact.client_id} />
              <DetailRow label="Email" value={contact.email || '-'} />
              <DetailRow label="User ID" value={contact.user_id || '-'} />
              <DetailRow label="First seen" value={contact.first_seen ? new Date(contact.first_seen).toLocaleString() : '-'} />
              <DetailRow label="Last seen" value={contact.last_seen ? new Date(contact.last_seen).toLocaleString() : '-'} />
            </div>
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <SectionCard
            title="Orders"
            action={<StatusChip label={`${purchaseEvents.length} order events`} tone="good" />}
          >
            {purchaseEvents.length > 0 ? (
              <div className="space-y-3">
                {purchaseEvents.map((event, index) => (
                  <div key={`${event.order_id}-${event.event_time}-${index}`} className="rounded-lg border border-app-line bg-white px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-app-strong">
                          Order {event.order_id || 'Purchase event'}
                        </div>
                        <div className="mt-1 text-xs text-app-muted">
                          {event.product_name || event.path || 'Purchase captured'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusChip label={event.currency || 'USD'} tone="neutral" />
                        <StatusChip label={`$${event.revenue.toFixed(2)}`} tone="good" />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-app-muted">
                      {event.event_time ? new Date(event.event_time).toLocaleString() : '-'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<ShoppingCart className="h-12 w-12" />}
                title="No orders yet"
                body="Purchase events for this contact will appear here once revenue-bearing activity is recorded."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Timeline"
            action={<StatusChip label={`${events.length} events`} tone="neutral" />}
          >
            {events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event, index) => (
                  <div key={`${event.event_name}-${event.event_time}-${index}`} className="rounded-lg border border-app-line bg-white px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip label={event.event_name} tone="info" />
                          {event.order_id ? <StatusChip label={`Order ${event.order_id}`} tone="good" /> : null}
                        </div>
                        <div className="mt-2 truncate text-sm font-medium text-app-strong">
                          {event.path || event.product_name || '-'}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-app-muted">
                          <span>Source: {event.source || '(direct)'}</span>
                          <span>Medium: {event.medium || '(none)'}</span>
                          <span>Campaign: {event.campaign || '(none)'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-app-muted">
                        <Clock3 className="h-3.5 w-3.5" />
                        {event.event_time ? new Date(event.event_time).toLocaleString() : '-'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Clock3 className="h-12 w-12" />}
                title="No recent activity"
                body="Timeline events will appear once this contact has tracked browsing or commerce activity."
              />
            )}
          </SectionCard>
        </div>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
