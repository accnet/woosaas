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
import { useDateRange } from '@/hooks/use-date-range'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { OrderListItem, OrderListResponse, WooOrderSyncState } from '@/lib/types'

const PAGE_SIZE = 30
type OrdersDateRange = PresetDateRange | 'all'

const ORDER_DATE_RANGE_OPTIONS: Array<{ value: OrdersDateRange; label: string }> = [
  { value: 'all', label: 'All time' },
  ...DATE_RANGE_OPTIONS,
]

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Processing', value: 'processing' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'In transit', value: 'in_transit' },
  { label: 'Out for delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Exception', value: 'exception' },
  { label: 'Failed delivery', value: 'failed_delivery' },
  { label: 'Returned', value: 'returned' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Refunded', value: 'refunded' },
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

function lifecycleTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase()
  if (normalized === 'delivered') return 'good'
  if (normalized === 'in_transit' || normalized === 'out_for_delivery') return 'info'
  if (normalized === 'processing') return 'warn'
  if (normalized === 'fulfilled') return 'neutral'
  if (normalized === 'exception') return 'warn'
  if (normalized === 'failed_delivery' || normalized === 'cancelled' || normalized === 'refunded' || normalized === 'returned' || normalized === 'deleted') return 'danger'
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

function getPaymentBadge(value: string) {
  const normalized = value.toLowerCase().trim()
  switch (normalized) {
    case 'paid':
      return { label: 'Paid', tone: 'neutral' as const }
    case 'refunded':
    case 'partially_refunded':
    case 'voided':
      return { label: 'Refunded', tone: 'danger' as const }
    case 'failed':
      return { label: 'Failed', tone: 'danger' as const }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' as const }
    case 'pending':
    case 'unpaid':
    default:
      return { label: 'Unpaid', tone: 'warn' as const }
  }
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
      <div className="flex items-start gap-4 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-white px-5 py-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md hover:border-amber-300/80">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 shadow-inner">
          <AlertTriangle className="h-5 w-5 text-amber-600 animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">WooCommerce Order Sync is Disabled</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700">
            Realtime WooCommerce order snapshots are currently paused. You can enable automatic synchronization in the{' '}
            <span className="font-semibold underline decoration-amber-500/35 hover:decoration-amber-500 transition-colors">WooSaaS plugin settings</span> on your site.
          </p>
        </div>
      </div>
    )
  }

  const tone = state.status === 'error' ? 'danger' : state.status === 'running' ? 'info' : 'good'
  
  // Choose gradient and border colors based on tone
  const toneColorMap = {
    danger: {
      border: 'border-red-100/80',
      bg: 'from-red-50/30 via-white to-white',
      glow: 'bg-red-500/10'
    },
    info: {
      border: 'border-indigo-100/80',
      bg: 'from-indigo-50/20 via-white to-white',
      glow: 'bg-indigo-500/10'
    },
    good: {
      border: 'border-emerald-100/80',
      bg: 'from-emerald-50/30 via-white to-white',
      glow: 'bg-emerald-500/10'
    }
  }
  const colors = toneColorMap[tone] || toneColorMap.info

  return (
    <div className={`card-glass flex flex-col gap-4 p-5 md:p-6 transition-all duration-300 hover:shadow-lg hover:border-indigo-200 border ${colors.border} bg-gradient-to-br ${colors.bg}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${tone === 'danger' ? 'bg-rose-400' : tone === 'info' ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${tone === 'danger' ? 'bg-rose-500' : tone === 'info' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
            </span>
            <h4 className="text-sm font-semibold tracking-tight text-app-strong">WooCommerce Sync Status</h4>
            <StatusChip label={state.status || 'unknown'} tone={tone} />
          </div>
          <p className="mt-1.5 text-xs text-app-muted leading-relaxed">
            Active developer sync pipeline. Realtime sync updates occur securely via background webhooks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5 font-medium text-app-muted">
            Last success: <span className="font-semibold text-app-strong">{formatSyncMoment(state.last_success_at)}</span>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5 font-medium text-app-muted">
            Last sync check: <span className="font-semibold text-app-strong">{formatSyncMoment(state.last_realtime_synced_at)}</span>
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-100/80 my-0.5" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/50 p-3 border border-slate-100/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Backfill Cursor</span>
          <span className="text-xs font-semibold text-app-strong">{state.last_backfill_order_id || 'Not started'}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/50 p-3 border border-slate-100/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Backfill Modified At</span>
          <span className="text-xs font-semibold text-app-strong">{formatSyncMoment(state.last_backfill_modified_at)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/50 p-3 border border-slate-100/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Backfill Completed</span>
          <span className="text-xs font-semibold text-app-strong">{formatSyncMoment(state.backfill_completed_at)}</span>
        </div>
        <div className={`flex flex-col gap-1 rounded-xl p-3 border ${state.last_error ? 'bg-red-50/30 border-red-100/50 text-red-700' : 'bg-slate-50/50 border-slate-100/50 text-app-strong'}`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Recent Diagnostic</span>
          <span className="text-xs font-semibold truncate" title={state.last_error || 'No sync issues'}>
            {state.last_error ? state.last_error : 'Healthy — No errors'}
          </span>
        </div>
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
  const [statusFilter, setStatusFilter] = useState('')
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
        const range = dateRange === 'all' ? null : getPresetDateRange(dateRange as PresetDateRange)
        const response = await ordersApi.list(siteId, page, PAGE_SIZE, {
          q: query || undefined,
          status: statusFilter || undefined,
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
  }, [orders.length, page, query, statusFilter, paymentFilter, fulfillmentFilter, dateRange, reloadKey, siteId])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  if (loading && orders.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={7} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Orders"
        controls={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
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
              className="min-w-[220px] flex-1 md:min-w-[280px]"
            />
            <button type="button" className="btn-secondary shrink-0 gap-2" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary shrink-0 gap-2"
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
        <div className="card-glass px-4 py-3 shadow-sm border border-slate-100/50">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1)
                    setStatusFilter(event.target.value)
                  }}
                  className="select py-1.5 pl-3 pr-8 text-xs font-medium border-slate-200 bg-white/50 backdrop-blur-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-w-[140px] shadow-sm rounded-lg"
                >
                  {STATUS_FILTERS.map((filter) => (
                    <option key={filter.value || 'all'} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Payment</span>
                <select
                  value={paymentFilter}
                  onChange={(event) => {
                    setPage(1)
                    setPaymentFilter(event.target.value)
                  }}
                  className="select py-1.5 pl-3 pr-8 text-xs font-medium border-slate-200 bg-white/50 backdrop-blur-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-w-[130px] shadow-sm rounded-lg"
                >
                  {PAYMENT_FILTERS.map((filter) => (
                    <option key={filter.value || 'all'} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft mr-1">Fulfillment</span>
                <div className="flex flex-wrap gap-1">
                  {FULFILLMENT_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => { setPage(1); setFulfillmentFilter(f.value) }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                        fulfillmentFilter === f.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm font-semibold'
                          : 'border-slate-200 bg-white/60 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end lg:self-auto text-xs text-app-muted bg-slate-100/50 border border-slate-100/40 px-2.5 py-1 rounded-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <span className="font-semibold text-app-strong">{totalCount.toLocaleString()}</span> orders found
            </div>
          </div>
        </div>

        {/* Orders table */}
        <div className="table-container">
          {orders.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={<ReceiptText className="h-10 w-10 text-indigo-500" />}
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
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Payment</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Total</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Delivery</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Shipping</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft">Customer</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Items</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Fulfillment</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {orders.map((order) => {
                    const customer = order.customer_name || order.customer_email || 'Unknown customer'
                    const isSelected = selectedOrders.has(order.woo_order_id)
                    const paymentBadge = getPaymentBadge(order.payment_status || '')

                    return (
                      <tr key={order.woo_order_id} className={`table-row group cursor-pointer transition-colors hover:bg-slate-50/70 ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                        <td className="table-cell w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                        <td className="table-cell px-4 py-3 whitespace-nowrap font-medium">
                          <Link
                            href={`/dashboard/${siteId}/orders/${encodeURIComponent(order.woo_order_id)}`}
                            className="text-sm font-semibold text-app-strong transition hover:text-indigo-600"
                          >
                            #{order.woo_order_id}
                          </Link>
                        </td>
                        <td className="table-cell px-4 py-3 text-sm text-app-muted tabular-nums whitespace-nowrap">
                          {formatShortDate(order.created_at_woo)}
                        </td>
                        <td className="table-cell px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div title={formatStatusLabel(order.payment_status || 'unknown')}>
                            <StatusChip label={paymentBadge.label} tone={paymentBadge.tone} />
                          </div>
                        </td>
                        <td className="table-cell px-4 py-3 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="text-sm tabular-nums text-app-strong font-semibold">
                            {money(order.total_amount, order.currency)}
                          </div>
                        </td>
                        <td className="table-cell px-4 py-3 text-sm text-app-muted">
                          <div className="max-w-[130px] truncate" title={order.delivery_method}>
                            {order.delivery_method || '—'}
                          </div>
                        </td>
                        <td className="table-cell px-4 py-3 whitespace-nowrap">
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
                        <td className="table-cell px-4 py-3 text-sm text-app-strong">
                          <div className="max-w-[200px] truncate">{customer}</div>
                        </td>
                        <td className="table-cell px-4 py-3 text-sm text-app-muted tabular-nums">
                          {order.items_count}
                        </td>
                        <td className="table-cell px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <StatusChip label={formatStatusLabel(order.fulfillment_status || 'unknown')} tone={chipTone(order.fulfillment_status || 'unknown')} />
                        </td>
                        <td className="table-cell px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <StatusChip label={formatStatusLabel(order.status || 'unknown')} tone={lifecycleTone(order.status || 'unknown')} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
            status: statusFilter || undefined,
            paymentStatus: paymentFilter || undefined,
            fulfillmentStatus: fulfillmentFilter || undefined,
            dateFrom: dateRange === 'all' ? undefined : getPresetDateRange(dateRange as PresetDateRange).from,
            dateTo: dateRange === 'all' ? undefined : getPresetDateRange(dateRange as PresetDateRange).to,
          }}
          previewOrders={orders}
          onClose={() => setExportOpen(false)}
        />
      )}
    </AnalyticsPage>
  )
}
