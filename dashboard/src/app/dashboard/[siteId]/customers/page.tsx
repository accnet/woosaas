'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight, DollarSign, ShoppingBag, UserRound, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { statsApi } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { Customer, CustomerListResponse } from '@/lib/types'

export default function CustomersPage() {
  const siteId = useSiteId()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const res = await statsApi.customers(siteId, page, 25)
        const data = res.data as CustomerListResponse
        setCustomers(data.customers)
        setTotalCount(data.total_count)
      } catch (err) {
        console.error('Failed to load customers', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [page, siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const totalPages = Math.ceil(totalCount / 25)
  const totalRevenue = customers.reduce((sum, customer) => sum + (customer.total_revenue || 0), 0)
  const totalOrders = customers.reduce((sum, customer) => sum + (customer.total_orders || 0), 0)
  const totalSessions = customers.reduce((sum, customer) => sum + (customer.total_sessions || 0), 0)

  return (
    <div className="space-y-6">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Customer 360</h2>
          <p className="mt-2 text-sm text-app-muted">
            Browse customer records, order history signals, and detail drill-downs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Users className="h-4 w-4" />} label="Customers" value={totalCount.toLocaleString()} helper="Profiles in the current result set" />
        <MetricCard icon={<ShoppingBag className="h-4 w-4" />} label="Orders" value={totalOrders.toLocaleString()} helper="Orders from listed customers" />
        <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} helper="Attributed revenue from listed customers" />
        <MetricCard icon={<UserRound className="h-4 w-4" />} label="Sessions" value={totalSessions.toLocaleString()} helper="Sessions mapped to listed customers" />
      </div>

      <div className="table-container">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Customer</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Sessions</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Orders</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Avg Order</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">First Seen</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Last Seen</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Detail</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {customers.map((customer, i) => (
              <tr key={customer.client_id || i} className="table-row">
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-subtle text-sm font-medium text-app-strong">
                      {(customer.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-app-strong">{customer.email || 'Anonymous'}</div>
                      <div className="text-xs text-app-soft">ID: {customer.client_id?.slice(0, 8)}...</div>
                    </div>
                  </div>
                </td>
                <td className="table-cell text-right">{customer.total_sessions?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{customer.total_orders?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right font-medium">${(customer.total_revenue || 0).toFixed(2)}</td>
                <td className="table-cell text-right">${(customer.avg_order_value || 0).toFixed(2)}</td>
                <td className="table-cell text-xs text-app-muted">{customer.first_seen ? new Date(customer.first_seen).toLocaleDateString() : '-'}</td>
                <td className="table-cell text-xs text-app-muted">{customer.last_seen ? new Date(customer.last_seen).toLocaleDateString() : '-'}</td>
                <td className="table-cell text-right">
                  {customer.client_id && (
                    <Link
                      href={`/dashboard/${siteId}/customers/${customer.client_id}`}
                      className="btn-ghost px-2.5 py-1 text-xs"
                    >
                      View
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && (
          <EmptyState body="No customer data available" />
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-app-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
