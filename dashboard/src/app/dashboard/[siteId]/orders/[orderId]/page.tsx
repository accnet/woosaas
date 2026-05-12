'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import axios from 'axios'
import {
  ArrowLeft,
  Boxes,
  ChevronDown,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  MapPin,
  Package2,
  ReceiptText,
  UserRound,
} from 'lucide-react'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { DetailNote } from '@/components/ui/detail-note'
import { DetailRow } from '@/components/ui/detail-row'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import type { OrderDetail, OrderItem } from '@/lib/types'

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
  if (normalized === 'paid' || normalized === 'fulfilled' || normalized === 'completed') return 'good'
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'unfulfilled') return 'warn'
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'refunded' || normalized === 'unpaid') return 'danger'
  return 'neutral'
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

export default function OrderDetailPage() {
  const siteId = useSiteId()
  const params = useParams<{ orderId: string }>()
  const orderId = params.orderId
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set())

  const toggleMeta = (lineItemId: string) => {
    setExpandedMeta((prev) => {
      const next = new Set(prev)
      if (next.has(lineItemId)) next.delete(lineItemId)
      else next.add(lineItemId)
      return next
    })
  }
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const paymentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await ordersApi.detail(siteId, orderId)
        setOrder(response.data)
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
      if (target && paymentRef.current && !paymentRef.current.contains(target)) {
        setPaymentOpen(false)
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

  const handleCopy = async (value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setActionsOpen(false)
    setPaymentOpen(false)
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
                <h1 className="text-3xl font-semibold tracking-tight text-app-strong md:text-[2.2rem]">
                  Order #{order.woo_order_id}
                </h1>
                <StatusChip
                  label={order.payment_status || 'unknown'}
                  tone={chipTone(order.payment_status || 'unknown')}
                  className="px-3 py-1.5 text-xs uppercase tracking-[0.08em]"
                />
                <StatusChip
                  label={order.fulfillment_status || 'unknown'}
                  tone={chipTone(order.fulfillment_status || 'unknown')}
                  className="px-3 py-1.5 text-xs uppercase tracking-[0.08em]"
                />
              </div>
              <div className="mt-2 text-base text-app-muted">
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
                    setPaymentOpen(false)
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

              <div ref={paymentRef} className="relative">
                <button
                  type="button"
                  className="btn-primary gap-2"
                  onClick={() => {
                    setPaymentOpen((value) => !value)
                    setActionsOpen(false)
                  }}
                >
                  Collect Payment
                  <ChevronDown className="h-4 w-4" />
                </button>
                {paymentOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[250px] rounded-2xl border border-app-line bg-white p-2 shadow-card">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-app-strong transition hover:bg-slate-50"
                      onClick={() => handleCopy(`${customerName} · ${money(amountDue, order.currency)}`)}
                    >
                      Copy payment summary
                      <CreditCard className="h-4 w-4 text-app-soft" />
                    </button>
                    <div className="rounded-xl px-3 py-2 text-sm text-app-muted">Send payment link soon</div>
                    <div className="rounded-xl px-3 py-2 text-sm text-app-muted">Record offline payment soon</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
            <div className="space-y-5">
              <SectionCard
                title={`Items (${order.items.length})`}
                action={<StatusChip label={order.status || 'unknown'} tone={chipTone(order.status || 'unknown')} />}
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
                            <div className="grid grid-cols-[minmax(0,1fr)_80px_56px_96px] items-center gap-4 px-5 py-4">
                              {/* Product info */}
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-app-line bg-slate-50 text-app-soft">
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
                                  {publicMeta.map((m) => (
                                    <>
                                      <span key={`k-${m.key}`} className="text-xs font-medium text-app-muted">{m.key}</span>
                                      <span key={`v-${m.key}`} className="truncate text-xs text-app-strong">{String(m.value ?? '')}</span>
                                    </>
                                  ))}
                                  {privateMeta.length > 0 ? (
                                    <>
                                      <span className="col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-wider text-app-soft">Private</span>
                                      {privateMeta.map((m) => (
                                        <>
                                          <span key={`k-${m.key}`} className="font-mono text-xs text-app-soft">{m.key}</span>
                                          <span key={`v-${m.key}`} className="truncate text-xs text-app-muted">{String(m.value ?? '')}</span>
                                        </>
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
                title="Payment Summary"
                action={
                  <StatusChip
                    label={order.payment_status || 'unknown'}
                    tone={chipTone(order.payment_status || 'unknown')}
                    className="px-3 py-1.5 text-xs uppercase tracking-[0.08em]"
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
                  {/* Total */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-base font-bold text-app-strong">
                    <span>Total</span>
                    <span>{money(order.total_amount, order.currency)}</span>
                  </div>
                  {/* Amount due */}
                  {order.refund_amount > 0 ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-app-muted">Refunded</span>
                      <span className="text-red-600">-{money(order.refund_amount, order.currency)}</span>
                    </div>
                  ) : null}
                  <div className="border-t border-app-line pt-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-app-strong">
                          Amount due: {money(amountDue, order.currency)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary gap-2"
                        onClick={() => setPaymentOpen((value) => !value)}
                      >
                        <CreditCard className="h-4 w-4" />
                        Collect Payment
                      </button>
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
                        <div className="text-xl font-medium text-app-strong">{customerName}</div>
                        <div className="mt-1 text-base text-app-muted">
                          {order.customer_email || order.contact?.email || 'No email'}
                        </div>
                        <div className="mt-1 text-sm text-app-soft">
                          {order.customer_phone || order.contact?.phone || 'No phone'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-app-line pt-4">
                    <div className="text-sm font-medium text-app-muted">Delivery method</div>
                    <div className="mt-2 text-base text-app-strong">
                      {order.fulfillment_status === 'fulfilled' ? 'Fulfilled shipment' : 'Standard'}
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
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
