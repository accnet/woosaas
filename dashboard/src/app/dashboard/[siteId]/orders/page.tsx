'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, ArrowRight, BadgeDollarSign, ReceiptText, RefreshCw, ShoppingBag, TrendingUp } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useDateRange } from '@/hooks/use-date-range'
import type { OrderListItem, OrderListResponse, WooOrderSyncState } from '@/lib/types'

const PAGE_SIZE = 30

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
  if (normalized === 'paid' || normalized === 'fulfilled' || normalized === 'completed') return 'good'
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'unfulfilled') return 'warn'
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'refunded') return 'danger'
  return 'neutral'
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function avatarColors(seed: string) {
  const palettes = [
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
    'bg-orange-100 text-orange-700',
  ]
  const idx = (seed.charCodeAt(0) || 0) % palettes.length
  return palettes[idx]
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
  const [dateRange, setDateRange] = useDateRange()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [syncState, setSyncState] = useState<WooOrderSyncState | null>(null)

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
        const { from, to } = getPresetDateRange(dateRange)
        const response = await ordersApi.list(siteId, page, PAGE_SIZE, {
          q: query || undefined,
          payment_status: paymentFilter || undefined,
          fulfillment_status: fulfillmentFilter || undefined,
          date_from: from,
          date_to: to,
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
            <DateRangeSelect
              value={dateRange}
              onChange={(v) => {
                setPage(1)
                setDateRange(v as PresetDateRange)
              }}
              options={DATE_RANGE_OPTIONS}
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
          </div>
        }
      />

      <AnalyticsPageContent>
        {syncState && <SyncStateBanner state={syncState} />}

        {error ? (
          <InlineErrorState
            body={error}
            compact={orders.length > 0}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        {/* Filter bar */}
        <div className="rounded-xl border border-app-line bg-white px-4 py-3 shadow-sm">
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

        {/* Metric row */}
        <MetricGrid>
          <MetricCard
            label="Total Orders"
            value={totalCount.toLocaleString()}
            icon={<ShoppingBag className="h-5 w-5" />}
          />
          <MetricCard
            label="Revenue (page)"
            value={money(totals.revenue, orders[0]?.currency || 'USD')}
            tone="good"
            icon={<BadgeDollarSign className="h-5 w-5" />}
          />
          <MetricCard
            label="Paid (page)"
            value={totals.paidCount.toLocaleString()}
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <MetricCard
            label="AOV (page)"
            value={money(totals.avgValue, orders[0]?.currency || 'USD')}
            icon={<ReceiptText className="h-5 w-5" />}
          />
        </MetricGrid>

        {/* Orders list */}
        <SectionCard
          title="Orders"
          action={<StatusChip label={`${orders.length} shown`} tone="neutral" />}
          className="px-0 py-0 overflow-hidden"
        >
          {orders.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={<ReceiptText className="h-10 w-10" />}
                title="No synced orders yet"
                body="WooCommerce order snapshots will appear here after realtime sync or backfill starts."
              />
            </div>
          ) : (
            <div className="divide-y divide-app-line">
              {orders.map((order) => {
                const customer = order.customer_name || order.customer_email || 'Unknown customer'
                const avatarClass = avatarColors(customer)
                const initial = customer.charAt(0).toUpperCase()
                const isPaid = order.payment_status === 'paid'

                return (
                  <div key={order.woo_order_id} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70">
                    {/* Avatar */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarClass}`}>
                      {initial}
                    </div>

                    {/* Order info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={`/dashboard/${siteId}/orders/${encodeURIComponent(order.woo_order_id)}`}
                          className="text-sm font-semibold text-app-strong transition hover:text-indigo-600"
                        >
                          #{order.woo_order_id}
                        </Link>
                        <StatusChip label={order.payment_status || 'unknown'} tone={chipTone(order.payment_status || 'unknown')} />
                        <StatusChip label={order.fulfillment_status || 'unknown'} tone={chipTone(order.fulfillment_status || 'unknown')} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-app-muted">
                        <span>{customer}</span>
                        {order.customer_email ? <span className="text-app-soft">{order.customer_email}</span> : null}
                        <span>{formatShortDate(order.created_at_woo)}</span>
                        <span>{order.items_count} {order.items_count === 1 ? 'item' : 'items'}</span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="shrink-0 text-right">
                      <div className={`text-base font-bold tabular-nums ${isPaid ? 'text-emerald-600' : 'text-app-strong'}`}>
                        {money(order.total_amount, order.currency)}
                      </div>
                      {order.status ? <div className="mt-0.5 text-xs text-app-soft">{order.status}</div> : null}
                    </div>

                    {/* Arrow */}
                    <Link
                      href={`/dashboard/${siteId}/orders/${encodeURIComponent(order.woo_order_id)}`}
                      aria-label={`View order #${order.woo_order_id}`}
                      className="shrink-0 text-app-subtle transition group-hover:text-app-muted"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

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
