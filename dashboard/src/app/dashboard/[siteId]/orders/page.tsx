'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, Download, ReceiptText, RefreshCw, Layers } from 'lucide-react'
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
  { label: 'All Statuses', value: '' },
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
  { label: 'All Payments', value: '' },
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
  const normalized = value.toLowerCase().trim()
  if (normalized === 'fulfilled' || normalized === 'completed') return 'neutral'
  if (normalized === 'delivered') return 'good'
  if (normalized === 'partial' || normalized === 'in_progress') return 'info'
  if (normalized === 'unfulfilled' || normalized === 'pending' || normalized === 'processing') return 'warn'
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'refunded') return 'danger'
  return 'neutral'
}

function lifecycleTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase().trim()
  if (normalized === 'completed') return 'neutral'
  if (normalized === 'delivered') return 'good'
  if (normalized === 'in_transit' || normalized === 'out_for_delivery' || normalized === 'shipped') return 'info'
  if (normalized === 'processing' || normalized === 'pending' || normalized === 'on-hold' || normalized === 'on_hold' || normalized === 'exception') return 'warn'
  if (normalized === 'failed_delivery' || normalized === 'cancelled' || normalized === 'refunded' || normalized === 'failed' || normalized === 'returned' || normalized === 'deleted') return 'danger'
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
      return { label: 'Refunded', tone: 'info' as const }
    case 'voided':
      return { label: 'Voided', tone: 'neutral' as const }
    case 'failed':
      return { label: 'Failed', tone: 'danger' as const }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' as const }
    case 'pending':
      return { label: 'Pending', tone: 'warn' as const }
    case 'unpaid':
      return { label: 'Unpaid', tone: 'warn' as const }
    default:
      return { label: value ? formatStatusLabel(value) : 'Unpaid', tone: 'warn' as const }
  }
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  return (
    <>
      <span className="font-medium text-slate-700">{d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</span>
      <span className="ml-1.5 text-app-soft text-xs">{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
    </>
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
      <div className="card-glass relative overflow-hidden flex items-start gap-4 border-amber-200/50 bg-gradient-to-r from-amber-50/50 via-white to-white px-5 py-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-amber-300">
        <div className="absolute top-0 left-0 w-[4px] h-full bg-gradient-to-b from-amber-400 to-orange-500" />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100/60 shadow-inner">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600 animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">WooCommerce Order Sync is Disabled</p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-600">
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
      border: 'border-red-100',
      bg: 'from-red-50/20 via-white to-white',
      glow: 'bg-red-500'
    },
    info: {
      border: 'border-indigo-100',
      bg: 'from-indigo-50/15 via-white to-white',
      glow: 'bg-indigo-500'
    },
    good: {
      border: 'border-emerald-100',
      bg: 'from-emerald-50/20 via-white to-white',
      glow: 'bg-emerald-500'
    }
  }
  const colors = toneColorMap[tone] || toneColorMap.info

  return (
    <div className={`card-glass relative overflow-hidden flex flex-col gap-4 p-5 md:p-6 transition-all duration-300 hover:shadow-md border ${colors.border} bg-gradient-to-br ${colors.bg}`}>
      <div className="absolute top-0 left-0 w-[4px] h-full bg-gradient-to-b from-indigo-400 to-primary" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors.glow}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${colors.glow}`}></span>
            </span>
            <h4 className="text-sm font-semibold tracking-tight text-app-strong">WooCommerce Sync Status</h4>
            <StatusChip label={state.status || 'unknown'} tone={tone} className="px-2 py-0.5 text-[10px] font-bold" />
          </div>
          <p className="mt-1 text-xs text-app-muted leading-relaxed">
            Active developer sync pipeline. Realtime sync updates occur securely via background webhooks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 border border-slate-100/50 px-3 py-1.5 font-medium text-app-soft text-[11px]">
            SUCCESS: <span className="font-semibold text-app-strong">{formatSyncMoment(state.last_success_at)}</span>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100/50 px-3 py-1.5 font-medium text-app-soft text-[11px]">
            CHECK: <span className="font-semibold text-app-strong">{formatSyncMoment(state.last_realtime_synced_at)}</span>
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-100/70 my-0.5" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/60 p-3 border border-slate-100/70">
          <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Backfill Cursor</span>
          <span className="text-xs font-semibold text-app-strong">{state.last_backfill_order_id || 'Not started'}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/60 p-3 border border-slate-100/70">
          <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Backfill Modified At</span>
          <span className="text-xs font-semibold text-app-strong truncate">{state.last_backfill_modified_at ? new Date(state.last_backfill_modified_at).toLocaleDateString() : '—'}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/60 p-3 border border-slate-100/70">
          <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Backfill Completed</span>
          <span className="text-xs font-semibold text-app-strong truncate">{state.backfill_completed_at ? new Date(state.backfill_completed_at).toLocaleDateString() : '—'}</span>
        </div>
        <div className={`flex flex-col gap-1 rounded-xl p-3 border ${state.last_error ? 'bg-red-50/30 border-red-100 text-red-700' : 'bg-slate-50/60 border-slate-100/70 text-app-strong'}`}>
          <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Recent Diagnostic</span>
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
    return <TableLoadingSkeleton rows={8} columns={9} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Orders"
        controls={
          <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto">
            <DateRangeSelect
              value={dateRange}
              onChange={(v) => {
                setPage(1)
                setDateRange(v as OrdersDateRange)
              }}
              options={ORDER_DATE_RANGE_OPTIONS}
            />
            {refreshing ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs font-semibold text-indigo-600 shadow-inner">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Refreshing…
              </div>
            ) : null}
            <SearchInput
              value={query}
              onChange={(value) => {
                setPage(1)
                setQuery(value)
              }}
              placeholder="Search ID, customer, email, address…"
              className="min-w-[220px] flex-1 md:min-w-[280px] text-xs"
            />
            <button 
              type="button" 
              className="btn-secondary text-xs shrink-0 gap-2 h-10 px-3.5 border-slate-200/80 hover:bg-slate-50 transition-all duration-200" 
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary text-xs shrink-0 gap-2 h-10 px-3.5 shadow-sm transition-all duration-200"
              onClick={() => setExportOpen(true)}
              title={selectedOrders.size > 0 ? `Export ${selectedOrders.size} selected` : 'Export orders'}
            >
              <Download className="h-3.5 w-3.5" />
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
        <div className="card-glass px-4 py-3 border border-slate-100/60 shadow-[0_2px_12px_rgba(99,102,241,0.02)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1)
                    setStatusFilter(event.target.value)
                  }}
                  className="select py-1.5 pl-3 pr-8 text-xs font-semibold border-slate-200/80 bg-white/70 backdrop-blur-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 min-w-[150px] shadow-sm rounded-lg"
                >
                  {STATUS_FILTERS.map((filter) => (
                    <option key={filter.value || 'all'} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Payment</span>
                <select
                  value={paymentFilter}
                  onChange={(event) => {
                    setPage(1)
                    setPaymentFilter(event.target.value)
                  }}
                  className="select py-1.5 pl-3 pr-8 text-xs font-semibold border-slate-200/80 bg-white/70 backdrop-blur-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 min-w-[140px] shadow-sm rounded-lg"
                >
                  {PAYMENT_FILTERS.map((filter) => (
                    <option key={filter.value || 'all'} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-4 w-px bg-slate-200/80 hidden sm:block" />

              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-app-soft">Fulfillment</span>
                <div className="flex flex-wrap gap-1 bg-slate-50/50 p-1 border border-slate-100 rounded-lg">
                  {FULFILLMENT_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => { setPage(1); setFulfillmentFilter(f.value) }}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
                        fulfillmentFilter === f.value
                          ? 'bg-white border-slate-200 text-indigo-600 shadow-sm font-semibold'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {f.label === 'All' ? 'All Fulfillments' : f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end lg:self-auto text-xs text-app-muted bg-indigo-50/20 border border-indigo-100/20 px-3 py-1.5 rounded-lg shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <span className="font-bold text-app-strong">{totalCount.toLocaleString()}</span> orders found
            </div>
          </div>
        </div>

        {/* Orders table */}
        <div className="table-container border-slate-100 shadow-[0_4px_20px_rgba(99,102,241,0.02)]">
          {orders.length === 0 ? (
            <div className="px-6 py-12 bg-white">
              <EmptyState
                icon={<ReceiptText className="h-10 w-10 text-indigo-500" />}
                title="No synced orders yet"
                body="WooCommerce order snapshots will appear here after realtime sync or backfill starts."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="table-header sticky top-0 bg-slate-50/80 backdrop-blur-md z-10 border-b border-slate-100">
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
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 focus:ring-2 transition-all duration-150"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Order ID</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Date Placed</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Payment</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Total</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Shipping City</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft">Customer Name</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Items</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Fulfillment</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-app-soft w-px whitespace-nowrap">Lifecycle</th>
                  </tr>
                </thead>
                <tbody className="table-body divide-y divide-slate-100 bg-white">
                  {orders.map((order) => {
                    const customer = order.customer_name || order.customer_email || 'Unknown Customer'
                    const isSelected = selectedOrders.has(order.woo_order_id)
                    const paymentBadge = getPaymentBadge(order.payment_status || '')

                    return (
                      <tr 
                        key={order.woo_order_id} 
                        className={`table-row group cursor-pointer ${isSelected ? 'is-selected' : ''}`}
                      >
                        <td className="table-cell w-10 px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
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
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 focus:ring-2 transition-all duration-150"
                          />
                        </td>
                        <td className="table-cell px-4 py-3.5 whitespace-nowrap">
                          <Link
                            href={`/dashboard/${siteId}/orders/${encodeURIComponent(order.woo_order_id)}`}
                            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                          >
                            #{order.woo_order_id}
                          </Link>
                        </td>
                        <td className="table-cell px-4 py-3.5 text-xs text-app-soft whitespace-nowrap">
                          {formatShortDate(order.created_at_woo)}
                        </td>
                        <td className="table-cell px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div title={formatStatusLabel(order.payment_status || 'unknown')}>
                            <StatusChip label={paymentBadge.label} tone={paymentBadge.tone} className="px-2 py-0.5 text-[10px] font-bold" />
                          </div>
                        </td>
                        <td className="table-cell px-4 py-3.5 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="text-sm font-semibold text-slate-800">
                            {money(order.total_amount, order.currency)}
                          </div>
                        </td>
                        <td className="table-cell px-4 py-3.5 text-xs text-app-muted">
                          {order.shipping_city ? (
                            <div className="max-w-[130px] truncate font-medium text-slate-700" title={order.shipping_city}>
                              {order.shipping_city}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="table-cell px-4 py-3.5 text-xs">
                          <div className="max-w-[200px] truncate font-semibold text-slate-800" title={customer}>{customer}</div>
                          {order.customer_email && (
                            <div className="text-[10px] text-app-soft max-w-[200px] truncate mt-0.5">{order.customer_email}</div>
                          )}
                        </td>
                        <td className="table-cell px-4 py-3.5 text-xs text-app-muted font-semibold">
                          {order.items_count}
                        </td>
                        <td className="table-cell px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <StatusChip label={formatStatusLabel(order.fulfillment_status || 'unknown')} tone={chipTone(order.fulfillment_status || 'unknown')} className="px-2 py-0.5 text-[10px] font-bold" />
                        </td>
                        <td className="table-cell px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <StatusChip label={formatStatusLabel(order.status || 'unknown')} tone={lifecycleTone(order.status || 'unknown')} className="px-2 py-0.5 text-[10px] font-bold" />
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
