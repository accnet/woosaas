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
  User,
  ShieldCheck,
  Zap
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
    <address className="not-italic space-y-1">
      {lines.map((line, i) => (
        <p
          key={i}
          className={
            i === 0
              ? 'text-sm font-semibold text-app-strong font-sans'
              : 'text-sm text-slate-600 font-sans'
          }
        >
          {line}
        </p>
      ))}
      {showPhone && phone ? (
        <p className="mt-1.5 text-xs text-app-muted bg-slate-50 border border-slate-100 rounded px-2 py-0.5 inline-block">{phone}</p>
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

// Custom technical avatar helper
function TextAvatar({ name, email }: { name: string; email: string }) {
  const initials = getInitials(name, email)
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-primary font-bold text-sm text-white shadow-sm ring-2 ring-white">
      {initials}
    </div>
  )
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

// Extract specific items images
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
  const className = `h-4 w-4 transition-colors duration-200 ${
    state === 'done'
      ? 'text-emerald-600'
      : state === 'current'
        ? 'text-indigo-600'
        : 'text-slate-400'
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

function hasProviderTrackingUpdate(tracking: ShipmentTracking) {
  return Boolean(
    tracking.last_synced_at ||
      tracking.last_checkpoint_at ||
      tracking.provider_tracking_id ||
      tracking.status_raw ||
      (tracking.provider && tracking.provider.toLowerCase() !== 'manual'),
  )
}

function getTrackingTime(tracking: ShipmentTracking) {
  return new Date(tracking.last_checkpoint_at || tracking.last_synced_at || tracking.updated_at || tracking.created_at).getTime()
}

function getProgressTimestamp(status: string, order: OrderDetail, trackings: ShipmentTracking[]) {
  const providerTrackings = trackings.filter(hasProviderTrackingUpdate)
  const latestTracking = trackings
    .filter((tracking) => normalizeLifecycleStatus(tracking.status) === status)
    .sort((a, b) => getTrackingTime(b) - getTrackingTime(a))[0]
  const latestProviderTracking = providerTrackings
    .filter((tracking) => normalizeLifecycleStatus(tracking.status) === status)
    .sort((a, b) => getTrackingTime(b) - getTrackingTime(a))[0]

  switch (status) {
    case 'processing':
      return order.paid_at_woo || order.created_at_woo || order.created_at
    case 'fulfilled':
      return latestTracking?.created_at || order.completed_at_woo || null
    case 'in_transit':
    case 'out_for_delivery':
    case 'delivered':
      return latestProviderTracking?.last_checkpoint_at || latestProviderTracking?.last_synced_at || null
    default:
      return null
  }
}

function buildOrderProgress(order: OrderDetail, trackings: ShipmentTracking[]) {
  const providerTrackings = trackings.filter(hasProviderTrackingUpdate)
  const latestTracking = [...trackings].sort((a, b) => getTrackingTime(b) - getTrackingTime(a))[0] || null
  const latestProviderTracking = [...providerTrackings].sort((a, b) => getTrackingTime(b) - getTrackingTime(a))[0] || null
  const currentStatus = trackings.length > 0
    ? normalizeLifecycleStatus(latestProviderTracking?.status || 'fulfilled')
    : normalizeLifecycleStatus(order.status || 'processing')

  let currentIndex = ORDER_PROGRESS_STEPS.findIndex((step) => step.key === currentStatus)
  if (currentIndex === -1) {
    const trackingIndex = latestProviderTracking
      ? ORDER_PROGRESS_STEPS.findIndex((step) => step.key === normalizeLifecycleStatus(latestProviderTracking.status))
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
      'Unknown Customer'
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
        <div className="space-y-6">
          {/* Breadcrumb row */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-tight text-app-soft uppercase">
            <Link
              href={`/dashboard/${siteId}/orders`}
              className="inline-flex items-center gap-1 transition hover:text-indigo-600"
            >
              <ArrowLeft className="h-3 w-3 transition-transform duration-150 hover:-translate-x-0.5" />
              Orders
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-500">ID: #{order.woo_order_id}</span>
          </div>

          {/* Header section with statuses & dropdown actions */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between border-b border-slate-100 pb-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-800 font-sans">
                  Order #{order.woo_order_id}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusChip
                    label={formatStatusLabel(order.status || 'unknown')}
                    tone={lifecycleTone(order.status || 'unknown')}
                    className="px-2 py-0.5 text-[10px] font-bold"
                  />
                  <StatusChip
                    label={formatStatusLabel(order.payment_status || 'unknown')}
                    tone="neutral"
                    className="px-2 py-0.5 text-[10px] font-bold"
                  />
                  <StatusChip
                    label={formatStatusLabel(order.fulfillment_status || 'unknown')}
                    tone={chipTone(order.fulfillment_status || 'unknown')}
                    className="px-2 py-0.5 text-[10px] font-bold"
                  />
                </div>
              </div>
              <div className="mt-1.5 text-xs text-app-muted font-medium">
                Placed on <span className="font-semibold text-slate-700">{formatTimestamp(order.created_at_woo || order.created_at)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div ref={actionsRef} className="relative">
                <button
                  type="button"
                  className="btn-secondary text-xs font-semibold gap-2 border-slate-200/80 hover:bg-slate-50 transition-all duration-200"
                  onClick={() => setActionsOpen((value) => !value)}
                >
                  More Actions
                  <ChevronDown className={`h-3.5 w-3.5 text-app-soft transition-transform duration-200 ${actionsOpen ? 'rotate-180' : ''}`} />
                </button>
                {actionsOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[220px] rounded-2xl border border-slate-100 bg-white/95 p-2 shadow-[0_12px_40px_rgba(99,102,241,0.08)] backdrop-blur-md animate-slide-up">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-indigo-600"
                      onClick={() => handleCopy(order.woo_order_id)}
                    >
                      Copy Order ID
                      <Copy className="h-3.5 w-3.5 text-app-soft" />
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-indigo-600"
                      onClick={() => handleCopy(renderAddress(order.shipping_address))}
                    >
                      Copy Shipping Address
                      <MapPin className="h-3.5 w-3.5 text-app-soft" />
                    </button>
                    {order.contact && order.client_id ? (
                      <Link
                        href={`/dashboard/${siteId}/contacts/${order.client_id}`}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-indigo-600"
                        onClick={() => setActionsOpen(false)}
                      >
                        Open Contact Record
                        <ExternalLink className="h-3.5 w-3.5 text-app-soft" />
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              
              {/* Product Items card */}
              <SectionCard
                title={`Items (${order.items.length})`}
                className="px-0 py-0 overflow-hidden border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)]"
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
                    {/* Header Columns */}
                    <div className="grid grid-cols-[minmax(0,1fr)_85px_50px_95px] gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-app-soft">
                      <span>Product Details</span>
                      <span className="text-right">Unit Price</span>
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
                          <div key={item.line_item_id} className="border-b border-slate-100 last:border-0 bg-white">
                            <div className="grid grid-cols-[minmax(0,1fr)_85px_50px_95px] items-center gap-4 px-5 py-4">
                              {/* Product Info image & attributes */}
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 text-app-soft shadow-inner">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={item.name || 'Product'} className="h-full w-full object-cover" />
                                  ) : (
                                    <Package2 className="h-5 w-5 text-slate-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-bold text-app-strong font-sans">
                                    {item.name || `Item ${item.line_item_id}`}
                                  </div>
                                  {formatVariantAttributes(item.variant_attributes) ? (
                                    <div className="mt-0.5 text-[11px] font-semibold text-app-muted">
                                      {formatVariantAttributes(item.variant_attributes)}
                                    </div>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-app-soft">
                                    <span className="font-semibold">SKU: {item.sku || '—'}</span>
                                    {item.variation_id ? <span className="text-slate-300">|</span> : null}
                                    {item.variation_id ? <span className="font-semibold">Var: {item.variation_id}</span> : null}
                                    {item.external_variant_id ? <span className="text-slate-300">|</span> : null}
                                    {item.external_variant_id ? <span className="text-slate-400">ext: {item.external_variant_id}</span> : null}
                                    {hasMeta ? (
                                      <>
                                        <span className="text-slate-300">|</span>
                                        <button
                                          type="button"
                                          onClick={() => toggleMeta(item.line_item_id)}
                                          className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-tight text-[9px] underline"
                                        >
                                          {isExpanded ? 'Hide system metadata' : `Metadata logs (${(item.meta || []).length})`}
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              {/* Unit Price */}
                              <div className="text-right text-xs font-semibold text-slate-700">
                                {money(item.unit_price, order.currency)}
                              </div>
                              {/* Qty */}
                              <div className="text-right">
                                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-slate-100 px-1 text-[10px] font-bold text-slate-700">
                                  ×{item.quantity}
                                </span>
                              </div>
                              {/* Line Total */}
                              <div className="text-right text-xs font-bold text-slate-800">
                                {money(item.line_total, order.currency)}
                              </div>
                            </div>
                            {/* Expandable Meta Panel (Terminal Style) */}
                            {isExpanded && hasMeta ? (
                              <div className="border-t border-slate-900 bg-slate-950 px-5 py-4 font-mono text-[11px]">
                                <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                  <span>Variable Snapshot logs</span>
                                  <span className="text-indigo-500/80">WooSaaS Engine v1.0</span>
                                </div>
                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                                  {publicMeta.map((m, index) => (
                                    <Fragment key={`public-${item.line_item_id}-${m.key}-${index}`}>
                                      <span className="text-indigo-400 font-bold">{m.key}</span>
                                      <span className="text-slate-200 break-all">{String(m.value ?? '')}</span>
                                    </Fragment>
                                  ))}
                                  {privateMeta.length > 0 ? (
                                    <>
                                      <span className="col-span-2 border-t border-slate-900 pt-2 mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">System internal headers</span>
                                      {privateMeta.map((m, index) => (
                                        <Fragment key={`private-${item.line_item_id}-${m.key}-${index}`}>
                                          <span className="text-emerald-500 font-bold">{m.key}</span>
                                          <span className="text-slate-400 break-all">{String(m.value ?? '')}</span>
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
                    {/* Items total bar */}
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-app-soft">Total quantity</span>
                      <span className="text-sm font-bold text-slate-800">{money(order.subtotal_amount, order.currency)}</span>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Order Progress Timeline */}
              {progress ? (
                <SectionCard title="Order Progress" className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white">
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <StatusChip
                          label={formatStatusLabel(progress.currentStatus || 'unknown')}
                          tone={lifecycleTone(progress.currentStatus || 'unknown')}
                          className="px-2.5 py-0.5 text-xs font-bold"
                        />
                        {progress.latestTracking ? (
                          <span className="text-xs font-medium text-app-soft">
                            Checkpoint: <span className="text-slate-600">{formatTimestamp(progress.latestTracking.last_checkpoint_at || progress.latestTracking.updated_at)}</span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-app-soft">No sync checkpoints yet.</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-app-muted">
                        <Zap className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Realtime delivery tracking sync is active</span>
                      </div>
                    </div>

                    {progress.isException ? (
                      <div className="rounded-xl border border-amber-200/50 bg-amber-50/40 px-4 py-3 text-xs leading-relaxed text-amber-800 font-medium">
                        This order is currently flagged with an active transport exception. Please investigate the latest shipment logs below.
                      </div>
                    ) : null}

                    {/* Progress grid timeline */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {progress.steps.map((step, index) => (
                        <div 
                          key={step.key} 
                          className={`relative rounded-xl border p-3 text-center transition-all duration-200 ${
                            step.state === 'done'
                              ? 'bg-emerald-50/20 border-emerald-100/60 shadow-sm'
                              : step.state === 'current'
                                ? 'bg-indigo-50/20 border-indigo-100/60 shadow-[0_4px_12px_rgba(99,102,241,0.03)]'
                                : 'bg-slate-50/30 border-slate-100'
                          }`}
                        >
                          {index < progress.steps.length - 1 ? (
                            <span className="absolute left-full top-7 z-0 hidden h-0.5 w-4 -translate-y-1/2 rounded-full bg-slate-100 lg:block">
                              <span
                                className={`block h-full rounded-full transition-all duration-300 ${
                                  step.state === 'done'
                                    ? 'w-full bg-emerald-400'
                                    : step.state === 'current'
                                      ? 'w-1/2 bg-indigo-400'
                                      : 'w-0 bg-transparent'
                                }`}
                              />
                            </span>
                          ) : null}
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                                step.state === 'done'
                                  ? 'bg-emerald-100/70 text-emerald-700 ring-2 ring-emerald-50'
                                  : step.state === 'current'
                                    ? 'bg-indigo-100/70 text-indigo-700 ring-2 ring-indigo-50 animate-pulse'
                                    : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              <ProgressStepIcon stepKey={step.key} state={step.state} />
                            </span>
                            <span className="text-xs font-bold leading-tight text-app-strong">{step.label}</span>
                          </div>
                          <div className="mt-2 text-[10px] text-app-soft font-medium truncate" title={step.timestamp ? new Date(step.timestamp).toLocaleString() : ''}>
                            {step.timestamp ? new Date(step.timestamp).toLocaleDateString([], {month: '2-digit', day: '2-digit'}) + ' ' + new Date(step.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false}) : step.state === 'pending' ? 'Pending' : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>
              ) : null}

              {/* Shipment Tracking Card */}
              <SectionCard
                title="Shipment Tracking"
                className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white"
                action={
                  <button
                    type="button"
                    className="btn-primary text-xs font-semibold gap-1.5 h-9 px-3.5 shadow-sm transition-all duration-200"
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
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-xs leading-relaxed text-red-700 font-medium font-mono">
                    ERROR: {trackingError}
                  </div>
                ) : null}
                {trackings.length === 0 ? (
                  <EmptyState icon={<Truck className="h-9 w-9 text-slate-300" />} body="No tracking numbers have been added for this order." className="py-10 bg-white" />
                ) : (
                  <div className="space-y-4">
                    {trackings.map((tracking) => (
                      <div key={tracking.id} className="card-glass relative overflow-hidden p-5 border-slate-100 bg-gradient-to-r from-slate-50/30 to-white hover:shadow-sm">
                        <div className="absolute top-0 left-0 w-[3px] h-full bg-slate-300" />
                        <div className="flex flex-col gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusChip label={tracking.carrier_name || tracking.carrier_slug || 'Carrier'} tone="neutral" className="px-2 py-0.5 text-[9px] font-bold" />
                              <StatusChip label={formatStatusLabel(tracking.status || 'unknown')} tone={chipTone(tracking.status)} className="px-2 py-0.5 text-[9px] font-bold" />
                              <StatusChip label={`Woo: ${formatStatusLabel(tracking.wc_push_status || 'pending')}`} tone={chipTone(tracking.wc_push_status || 'pending')} className="px-2 py-0.5 text-[9px] font-bold" />
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-3">
                              <div className="min-w-0 flex flex-wrap items-center gap-2">
                                {tracking.tracking_url ? (
                                  <a
                                    href={tracking.tracking_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                  >
                                    {tracking.tracking_number}
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="text-sm font-bold text-app-strong">{tracking.tracking_number}</span>
                                )}
                                {tracking.provider ? (
                                  <span className="text-[10px] font-semibold text-app-soft uppercase tracking-wider">[{tracking.provider}]</span>
                                ) : null}
                              </div>
                              <div className="relative shrink-0" data-tracking-menu-root>
                                <button
                                  type="button"
                                  className="btn-secondary h-9 w-9 p-0 border-slate-200/80 hover:bg-slate-50 transition-all duration-150"
                                  aria-label="Tracking actions"
                                  onClick={() => setTrackingMenuId((current) => (current === tracking.id ? null : tracking.id))}
                                >
                                  <Ellipsis className="h-4 w-4 text-app-soft" />
                                </button>
                                {trackingMenuId === tracking.id ? (
                                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[180px] rounded-2xl border border-slate-100 bg-white/95 p-1.5 shadow-[0_12px_40px_rgba(99,102,241,0.08)] backdrop-blur-md animate-slide-up">
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-indigo-600"
                                      disabled={trackingActionId === tracking.id}
                                      onClick={() => {
                                        setTrackingMenuId(null)
                                        void handleRefreshTracking(tracking.id)
                                      }}
                                    >
                                      Sync Provider
                                      <RefreshCw className={`h-3.5 w-3.5 text-app-soft ${trackingActionId === tracking.id ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50/50 hover:text-red-700"
                                      disabled={trackingActionId === tracking.id}
                                      onClick={() => {
                                        setTrackingMenuId(null)
                                        void handleDeleteTracking(tracking.id)
                                      }}
                                    >
                                      Delete Tracking
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-[11px] font-medium text-app-soft">
                              <div>
                                Checkpoint: <span className="text-slate-700 font-semibold">{formatTimestamp(tracking.last_checkpoint_at)}</span>
                              </div>
                              <div>
                                Created: <span className="text-slate-700 font-semibold">{formatTimestamp(tracking.created_at)}</span>
                              </div>
                              <div>
                                Carrier ID: <span className="text-slate-700 font-semibold">
                                  {tracking.carrier_name || tracking.carrier_slug || 'Carrier'}
                                  {tracking.provider_tracking_id ? (
                                    <span className="ml-1 text-indigo-600 font-bold">#{tracking.provider_tracking_id}</span>
                                  ) : null}
                                </span>
                              </div>
                            </div>
                            {tracking.sync_error ? (
                              <div className="mt-3 rounded-xl border border-red-100 bg-red-50/20 px-3 py-2.5 text-[10px] font-mono text-red-600 leading-relaxed break-all">
                                PROVIDER SYNC EXCEPTION: {tracking.sync_error}
                              </div>
                            ) : null}
                            {tracking.wc_push_error ? (
                              <div className="mt-2 rounded-xl border border-red-100 bg-red-50/20 px-3 py-2.5 text-[10px] font-mono text-red-600 leading-relaxed break-all">
                                WOO PUSH FAILURE LOG: {tracking.wc_push_error}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Payment Summary */}
              <SectionCard
                title="Payment Summary"
                className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white"
                action={
                  <StatusChip
                    label={formatStatusLabel(order.payment_status || 'unknown')}
                    tone={paymentSummaryTone(order.payment_status || 'unknown')}
                    className="px-2.5 py-0.5 text-xs font-bold"
                  />
                }
              >
                <div className="space-y-3 font-sans">
                  {[
                    { label: 'Subtotal items value', amount: order.subtotal_amount },
                    { label: 'Shipping and delivery charge', amount: order.shipping_amount },
                    { label: 'VAT / Tax capture', amount: order.tax_amount },
                    { label: 'Campaign coupons & discounts', amount: -order.discount_amount },
                  ].map(({ label, amount }) => (
                    <div key={label} className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>{label}</span>
                      <span className={`text-slate-800 font-semibold ${amount < 0 ? 'text-emerald-600' : ''}`}>{money(Math.abs(amount), order.currency)}{amount < 0 ? ' off' : ''}</span>
                    </div>
                  ))}
                  {/* Refund item if existing */}
                  {order.refund_amount > 0 ? (
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-red-600">Total snapshot refund</span>
                      <span className="text-red-600 font-bold">-{money(order.refund_amount, order.currency)}</span>
                    </div>
                  ) : null}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-app-soft">
                        Amount Due Snapshot
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-extrabold text-slate-800">
                          {money(amountDue, order.currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Order Activity Timeline */}
              <SectionCard title="Order Activity" className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white">
                <div className="relative pl-2.5 space-y-4 border-l border-slate-100">
                  {activity.map((item, index) => (
                    <div
                      key={`${item.label}-${item.timestamp}`}
                      className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 items-start"
                    >
                      <span className={`absolute left-[-15.5px] top-1.5 h-2.5 w-2.5 rounded-full border bg-white transition-all duration-200 ${index === 0 ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-300'}`} />
                      <div className="col-start-2 min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50/80 transition-colors p-3">
                        <div className="text-xs font-bold text-slate-800 font-sans">{item.label}</div>
                        <div className="mt-1 text-[10px] text-app-soft font-mono font-medium">
                          {new Date(item.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Sidebar information grids */}
            <div className="space-y-6">
              <SectionCard title="Customer Info" className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white">
                <div className="space-y-4">
                  <div className="flex items-start gap-3.5">
                    {customerAvatarUrl ? (
                      <img
                        src={customerAvatarUrl}
                        alt={customerName}
                        className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-indigo-50 shadow-inner"
                      />
                    ) : (
                      <TextAvatar name={customerName} email={order.customer_email || order.contact?.email || ''} />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-app-strong font-sans">{customerName}</div>
                      <div className="mt-0.5 text-xs text-app-soft truncate">
                        {order.customer_email || order.contact?.email || 'No email registered'}
                      </div>
                      {order.customer_phone || order.contact?.phone ? (
                        <div className="mt-1.5 text-[10px] text-indigo-600 bg-indigo-50/30 border border-indigo-100/30 rounded px-1.5 py-0.5 inline-block font-semibold">
                          {order.customer_phone || order.contact?.phone}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Delivery Method</div>
                    <div className="mt-1 text-xs font-bold text-slate-800 font-sans">
                      {order.delivery_method || 'Standard Logistics Gateway'}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Shipping Address</p>
                        <div className="mt-2 space-y-0.5">
                          <AddressBlock address={order.shipping_address} />
                        </div>
                      </div>
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-app-soft" />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Billing Address</p>
                        <div className="mt-2 space-y-0.5">
                          {JSON.stringify(order.billing_address) === JSON.stringify(order.shipping_address) ? (
                            <p className="text-xs font-medium text-app-soft">Same as shipping address</p>
                          ) : (
                            <AddressBlock address={order.billing_address} showPhone />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Order Sync Snapshot details */}
              <SectionCard title="Order Sync Snapshot" className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white">
                <div className="space-y-2.5 text-[11px]">
                  <DetailRow label="Client ID" value={<span className="font-semibold text-slate-700 truncate max-w-[140px] block" title={order.client_id || undefined}>{order.client_id || '—'}</span>} />
                  <DetailRow label="Session ID" value={<span className="font-semibold text-slate-700 truncate max-w-[140px] block" title={order.session_id || undefined}>{order.session_id || '—'}</span>} />
                  <DetailRow label="Woo Customer ID" value={<span className="font-semibold text-slate-700">{order.woo_customer_id || '—'}</span>} />
                  <DetailRow label="Paid At Woo" value={<span className="font-semibold text-slate-700">{order.paid_at_woo ? new Date(order.paid_at_woo).toLocaleDateString() : '—'}</span>} />
                  <DetailRow label="Completed At Woo" value={<span className="font-semibold text-slate-700">{order.completed_at_woo ? new Date(order.completed_at_woo).toLocaleDateString() : '—'}</span>} />
                  <DetailRow label="Synced Database" value={<span className="font-semibold text-slate-700">{order.synced_at ? new Date(order.synced_at).toLocaleDateString() : '—'}</span>} />
                </div>
              </SectionCard>

              {/* Attribution Grid Card */}
              <SectionCard title="Campaign Attribution" className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white">
                {Object.keys(order.attribution || {}).length === 0 ? (
                  <DetailNote
                    icon={<ReceiptText className="h-4 w-4 text-slate-400" />}
                    title="No attribution metadata"
                    body="Source and campaign variables were not attached to this order snapshot."
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {(['source', 'medium', 'campaign', 'term', 'content', 'channel'] as string[])
                        .filter((key) => order.attribution[key] !== undefined && order.attribution[key] !== null && order.attribution[key] !== '')
                        .map((key) => (
                          <div key={key} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-app-soft">
                              {key}
                            </div>
                            <div className="mt-0.5 text-xs font-bold text-slate-800 font-sans truncate">
                              {String(order.attribution[key])}
                            </div>
                          </div>
                        ))}
                    </div>
                    {Object.keys(order.attribution).some((k) => !['source','medium','campaign','term','content','channel'].includes(k)) ? (
                      <details className="group rounded-xl border border-slate-200 bg-slate-900 border-slate-800 overflow-hidden">
                        <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-between font-sans">
                          <span>Attribution Schema</span>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform duration-200 group-open:rotate-180" />
                        </summary>
                        <pre className="overflow-x-auto p-4 pt-1 font-mono text-[10px] text-emerald-400 bg-slate-950 leading-relaxed border-t border-slate-900">
                          {JSON.stringify(order.attribution || {}, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                )}
              </SectionCard>

              {/* Quick Tools buttons */}
              <SectionCard title="Quick Tools" className="border-slate-100/80 shadow-[0_4px_20px_rgba(99,102,241,0.01)] bg-white">
                <div className="space-y-2.5 font-sans">
                  {order.contact && order.client_id ? (
                    <Link
                      href={`/dashboard/${siteId}/contacts/${order.client_id}`}
                      className="btn-secondary w-full justify-between text-xs font-semibold h-10 border-slate-200/80 hover:bg-slate-50 hover:text-indigo-600 transition-all duration-150"
                    >
                      <span className="inline-flex items-center gap-2">
                        <UserRound className="h-3.5 w-3.5 text-indigo-500" />
                        Open contact record
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 border border-slate-100 rounded">Available</span>
                    </Link>
                  ) : (
                    <div className="btn-secondary w-full cursor-not-allowed justify-between text-xs font-semibold h-10 border-slate-100 opacity-60">
                      <span className="inline-flex items-center gap-2 text-slate-400">
                        <UserRound className="h-3.5 w-3.5 text-slate-300" />
                        Open contact record
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 border border-slate-100 rounded">Missing</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-secondary w-full justify-between text-xs font-semibold h-10 border-slate-200/80 hover:bg-slate-50 hover:text-indigo-600 transition-all duration-150"
                    onClick={() => handleCopy(renderAddress(order.shipping_address))}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Copy className="h-3.5 w-3.5 text-indigo-500" />
                      Copy shipping address
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 border border-slate-100 rounded">Ready</span>
                  </button>
                  <div className="btn-secondary w-full cursor-default justify-between text-xs font-semibold h-10 border-slate-100 bg-slate-50/20 opacity-80">
                    <span className="inline-flex items-center gap-2 text-slate-500">
                      <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                      Last modified at
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-600">{order.modified_at_woo ? new Date(order.modified_at_woo).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>

        {/* Add Tracking Modal */}
        {trackingModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-md px-4 transition-all duration-300">
            <form onSubmit={handleAddTracking} className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white/95 p-6 shadow-[0_24px_80px_rgba(99,102,241,0.15)] animate-slide-up">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-indigo-600">
                  <Truck className="h-5 w-5" />
                  <h2 className="text-sm font-bold uppercase tracking-wider">Add Shipment Tracking</h2>
                </div>
                <button type="button" className="btn-secondary h-9 w-9 p-0 rounded-xl border-slate-200/80 hover:bg-slate-50 transition-colors" onClick={() => setTrackingModalOpen(false)}>
                  <X className="h-4 w-4 text-app-soft" />
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Tracking number</span>
                  <input
                    className="input mt-1.5 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 text-sm"
                    value={trackingForm.tracking_number}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, tracking_number: event.target.value }))}
                    required
                    autoFocus
                    placeholder="Enter air waybill tracking ID..."
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Carrier name</span>
                  <input
                    className="input mt-1.5 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 text-xs font-semibold"
                    value={trackingForm.carrier_name || ''}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, carrier_name: event.target.value }))}
                    placeholder="UPS, FedEx, DHL, USPS..."
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Carrier slug</span>
                  <input
                    className="input mt-1.5 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 text-xs"
                    value={trackingForm.carrier_slug || ''}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, carrier_slug: event.target.value }))}
                    placeholder="ups, fedex, dhl, usps..."
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-soft">Tracking URL</span>
                  <input
                    className="input mt-1.5 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 text-xs"
                    type="url"
                    value={trackingForm.tracking_url || ''}
                    onChange={(event) => setTrackingForm((value) => ({ ...value, tracking_url: event.target.value }))}
                    placeholder="https://..."
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" className="btn-secondary text-xs font-semibold h-10 px-4 border-slate-200/80 hover:bg-slate-50 transition-colors" onClick={() => setTrackingModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs font-semibold h-10 px-4 transition-all duration-200" disabled={trackingSaving}>
                  {trackingSaving ? 'Saving snapshot...' : 'Save Tracking'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
