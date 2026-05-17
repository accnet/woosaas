'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import axios from 'axios'
import {
  ArrowLeft,
  Boxes,
  Ellipsis,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  Package2,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
  Truck,
  BadgeCheck,
  UserRound,
  X,
} from 'lucide-react'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { DetailNote } from '@/components/ui/detail-note'
import { DetailRow } from '@/components/ui/detail-row'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import type { AddShipmentTrackingInput, OrderDetail, OrderItem, ShipmentTracking } from '@/lib/types'

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount || 0)
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function renderAddress(address: Record<string, unknown>) {
  const lines = Object.values(address || {})
    .filter(Boolean)
    .map((value) => String(value))
  if (lines.length === 0) return 'No address'
  return lines.join(', ')
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function AddressBlock({ address, showPhone = false }: { address: Record<string, unknown>; showPhone?: boolean }) {
  const firstName = str(address.first_name)
  const lastName = str(address.last_name)
  const name = [firstName, lastName].filter(Boolean).join(' ')
  const company = str(address.company)
  const address1 = str(address.address_1)
  const address2 = str(address.address_2)
  const city = str(address.city)
  const state = str(address.state)
  const postcode = str(address.postcode)
  const country = str(address.country)
  const phone = str(address.phone)

  const cityLine = [
    city,
    [state, postcode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  const lines = [name, company, address1, address2, cityLine, country].filter(Boolean)

  if (lines.length === 0) {
    return <p className="text-sm text-app-soft">No address on file</p>
  }

  return (
    <address className="not-italic">
      {lines.map((line, i) => (
        <p
          key={i}
          className={
            i === 0
              ? 'text-sm font-medium text-app-strong'
              : 'text-sm text-app-strong'
          }
        >
          {line}
        </p>
      ))}
      {showPhone && phone ? (
        <p className="mt-1 text-sm text-app-muted">{phone}</p>
      ) : null}
    </address>
  )
}

function chipTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase()
  if (normalized === 'paid' || normalized === 'fulfilled') return 'neutral'
  if (normalized === 'completed' || normalized === 'delivered' || normalized === 'ok') return 'good'
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'unfulfilled' || normalized === 'in_transit' || normalized === 'out_for_delivery') return 'warn'
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'refunded' || normalized === 'unpaid' || normalized === 'error' || normalized === 'exception') return 'danger'
  return 'neutral'
}

function paymentSummaryTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase()
  if (normalized === 'paid') return 'good'
  return chipTone(value)
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

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = asString(value)
    if (normalized) return normalized
  }
  return ''
}

function getInitials(name: string, email: string) {
  const source = name || email || '?'
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function extractCustomerAvatarUrl(rawOrder: Record<string, unknown>) {
  const customer = asObject(rawOrder.customer)
  const billing = asObject(rawOrder.billing)
  return firstString(
    rawOrder.avatar_url,
    rawOrder.avatar,
    customer?.avatar_url,
    customer?.avatar,
    customer?.image,
    billing?.avatar_url,
    billing?.avatar
  )
}

function findRawLineItem(rawOrder: Record<string, unknown>, item: OrderItem) {
  const lineItems = asArray(rawOrder.line_items)
  return (
    lineItems.find((entry) => {
      const candidate = asObject(entry)
      if (!candidate) return false
      return (
        firstString(candidate.id) === item.line_item_id ||
        firstString(candidate.product_id) === item.product_id
      )
    }) || null
  )
}

function extractItemImageUrl(rawOrder: Record<string, unknown>, item: OrderItem) {
  const rawLineItem = asObject(findRawLineItem(rawOrder, item))
  const image = asObject(rawLineItem?.image)
  const product = asObject(rawLineItem?.product)
  const productImage = asObject(product?.image)

  return firstString(
    item.thumbnail_url,
    item.image_url,
    image?.src,
    image?.url,
    rawLineItem?.image_url,
    rawLineItem?.featured_image,
    productImage?.src,
    productImage?.url,
    product?.image_url,
    product?.featured_image
  )
}

function formatVariantAttributes(attributes: Record<string, unknown> | null | undefined) {
  if (!attributes) return ''

  const orderedLabels = ['Style', 'Color', 'Size']
  const parts = orderedLabels
    .map((label) => {
      const value = attributes[label]
      return value ? `${label}: ${String(value)}` : ''
    })
    .filter(Boolean)

  Object.entries(attributes).forEach(([key, value]) => {
    if (!orderedLabels.includes(key) && value) {
      parts.push(`${key}: ${String(value)}`)
    }
  })

  return parts.join(' · ')
}

type ActivityItem = {
  label: string
  timestamp: string
}

type ProgressStepState = 'done' | 'current' | 'pending'

type OrderProgressStep = {
  key: string
  label: string
  state: ProgressStepState
  timestamp: string | null
}

const ORDER_PROGRESS_STEPS = [
  { key: 'processing', label: 'Processing' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
] as const

function lifecycleTone(value: string): 'neutral' | 'info' | 'good' | 'warn' | 'danger' {
  const normalized = value.toLowerCase()
  if (normalized === 'delivered') return 'good'
  if (normalized === 'in_transit' || normalized === 'out_for_delivery') return 'info'
  if (normalized === 'processing') return 'warn'
  if (normalized === 'fulfilled') return 'neutral'
  if (normalized === 'exception') return 'warn'
  if (normalized === 'failed_delivery' || normalized === 'returned' || normalized === 'cancelled' || normalized === 'refunded' || normalized === 'deleted') return 'danger'
  return 'neutral'
}

function ProgressStepIcon({ stepKey, state }: { stepKey: string; state: ProgressStepState }) {
  const className = `h-4 w-4 ${
    state === 'done'
      ? 'text-emerald-700'
      : state === 'current'
        ? 'text-indigo-700'
        : 'text-slate-500'
  }`

  switch (stepKey) {
    case 'processing':
      return <Clock3 className={className} />
    case 'fulfilled':
      return <PackageCheck className={className} />
    case 'in_transit':
      return <Truck className={className} />
    case 'out_for_delivery':
      return <Package2 className={className} />
    case 'delivered':
      return <BadgeCheck className={className} />
    default:
      return <CheckCheck className={className} />
  }
}

function normalizeLifecycleStatus(value: string) {
  const normalized = value.replaceAll('-', '_').trim().toLowerCase()
  if (normalized === 'completed') return 'delivered'
  if (normalized === 'shipped') return 'fulfilled'
  return normalized
}

function getProgressTimestamp(status: string, order: OrderDetail, trackings: ShipmentTracking[]) {
  const latestTracking = trackings
    .filter((tracking) => normalizeLifecycleStatus(tracking.status) === status)
    .sort((a, b) => new Date(b.last_checkpoint_at || b.updated_at).getTime() - new Date(a.last_checkpoint_at || a.updated_at).getTime())[0]

  switch (status) {
    case 'processing':
      return order.paid_at_woo || order.created_at_woo || order.created_at
    case 'fulfilled':
      return latestTracking?.created_at || order.completed_at_woo || null
    case 'in_transit':
    case 'out_for_delivery':
    case 'delivered':
      return latestTracking?.last_checkpoint_at || latestTracking?.updated_at || null
    default:
      return null
  }
}

function buildOrderProgress(order: OrderDetail, trackings: ShipmentTracking[]) {
  const currentStatus = normalizeLifecycleStatus(order.status || 'processing')
  const latestTracking = [...trackings].sort(
    (a, b) => new Date(b.last_checkpoint_at || b.updated_at).getTime() - new Date(a.last_checkpoint_at || a.updated_at).getTime(),
  )[0] || null

  let currentIndex = ORDER_PROGRESS_STEPS.findIndex((step) => step.key === currentStatus)
  if (currentIndex === -1) {
    const trackingIndex = latestTracking
      ? ORDER_PROGRESS_STEPS.findIndex((step) => step.key === normalizeLifecycleStatus(latestTracking.status))
      : -1
    if (trackingIndex >= 0) {
      currentIndex = trackingIndex
    } else {
      currentIndex = normalizeLifecycleStatus(order.fulfillment_status) === 'fulfilled' ? 1 : 0
    }
  }

  const steps: OrderProgressStep[] = ORDER_PROGRESS_STEPS.map((step, index) => {
    let state: ProgressStepState = 'pending'
    if (currentIndex >= 0) {
      state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
    } else {
      state = step.key === 'processing' ? 'done' : 'pending'
    }
    return {
      key: step.key,
      label: step.label,
      state,
      timestamp: getProgressTimestamp(step.key, order, trackings),
    }
  })

  return {
    currentStatus,
    steps,
    latestTracking,
    isException: ['exception', 'failed_delivery', 'returned', 'cancelled', 'refunded', 'deleted'].includes(currentStatus),
  }
}

export default function OrderDetailPage() {
  const siteId = useSiteId()
  const params = useParams<{ orderId: string }>()
  const orderId = params.orderId
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set())
  const [trackings, setTrackings] = useState<ShipmentTracking[]>([])
  const [trackingModalOpen, setTrackingModalOpen] = useState(false)
  const [trackingSaving, setTrackingSaving] = useState(false)
  const [trackingActionId, setTrackingActionId] = useState<string | null>(null)
  const [trackingMenuId, setTrackingMenuId] = useState<string | null>(null)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [trackingForm, setTrackingForm] = useState<AddShipmentTrackingInput>({
    tracking_number: '',
    carrier_name: '',
    carrier_slug: '',
    tracking_url: '',
  })

  const toggleMeta = (lineItemId: string) => {
    setExpandedMeta((prev) => {
      const next = new Set(prev)
      if (next.has(lineItemId)) next.delete(lineItemId)
      else next.add(lineItemId)
      return next
    })
  }
  const actionsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [response, trackingsResponse] = await Promise.all([
          ordersApi.detail(siteId, orderId),
          ordersApi.listTrackings(siteId, orderId),
        ])
        setOrder(response.data)
        setTrackings(trackingsResponse.data)
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getApiErrorMessage(err, 'Order detail could not be loaded right now.'))
        }
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [orderId, siteId])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && actionsRef.current && !actionsRef.current.contains(target)) {
        setActionsOpen(false)
      }
      if (target instanceof Element && !target.closest('[data-tracking-menu-root]')) {
        setTrackingMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const customerName = useMemo(() => {
    if (!order) return ''
    return (
      [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ') ||
      order.customer_email ||
      'Unknown customer'
    )
  }, [order])

  const activity = useMemo<ActivityItem[]>(() => {
    if (!order) return []
    return [
      { label: `${customerName} placed this order`, timestamp: order.created_at_woo || order.created_at },
      order.paid_at_woo ? { label: 'Payment was captured', timestamp: order.paid_at_woo } : null,
      order.completed_at_woo ? { label: 'Order was fulfilled', timestamp: order.completed_at_woo } : null,
      { label: 'Order snapshot was updated', timestamp: order.modified_at_woo },
    ]
      .filter((item): item is ActivityItem => Boolean(item?.timestamp))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [customerName, order])

  const amountDue = useMemo(() => {
    if (!order) return 0
    return Math.max(order.total_amount - order.refund_amount, 0)
  }, [order])

  const customerAvatarUrl = useMemo(() => (order ? extractCustomerAvatarUrl(order.raw_order || {}) : ''), [order])
  const progress = useMemo(() => (order ? buildOrderProgress(order, trackings) : null), [order, trackings])

  const handleCopy = async (value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setActionsOpen(false)
  }

  const reloadTrackings = async () => {
    const response = await ordersApi.listTrackings(siteId, orderId)
    setTrackings(response.data)
  }

  const handleAddTracking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTrackingSaving(true)
    setTrackingError(null)
    try {
      await ordersApi.addTracking(siteId, orderId, trackingForm)
      await reloadTrackings()
      setTrackingModalOpen(false)
      setTrackingForm({ tracking_number: '', carrier_name: '', carrier_slug: '', tracking_url: '' })
    } catch (err) {
      setTrackingError(getApiErrorMessage(err, 'Tracking could not be saved.'))
    } finally {
      setTrackingSaving(false)
    }
  }

  const handleRefreshTracking = async (trackingId: string) => {
    setTrackingActionId(trackingId)
    setTrackingError(null)
    try {
      await ordersApi.refreshTracking(siteId, orderId, trackingId)
      await reloadTrackings()
    } catch (err) {
      setTrackingError(getApiErrorMessage(err, 'Tracking could not be refreshed.'))
    } finally {
      setTrackingActionId(null)
    }
  }

  const handleDeleteTracking = async (trackingId: string) => {
    setTrackingActionId(trackingId)
    setTrackingError(null)
    try {
      await ordersApi.deleteTracking(siteId, orderId, trackingId)
      await reloadTrackings()
    } catch (err) {
      setTrackingError(getApiErrorMessage(err, 'Tracking could not be deleted.'))
    } finally {
      setTrackingActionId(null)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (error || !order) {
    return <InlineErrorState body={error || 'Order detail was not found.'} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageContent>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-app-muted">
            <Link
              href={`/dashboard/${siteId}/orders`}
              className="inline-flex items-center gap-1 transition hover:text-app-strong"
            >
              <ArrowLeft className="h-4 w-4" />
              Orders
            </Link>
            <span>/</span>
            <span className="text-app-strong">Order #{order.woo_order_id}</span>
          </div>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-app-strong">
                  Order #{order.woo_order_id}
                </h1>
                <StatusChip
                  label={formatStatusLabel(order.status || 'unknown')}
                  tone={lifecycleTone(order.status || 'unknown')}
                  className="px-2.5 py-1 text-xs"
                />
                <StatusChip
                  label={formatStatusLabel(order.payment_status || 'unknown')}
                  tone={chipTone(order.payment_status || 'unknown')}
                  className="px-2.5 py-1 text-xs"
                />
                <StatusChip
                  label={formatStatusLabel(order.fulfillment_status || 'unknown')}
                  tone={chipTone(order.fulfillment_status || 'unknown')}
                  className="px-2.5 py-1 text-xs"
                />
              </div>
              <div className="mt-1.5 text-sm text-app-muted">
                Placed on {formatTimestamp(order.created_at_woo || order.created_at)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div ref={actionsRef} className="relative">
                <button
                  type="button"
                  className="btn-secondary gap-2"
                  onClick={() => {
                    setActionsOpen((value) => !value)
                  }}
                >
                  More Actions
                  <ChevronDown className="h-4 w-4" />
                </button>
                {actionsOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[220px] rounded-2xl border border-app-line bg-white p-2 shadow-card">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-app-strong transition hover:bg-slate-50"
                      onClick={() => handleCopy(order.woo_order_id)}
                    >
                      Copy order ID
                      <Copy className="h-4 w-4 text-app-soft" />
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-app-strong transition hover:bg-slate-50"
                      onClick={() => handleCopy(renderAddress(order.shipping_address))}
                    >
                      Copy shipping address
                      <MapPin className="h-4 w-4 text-app-soft" />
                    </button>
                    {order.contact && order.client_id ? (
                      <Link
                        href={`/dashboard/${siteId}/contacts/${order.client_id}`}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-app-strong transition hover:bg-slate-50"
                        onClick={() => setActionsOpen(false)}
                      >
                        Open contact record
                        <ExternalLink className="h-4 w-4 text-app-soft" />
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>

            </div>
          </div>

          {progress ? (
            <SectionCard title="Order Progress">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    label={formatStatusLabel(progress.currentStatus || 'unknown')}
                    tone={lifecycleTone(progress.currentStatus || 'unknown')}
                  />
                  {progress.latestTracking ? (
                    <span className="text-sm text-app-muted">
                      Latest tracking update: {formatTimestamp(progress.latestTracking.last_checkpoint_at || progress.latestTracking.updated_at)}
                    </span>
                  ) : (
                    <span className="text-sm text-app-muted">No carrier checkpoint yet.</span>
                  )}
                </div>

                {progress.isException ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This order is currently in an exception state. Review the latest tracking note and shipment status before taking action.
                  </div>
                ) : null}

                <div className="hidden xl:grid xl:grid-cols-5 xl:gap-3">
                  {progress.steps.map((step, index) => (
                    <div key={`rail-${step.key}`} className="relative h-6">
                      {index < progress.steps.length - 1 ? (
                        <span className="absolute left-[calc(50%+0.875rem)] right-[-0.75rem] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-slate-200">
                          <span
                            className={`block h-full rounded-full ${
                              step.state === 'done'
                                ? 'w-full bg-emerald-300'
                                : step.state === 'current'
                                  ? 'w-1/2 bg-indigo-300'
                                  : 'w-0 bg-transparent'
                            }`}
                          />
                        </span>
                      ) : null}
                      <span
                        className={`absolute left-1/2 top-1/2 inline-flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                          step.state === 'done'
                            ? 'border-emerald-300 bg-emerald-300'
                            : step.state === 'current'
                              ? 'border-indigo-300 bg-indigo-300'
                              : 'border-slate-300 bg-white'
                        }`}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 xl:grid-cols-5">
                  {progress.steps.map((step) => (
                    <div key={step.key} className="rounded-xl border border-app-line bg-slate-50/70 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                            step.state === 'done'
                              ? 'bg-emerald-100 text-emerald-700'
                              : step.state === 'current'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          <ProgressStepIcon stepKey={step.key} state={step.state} />
                        </span>
                        <span className="text-sm font-semibold text-app-strong">{step.label}</span>
                      </div>
                      <div className="mt-2 text-xs text-app-muted">
                        {step.timestamp ? formatTimestamp(step.timestamp) : step.state === 'pending' ? 'Pending' : 'Not recorded'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
            <div className="space-y-5">
              <SectionCard
                title={`Items (${order.items.length})`}
                className="px-0 py-0"
              >
                {order.items.length === 0 ? (
                  <div className="px-5 pb-5">
                    <DetailNote
                      icon={<Boxes className="h-4 w-4" />}
                      title="No line items"
                      body="Order snapshot has no line items."
                    />
                  </div>
                ) : (
                  <div>
                    {/* Column header */}
                    <div className="grid grid-cols-[minmax(0,1fr)_80px_56px_96px] gap-4 border-t border-app-line bg-slate-50/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-app-soft">
                      <span>Product</span>
                      <span className="text-right">Unit price</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Total</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {order.items.map((item) => {
                        const imageUrl = extractItemImageUrl(order.raw_order || {}, item)
                        const publicMeta = (item.meta || []).filter((m) => !m.key.startsWith('_'))
                        const privateMeta = (item.meta || []).filter((m) => m.key.startsWith('_'))
                        const hasMeta = publicMeta.length > 0 || privateMeta.length > 0
                        const isExpanded = expandedMeta.has(item.line_item_id)
                        return (
                          <div key={item.line_item_id} className="border-b border-slate-100 last:border-0">
                            <div className="grid grid-cols-[minmax(0,1fr)_80px_56px_96px] items-center gap-4 px-5 py-3">
                              {/* Product info */}
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-app-line bg-slate-50 text-app-soft">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={item.name || 'Product'} className="h-full w-full object-cover" />
                                  ) : (
                                    <Package2 className="h-5 w-5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-app-strong">
                                    {item.name || `Item ${item.line_item_id}`}
                                  </div>
                                  {formatVariantAttributes(item.variant_attributes) ? (
                                    <div className="mt-0.5 text-xs font-medium text-app-muted">
                                      {formatVariantAttributes(item.variant_attributes)}
                                    </div>
                                  ) : null}
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-app-muted">
                                    <span>SKU: {item.sku || '—'}</span>
                                    {item.variation_id ? <span>Var: {item.variation_id}</span> : null}
                                    {item.external_variant_id ? <span className="font-mono text-app-soft">ext:{item.external_variant_id}</span> : null}
                                    {hasMeta ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleMeta(item.line_item_id)}
                                        className="ml-1 font-medium text-app-soft underline underline-offset-2 transition-colors hover:text-app-strong"
                                      >
                                        {isExpanded ? 'hide meta' : `meta (${(item.meta || []).length})`}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              {/* Unit price */}
                              <div className="text-right text-sm text-app-strong">
                                {money(item.unit_price, order.currency)}
                              </div>
                              {/* Qty */}
                              <div className="text-right">
                                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-app-strong">
                                  ×{item.quantity}
                                </span>
                              </div>
                              {/* Line total */}
                              <div className="text-right text-sm font-bold text-app-strong">
                                {money(item.line_total, order.currency)}
                              </div>
                            </div>
                            {/* Expandable meta panel */}
                            {isExpanded && hasMeta ? (
                              <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                                  {publicMeta.map((m, index) => (
                                    <Fragment key={`public-${item.line_item_id}-${m.key}-${index}`}>
                                      <span className="text-xs font-medium text-app-muted">{m.key}</span>
                                      <span className="truncate text-xs text-app-strong">{String(m.value ?? '')}</span>
                                    </Fragment>
                                  ))}
                                  {privateMeta.length > 0 ? (
                                    <>
                                      <span className="col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-wider text-app-soft">Private</span>
                                      {privateMeta.map((m, index) => (
                                        <Fragment key={`private-${item.line_item_id}-${m.key}-${index}`}>
                                          <span className="font-mono text-xs text-app-soft">{m.key}</span>
                                          <span className="truncate text-xs text-app-muted">{String(m.value ?? '')}</span>
                                        </Fragment>
                                      ))}
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    {/* Subtotal footer */}
                    <div className="flex items-center justify-between border-t border-app-line bg-slate-50/80 px-5 py-3">
                      <span className="text-xs text-app-muted">{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                      <span className="text-sm font-semibold text-app-strong">{money(order.subtotal_amount, order.currency)}</span>
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Shipment Tracking"
                action={
                  <button
                    type="button"
                    className="btn-secondary gap-2"
                    onClick={() => {
                      setTrackingError(null)
                      setTrackingModalOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add Tracking
                  </button>
                }
              >
                {trackingError ? (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {trackingError}
                  </div>
                ) : null}
                {trackings.length === 0 ? (
                  <EmptyState icon={<Truck className="h-8 w-8" />} body="No tracking numbers have been added for this order." className="py-8" />
                ) : (
                  <div className="space-y-3">
                    {trackings.map((tracking) => (
                      <div key={tracking.id} className="rounded-2xl border border-app-line bg-slate-50/60 p-4">
                        <div className="flex flex-col gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusChip label={tracking.carrier_name || tracking.carrier_slug || 'Carrier'} tone="neutral" />
                              <StatusChip label={formatStatusLabel(tracking.status || 'unknown')} tone={chipTone(tracking.status)} />
                              <StatusChip label={`Woo ${formatStatusLabel(tracking.wc_push_status || 'pending')}`} tone={chipTone(tracking.wc_push_status || 'pending')} />
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-3">
                              <div className="min-w-0 flex flex-wrap items-center gap-2">
                                {tracking.tracking_url ? (
                                  <a
                                    href={tracking.tracking_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-base font-semibold text-indigo-600 hover:text-indigo-700"
                                  >
                                    {tracking.tracking_number}
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="text-base font-semibold text-app-strong">{tracking.tracking_number}</span>
                                )}
                                {tracking.provider ? (
                                  <span className="text-xs text-app-soft">via {formatStatusLabel(tracking.provider)}</span>
                                ) : null}
                              </div>
                              <div className="relative shrink-0" data-tracking-menu-root>
                                <button
                                  type="button"
                                  className="btn-secondary h-10 w-10 p-0"
                                  aria-label="Tracking actions"
                                  onClick={() => setTrackingMenuId((current) => (current === tracking.id ? null : tracking.id))}
                                >
                                  <Ellipsis className="h-4 w-4" />
                                </button>
                                {trackingMenuId === tracking.id ? (
                                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[180px] rounded-2xl border border-app-line bg-white p-2 shadow-card">
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-app-strong transition hover:bg-slate-50"
                                      disabled={trackingActionId === tracking.id}
                                      onClick={() => {
                                        setTrackingMenuId(null)
                                        void handleRefreshTracking(tracking.id)
                                      }}
                                    >
                                      Sync
                                      <RefreshCw className={`h-4 w-4 ${trackingActionId === tracking.id ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-slate-50 hover:text-red-700"
                                      disabled={trackingActionId === tracking.id}
                                      onClick={() => {
                                        setTrackingMenuId(null)
                                        void handleDeleteTracking(tracking.id)
                                      }}
                                    >
                                      Delete
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-app-line pt-3 text-sm">
                              <div className="min-w-[180px]">
                                <span className="text-app-soft">Last checkpoint:</span>{' '}
                                <span className="text-app-strong">{formatTimestamp(tracking.last_checkpoint_at)}</span>
                              </div>
                              <div className="min-w-[180px]">
                                <span className="text-app-soft">Added:</span>{' '}
                                <span className="text-app-strong">{formatTimestamp(tracking.created_at)}</span>
                              </div>
                              <div className="min-w-[180px]">
                                <span className="text-app-soft">Source:</span>{' '}
                                <span className="text-app-strong">
                                  {tracking.carrier_name || tracking.carrier_slug || 'Carrier'}
                                  {tracking.provider_tracking_id ? (
                                    <span className="ml-1 text-app-muted">#{tracking.provider_tracking_id}</span>
                                  ) : null}
                                </span>
                              </div>
                            </div>
                            {tracking.sync_error ? (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                Provider sync: {tracking.sync_error}
                              </div>
                            ) : null}
                            {tracking.wc_push_error ? (
                              <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                Woo sync: {tracking.wc_push_error}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Payment Summary"
                action={
                  <StatusChip
                    label={formatStatusLabel(order.payment_status || 'unknown')}
                    tone={paymentSummaryTone(order.payment_status || 'unknown')}
                    className="px-3 py-1.5 text-xs"
                  />
                }
              >
                <div className="space-y-2">
                  {[
                    { label: 'Subtotal', amount: order.subtotal_amount },
                    { label: 'Shipping', amount: order.shipping_amount },
                    { label: 'Tax', amount: order.tax_amount },
                    { label: 'Discount', amount: -order.discount_amount },
                  ].map(({ label, amount }) => (
                    <div key={label} className="flex items-center justify-between text-sm text-app-strong">
                      <span className="text-app-muted">{label}</span>
                      <span className={amount < 0 ? 'text-emerald-600' : ''}>{money(Math.abs(amount), order.currency)}{amount < 0 ? ' off' : ''}</span>
                    </div>
                  ))}
                  {/* Amount due */}
                  {order.refund_amount > 0 ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-app-muted">Refunded</span>
                      <span className="text-red-600">-{money(order.refund_amount, order.currency)}</span>
                    </div>
                  ) : null}
                  <div className="border-t border-app-line pt-3">
                    <div className="flex items-end justify-between gap-4">
                      <div className="text-sm font-semibold text-app-strong">
                        Amount due
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tabular-nums text-app-strong">
                          {money(amountDue, order.currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Order Activity">
                <div className="space-y-5">
                  <div className="rounded-xl border border-app-line bg-slate-50/60 p-4">
                    <label className="block text-sm font-medium text-app-strong">
                      Internal note
                    </label>
                    <p className="mt-0.5 text-xs text-app-muted">Your customer will not see this.</p>
                    <textarea
                      className="mt-3 min-h-[80px] w-full rounded-xl border border-app-line bg-white px-3 py-2 text-sm text-app-strong outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                      placeholder="Add a note…"
                    />
                  </div>

                  <div className="space-y-0">
                    {activity.map((item, index) => (
                      <div
                        key={`${item.label}-${item.timestamp}`}
                        className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-4 pl-0 last:pb-0"
                      >
                        {/* Timeline spine */}
                        <div className="flex flex-col items-center">
                          <span className="mt-1 h-3 w-3 rounded-full border-2 border-indigo-400 bg-white" />
                          {index < activity.length - 1 ? (
                            <span className="mt-1 w-px flex-1 bg-slate-200" />
                          ) : null}
                        </div>
                        {/* Content */}
                        <div className="min-w-0 pb-1">
                          <div className="text-sm font-medium text-app-strong">{item.label}</div>
                          <div className="mt-0.5 text-xs text-app-muted">
                            {new Date(item.timestamp).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="space-y-5">
              <SectionCard title="Order Info">
                <div className="space-y-5">
                  <div>
                    <div className="text-sm font-medium text-app-muted">Contact info</div>
                    <div className="mt-3 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-subtle font-semibold text-app-strong">
                        {customerAvatarUrl ? (
                          <img
                            src={customerAvatarUrl}
                            alt={customerName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          getInitials(customerName, order.customer_email || order.contact?.email || '')
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-app-strong">{customerName}</div>
                        <div className="mt-0.5 text-sm text-app-muted">
                          {order.customer_email || order.contact?.email || 'No email'}
                        </div>
                        <div className="mt-0.5 text-xs text-app-soft">
                          {order.customer_phone || order.contact?.phone || 'No phone'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-app-line pt-3">
                    <div className="text-sm font-medium text-app-muted">Delivery method</div>
                    <div className="mt-1.5 text-sm text-app-strong">
                      {order.delivery_method || '—'}
                    </div>
                  </div>

                  <div className="border-t border-app-line pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-app-soft">Shipping address</p>
                        <div className="mt-2 space-y-0.5">
                          <AddressBlock address={order.shipping_address} />
                        </div>
                      </div>
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-app-soft" />
                    </div>
                  </div>

                  <div className="border-t border-app-line pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-app-soft">Billing address</p>
                        <div className="mt-2 space-y-0.5">
                          {JSON.stringify(order.billing_address) === JSON.stringify(order.shipping_address) ? (
                            <p className="text-sm text-app-muted">Same as shipping address</p>
                          ) : (
                            <AddressBlock address={order.billing_address} showPhone />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Order Snapshot">
                <DetailRow label="Client ID" value={order.client_id || '-'} />
                <DetailRow label="Session ID" value={order.session_id || '-'} />
                <DetailRow label="Woo customer" value={order.woo_customer_id || '-'} />
                <DetailRow label="Paid at" value={formatTimestamp(order.paid_at_woo)} />
                <DetailRow label="Completed at" value={formatTimestamp(order.completed_at_woo)} />
                <DetailRow label="Synced at" value={formatTimestamp(order.synced_at)} />
              </SectionCard>

              <SectionCard title="Attribution">
                {Object.keys(order.attribution || {}).length === 0 ? (
                  <DetailNote
                    icon={<ReceiptText className="h-4 w-4" />}
                    title="No attribution data"
                    body="Source and campaign metadata were not attached to this order snapshot."
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(['source', 'medium', 'campaign', 'term', 'content', 'channel'] as string[])
                        .filter((key) => order.attribution[key] !== undefined && order.attribution[key] !== null && order.attribution[key] !== '')
                        .map((key) => (
                          <div key={key} className="rounded-xl border border-app-line bg-slate-50 px-3 py-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-app-soft">
                              {key}
                            </div>
                            <div className="mt-0.5 text-sm font-medium text-app-strong">
                              {String(order.attribution[key])}
                            </div>
                          </div>
                        ))}
                    </div>
                    {Object.keys(order.attribution).some((k) => !['source','medium','campaign','term','content','channel'].includes(k)) ? (
                      <details className="rounded-xl border border-app-line">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-app-muted hover:text-app-strong">
                          Show full payload
                        </summary>
                        <pre className="overflow-x-auto px-3 pb-3 pt-1 text-xs text-app-strong">
                          {JSON.stringify(order.attribution || {}, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Quick Tools">
                <div className="space-y-3">
                  {order.contact && order.client_id ? (
                    <Link
                      href={`/dashboard/${siteId}/contacts/${order.client_id}`}
                      className="btn-secondary w-full justify-between"
                    >
                      <span className="inline-flex items-center gap-2">
                        <UserRound className="h-4 w-4" />
                        Open contact record
                      </span>
                      <span>Available</span>
                    </Link>
                  ) : (
                    <div className="btn-secondary w-full cursor-default justify-between opacity-70">
                      <span className="inline-flex items-center gap-2">
                        <UserRound className="h-4 w-4" />
                        Open contact record
                      </span>
                      <span>Missing</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-secondary w-full justify-between"
                    onClick={() => handleCopy(renderAddress(order.shipping_address))}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Copy className="h-4 w-4" />
                      Copy shipping address
                    </span>
                    <span>Ready</span>
                  </button>
                  <div className="btn-secondary w-full cursor-default justify-between opacity-80">
                    <span className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4" />
                      Last modified
                    </span>
                    <span>{formatTimestamp(order.modified_at_woo)}</span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
        {trackingModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <form onSubmit={handleAddTracking} className="w-full max-w-lg rounded-xl border border-app-line bg-white p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-app-strong">Add Tracking</h2>
                <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={() => setTrackingModalOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-app-muted">Tracking number</span>
                  <input
                    className="input mt-1"
                    value={trackingForm.tracking_number}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, tracking_number: event.target.value }))}
                    required
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-app-muted">Carrier name</span>
                  <input
                    className="input mt-1"
                    value={trackingForm.carrier_name || ''}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, carrier_name: event.target.value }))}
                    placeholder="UPS, FedEx, DHL..."
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-app-muted">Carrier slug</span>
                  <input
                    className="input mt-1"
                    value={trackingForm.carrier_slug || ''}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, carrier_slug: event.target.value }))}
                    placeholder="ups, fedex, dhl..."
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-app-muted">Tracking URL</span>
                  <input
                    className="input mt-1"
                    type="url"
                    value={trackingForm.tracking_url || ''}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, tracking_url: event.target.value }))}
                    placeholder="https://..."
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setTrackingModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={trackingSaving}>
                  {trackingSaving ? 'Saving...' : 'Save tracking'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
