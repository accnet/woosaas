'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { ArrowLeft, BadgeDollarSign, ShoppingBag, ShoppingCart, UserRound } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { DetailRow } from '@/components/ui/detail-row'
import { EmptyState } from '@/components/ui/empty-state'
import { useSiteId } from '@/hooks/use-site-id'
import { statsApi } from '@/lib/api'
import type { Customer, CustomerEvent, CustomerDetailResponse } from '@/lib/types'

export default function CustomerDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const siteId = useSiteId()
  const { clientId } = use(params)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [events, setEvents] = useState<CustomerEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const res = await statsApi.customer(siteId, clientId, 50)
        const data = res.data as CustomerDetailResponse
        setCustomer(data.customer)
        setEvents(data.events)
      } catch (err) {
        console.error('Failed to load customer profile', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [clientId, siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  if (!customer) {
    return (
      <div className="card p-12 text-center">
        <EmptyState body="Customer not found" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Link
        href={`/dashboard/${siteId}/customers`}
        className="link text-sm inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </Link>

      <div className="card px-6 py-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-app-subtle text-app-strong flex items-center justify-center text-xl font-bold">
            {(customer.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-app-strong">{customer.email || 'Anonymous'}</h1>
            <p className="text-app-muted text-sm">Client ID: {customer.client_id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={<ShoppingBag className="h-4 w-4" />} label="Sessions" value={customer.total_sessions?.toLocaleString() || '0'} />
          <MetricCard icon={<ShoppingCart className="h-4 w-4" />} label="Orders" value={customer.total_orders?.toLocaleString() || '0'} />
          <MetricCard icon={<BadgeDollarSign className="h-4 w-4" />} label="Revenue" value={`$${(customer.total_revenue || 0).toFixed(2)}`} />
          <MetricCard icon={<UserRound className="h-4 w-4" />} label="LTV" value={`$${(customer.ltv || 0).toFixed(2)}`} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="panel-header border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-app-strong">Recent Events</h3>
            <p className="mt-1 text-sm text-app-muted">Last 50 recorded events for this customer.</p>
          </div>
        </div>
        {events.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {events.map((event, i) => (
              <div key={i} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="badge-info">{event.event_name}</span>
                  <span className="text-app-muted">{event.path || '-'}</span>
                </div>
                <div className="flex items-center gap-4">
                  {event.revenue > 0 && (
                    <span className="text-app-muted font-medium">${event.revenue.toFixed(2)}</span>
                  )}
                  <span className="text-app-soft text-xs">{event.event_time ? new Date(event.event_time).toLocaleString() : '-'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState body="No recent events" />
        )}
      </div>

      <div className="card px-6 py-6">
        <h3 className="text-base font-semibold text-app-strong mb-4">Customer Details</h3>
        <div className="space-y-0">
          <DetailRow label="Client ID" value={customer.client_id} />
          <DetailRow label="Email" value={customer.email || '-'} />
          <DetailRow label="First Seen" value={customer.first_seen ? new Date(customer.first_seen).toLocaleString() : '-'} />
          <DetailRow label="Last Seen" value={customer.last_seen ? new Date(customer.last_seen).toLocaleString() : '-'} />
          <DetailRow label="Customer Type" value={customer.customer_type || '-'} />
          <DetailRow label="Device" value={customer.primary_device || '-'} />
          <DetailRow label="Browser" value={customer.primary_browser || '-'} />
        </div>
      </div>
    </div>
  )
}
