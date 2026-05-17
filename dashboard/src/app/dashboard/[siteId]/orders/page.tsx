'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, Download, ReceiptText, RefreshCw } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { ExportModal } from '@/components/ui/export-modal'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { OrderListItem, OrderListResponse, WooOrderSyncState } from '@/lib/types'

const PAGE_SIZE = 30
type OrdersDateRange = PresetDateRange | 'all'

const ORDER_DATE_RANGE_OPTIONS: Array<{ value: OrdersDateRange; label: string }> = [
  { value: 'all', label: 'All time' },
  ...DATE_RANGE_OPTIONS,
]

const PAYMENT_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Failed', value: 'failed' },
]

const FULFILLMENT_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'Unfulfilled', value: 'unfulfilled' },
  { label: 'Cancelled', value: 'cancelled' },
]

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount || 0)
}

function chipTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase()
  if (normalized === 'paid' || normalized === 'fulfilled') return 'neutral'
  if (normalized === 'completed') return 'good'
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'unfulfilled') return 'warn'
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'refunded') return 'danger'
  return 'neutral'
}

function formatStatusLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') || 'Unknown'
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  return (
    <>
      <span>{d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</span>
      <span className="ml-1 text-app-soft">{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    </>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
        active
          ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      {label}
    </button>
  )
}

function formatSyncMoment(value: string | null) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function SyncStateBanner({ state }: { state: WooOrderSyncState }) {
  if (!state.order_sync_enabled) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-800">Order sync is disabled</p>
          <p className="mt-0.5 text-xs text-amber-700">
            New WooCommerce orders will not be recorded. Enable sync in{' '}
            <span className="font-semibold">WooSaaS plugin → Settings</span>.
          </p>
        </div>
      </div>
    )
  }

  const tone = state.status === 'error' ? 'danger' : state.status === 'running' ? 'info' : 'good'
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-app-line bg-white px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-app-strong">WooCommerce order sync</p>
          <StatusChip label={state.status || 'unknown'} tone={tone} />
        </div>
        <p className="mt-1 text-xs text-app-muted">
          Last realtime sync: {formatSyncMoment(state.last_realtime_synced_at)}. Last success: {formatSyncMoment(state.last_success_at)}.
        </p>
      </div>
      <div className="grid gap-1 text-xs text-app-muted sm:grid-cols-2 sm:gap-x-5">
        <span>Backfill cursor: {state.last_backfill_order_id || 'Not started'}</span>
        <span>Backfill modified: {formatSyncMoment(state.last_backfill_modified_at)}</span>
        <span>Backfill completed: {formatSyncMoment(state.backfill_completed_at)}</span>
        <span>{state.last_error ? `Last error: ${state.last_error}` : 'No recent sync error'}</span>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const siteId = useSiteId()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [fulfillmentFilter, setFulfillmentFilter] = useState('')
  const [dateRange, setDateRange] = useState<OrdersDateRange>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [syncState, setSyncState] = useState<WooOrderSyncState | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    ordersApi.syncState(siteId).then((res) => setSyncState(res.data)).catch(() => null)
  }, [siteId])

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
        const range = dateRange === 'all' ? null : getPresetDateRange(dateRange)
        const response = await ordersApi.list(siteId, page, PAGE_SIZE, {
          q: query || undefined,
          payment_status: paymentFilter || undefined,
          fulfillment_status: fulfillmentFilter || undefined,
          date_from: range?.from,
          date_to: range?.to,
        })
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
  }, [orders.length, page, query, paymentFilter, fulfillmentFilter, dateRange, reloadKey, siteId])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  if (loading && orders.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={7} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Orders"
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeSelect
              value={dateRange}
              onChange={(v) => {
                setPage(1)
                setDateRange(v as OrdersDateRange)
              }}
              options={ORDER_DATE_RANGE_OPTIONS}
            />
            {refreshing ? <StatusChip label="Refreshing…" tone="info" /> : null}
            <SearchInput
              value={query}
              onChange={(value) => {
                setPage(1)
                setQuery(value)
              }}
              placeholder="Search order, customer, email…"
            />
            <button type="button" className="btn-secondary gap-2" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary gap-2"
              onClick={() => setExportOpen(true)}
              title={selectedOrders.size > 0 ? `Export ${selectedOrders.size} selected` : 'Export orders'}
            >
              <Download className="h-4 w-4" />
              {selectedOrders.size > 0 ? `Export (${selectedOrders.size})` : 'Export'}
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

        {/* Filter bar */}
        <div className="rounded-xl border border-app-line bg-white px-4 py-1.5 shadow-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-app-soft">Payment</span>
              <div className="flex flex-wrap gap-1">
                {PAYMENT_FILTERS.map((f) => (
                  <FilterPill
                    key={f.value}
                    label={f.label}
                    active={paymentFilter === f.value}
                    onClick={() => { setPage(1); setPaymentFilter(f.value) }}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-app-soft">Fulfillment</span>
              <div className="flex flex-wrap gap-1">
                {FULFILLMENT_FILTERS.map((f) => (
                  <FilterPill
                    key={f.value}
                    label={f.label}
                    active={fulfillmentFilter === f.value}
                    onClick={() => { setPage(1); setFulfillmentFilter(f.value) }}
                  />
                ))}
              </div>
            </div>
            <div className="ml-auto flex items-center">
              <span className="text-xs text-app-muted">{totalCount.toLocaleString()} orders</span>
            </div>
          </div>
        </div>

        {/* Orders table */}
        <SectionCard className="px-0 py-0 overflow-hidden">
          {orders.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={<ReceiptText className="h-10 w-10" />}
                title="No synced orders yet"
                body="WooCommerce order snapshots will appear here after realtime sync or backfill starts."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="table-header sticky top-0">
                  <tr>
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedOrders.size === orders.length && orders.length > 0}
                        onChange={() => {
                          if (selectedOrders.size === orders.length) {
                            setSelectedOrders(new Set())
                          } else {
                            setSelectedOrders(new Set(orders.map((o) => o.woo_order_id)))
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Order</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Total</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Payment</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Delivery</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Shipping</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft">Customer</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Items</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Fulfillment</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {orders.map((order) => {
                    const customer = order.customer_name || order.customer_email || 'Unknown customer'
                    const isSelected = selectedOrders.has(order.woo_order_id)

                    return (
                      <tr key={order.woo_order_id} className={`table-row group cursor-pointer transition-colors hover:bg-slate-50/70 ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                        <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(selectedOrders)
                              if (next.has(order.woo_order_id)) {
                                next.delete(order.woo_order_id)
                              } else {
                                next.add(order.woo_order_id)
                              }
                              setSelectedOrders(next)
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            href={`/dashboard/${siteId}/orders/${encodeURIComponent(order.woo_order_id)}`}
                            className="text-sm font-semibold text-app-strong transition hover:text-indigo-600"
                          >
                            #{order.woo_order_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-app-muted tabular-nums whitespace-nowrap">
                          {formatShortDate(order.created_at_woo)}
                        </td>
                        <td className="px-4 py-3 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="text-sm tabular-nums text-app-strong">
                            {money(order.total_amount, order.currency)}
                          </div>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <StatusChip label={formatStatusLabel(order.payment_status || 'unknown')} tone={chipTone(order.payment_status || 'unknown')} />
                        </td>
                        <td className="px-4 py-3 text-sm text-app-muted">
                          <div className="max-w-[130px] truncate" title={order.delivery_method}>
                            {order.delivery_method || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(order.shipping_city || order.shipping_country) ? (
                            <div
                              className="max-w-[220px] truncate text-sm text-app-strong"
                              title={[
                                [order.shipping_city, order.shipping_postcode].filter(Boolean).join(', '),
                                [order.shipping_state, order.shipping_country].filter(Boolean).join(' · '),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            >
                              {[
                                [order.shipping_city, order.shipping_postcode].filter(Boolean).join(', '),
                                [order.shipping_state, order.shipping_country].filter(Boolean).join(' · '),
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </div>
                          ) : (
                            <span className="text-sm text-app-soft">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-app-strong">
                          <div className="max-w-[200px] truncate">{customer}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-app-muted tabular-nums">
                          {order.items_count}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <StatusChip label={formatStatusLabel(order.fulfillment_status || 'unknown')} tone={chipTone(order.fulfillment_status || 'unknown')} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        />

        {syncState && <SyncStateBanner state={syncState} />}
      </AnalyticsPageContent>

      {exportOpen && (
        <ExportModal
          siteId={siteId}
          selectedIds={Array.from(selectedOrders)}
          filters={{
            q: query || undefined,
            paymentStatus: paymentFilter || undefined,
            fulfillmentStatus: fulfillmentFilter || undefined,
            dateFrom: dateRange === 'all' ? undefined : getPresetDateRange(dateRange).from,
            dateTo: dateRange === 'all' ? undefined : getPresetDateRange(dateRange).to,
          }}
          previewOrders={orders}
          onClose={() => setExportOpen(false)}
        />
      )}
    </AnalyticsPage>
  )
}
