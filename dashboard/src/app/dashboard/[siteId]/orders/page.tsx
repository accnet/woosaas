'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { ReceiptText, RefreshCw } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell } from '@/components/ui/table-primitives'
import { TableSection } from '@/components/ui/table-section'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import type { OrderListItem, OrderListResponse } from '@/lib/types'

const PAGE_SIZE = 25

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount || 0)
}

function chipTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase()
  if (normalized === 'paid' || normalized === 'fulfilled' || normalized === 'completed') return 'good'
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'unfulfilled') return 'warn'
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'refunded') return 'danger'
  return 'neutral'
}

export default function OrdersPage() {
  const siteId = useSiteId()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (orders.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const response = await ordersApi.list(siteId, page, PAGE_SIZE, { q: query || undefined })
        const data = response.data as OrderListResponse
        setOrders(data.orders)
        setTotalCount(data.total_count)
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getApiErrorMessage(err, 'Orders could not be loaded right now.'))
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()
    return () => controller.abort()
  }, [orders.length, page, query, reloadKey, siteId])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const totals = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0)
    const paidCount = orders.filter((order) => order.payment_status === 'paid').length
    const avgValue = orders.length > 0 ? revenue / orders.length : 0
    return { revenue, paidCount, avgValue }
  }, [orders])

  if (loading && orders.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={7} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Orders"
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={`${totalCount.toLocaleString()} total`} tone="neutral" />
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <SearchInput
              value={query}
              onChange={(value) => {
                setPage(1)
                setQuery(value)
              }}
              placeholder="Search order id, customer, or email"
            />
            <button type="button" className="btn-secondary gap-2" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </div>
        }
      />

      <AnalyticsPageContent>
        {error ? (
          <InlineErrorState
            body={error}
            compact={orders.length > 0}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <MetricGrid>
          <MetricCard label="Orders" value={totalCount.toLocaleString()} />
          <MetricCard label="Visible revenue" value={money(totals.revenue, orders[0]?.currency || 'USD')} tone="good" />
          <MetricCard label="Paid visible" value={totals.paidCount.toLocaleString()} />
          <MetricCard label="Avg visible AOV" value={money(totals.avgValue, orders[0]?.currency || 'USD')} />
        </MetricGrid>

        <TableSection
          title="Canonical order directory"
          action={<StatusChip label={`${orders.length.toLocaleString()} visible`} tone="neutral" />}
          isEmpty={orders.length === 0}
          emptyTitle="No synced orders yet"
          emptyBody="WooCommerce order snapshots will appear here after realtime sync or backfill starts."
          emptyIcon={<ReceiptText className="h-12 w-12" />}
        >
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <TableHeaderCell>Order</TableHeaderCell>
                <TableHeaderCell>Date created</TableHeaderCell>
                <TableHeaderCell>Customer</TableHeaderCell>
                <TableHeaderCell>Payment</TableHeaderCell>
                <TableHeaderCell>Fulfillment</TableHeaderCell>
                <TableHeaderCell align="right">Items</TableHeaderCell>
                <TableHeaderCell align="right">Total</TableHeaderCell>
              </tr>
            </thead>
            <tbody className="table-body">
              {orders.map((order) => (
                <tr key={order.woo_order_id} className="table-row">
                  <td className="table-cell">
                    <Link href={`/dashboard/${siteId}/orders/${encodeURIComponent(order.woo_order_id)}`} className="font-medium text-app-strong transition hover:text-blue-700">
                      #{order.woo_order_id}
                    </Link>
                    <div className="mt-1 text-xs text-app-soft">{order.status || 'unknown'}</div>
                  </td>
                  <td className="table-cell text-sm text-app-muted">
                    {order.created_at_woo ? new Date(order.created_at_woo).toLocaleString() : '-'}
                  </td>
                  <td className="table-cell">
                    <div className="text-sm font-medium text-app-strong">{order.customer_name || order.customer_email || 'Unknown customer'}</div>
                    <div className="mt-1 text-xs text-app-soft">{order.customer_email || 'No email'}</div>
                  </td>
                  <td className="table-cell"><StatusChip label={order.payment_status || 'unknown'} tone={chipTone(order.payment_status || 'unknown')} /></td>
                  <td className="table-cell"><StatusChip label={order.fulfillment_status || 'unknown'} tone={chipTone(order.fulfillment_status || 'unknown')} /></td>
                  <td className="table-cell text-right">{order.items_count.toLocaleString()}</td>
                  <td className="table-cell text-right font-medium">{money(order.total_amount, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableSection>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        />
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
