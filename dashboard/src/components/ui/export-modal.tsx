'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  ClipboardCopy,
  Download,
  Loader2,
  Settings,
  Star,
  TableProperties,
  X,
} from 'lucide-react'
import { exportOrdersCSV, exportTemplatesApi, getApiErrorMessage, ordersApi } from '@/lib/api'
import type { ExportTemplate, OrderDetail, OrderItem, OrderListItem } from '@/lib/types'

// ── types ─────────────────────────────────────────────────────────────────────

interface ExportModalProps {
  siteId: string
  selectedIds: string[]
  filters: {
    q?: string
    paymentStatus?: string
    fulfillmentStatus?: string
    dateFrom?: string
    dateTo?: string
  }
  previewOrders: OrderListItem[]
  onClose: () => void
}

// ── preview helpers ───────────────────────────────────────────────────────────

const PREVIEW_PAGE_SIZE = 10

function safeDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  try {
    return new Date(value).toISOString().replace('T', ' ').slice(0, 19)
  } catch {
    return ''
  }
}

function buildPreviewRows(
  template: ExportTemplate | null,
  orders: OrderListItem[],
  orderDetails: Record<string, OrderDetail> = {},
): { headers: string[]; rows: string[][] } {
  if (!template || template.columns.length === 0) return { headers: [], rows: [] }

  const headers = template.columns.map((c) => c.label)
  const hasItemCols = template.columns.some((c) => c.key?.startsWith('item_'))

  const rows: string[][] = []

  for (const o of orders) {
    const detail = orderDetails[o.woo_order_id]
    
    const buildRow = (item?: OrderItem) => {
      return template.columns.map((c) => {
        if (c.type === 'custom') return c.default_value ?? ''
        switch (c.key) {
          case 'order_id': return o.woo_order_id
          case 'order_date':
          case 'created_at': return safeDate(o.created_at_woo)
          case 'status': return o.status
          case 'payment_status': return o.payment_status
          case 'fulfillment_status': return o.fulfillment_status
          case 'subtotal':
          case 'total_amount': return o.total_amount.toFixed(2)
          case 'currency': return o.currency
          case 'customer_name': return o.customer_name
          case 'customer_email': return o.customer_email
          case 'delivery_method': return o.delivery_method ?? ''
          case 'shipping_city': return o.shipping_city ?? ''
          case 'shipping_postcode': return o.shipping_postcode ?? ''
          case 'shipping_state': return o.shipping_state ?? ''
          case 'shipping_country': return o.shipping_country ?? ''
          
          // Item columns
          case 'item_name': return item ? item.name : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_sku': return item ? item.sku : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_qty': return item ? item.quantity.toString() : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_unit_price': return item ? item.unit_price.toFixed(2) : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_line_total': return item ? item.line_total.toFixed(2) : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_line_subtotal': return item ? item.line_subtotal.toFixed(2) : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_line_tax': return item ? item.line_tax.toFixed(2) : (hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : '')
          case 'item_variation':
            if (item && item.variant_attributes) {
              return Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(', ')
            }
            return hasItemCols ? `[${o.items_count} item${o.items_count !== 1 ? 's' : ''}]` : ''
          default: return ''
        }
      })
    }

    if (hasItemCols && detail && detail.items && detail.items.length > 0) {
      // Flatten rows for this order
      for (const item of detail.items) {
        rows.push(buildRow(item))
      }
    } else {
      rows.push(buildRow())
    }
  }

  return { headers, rows }
}

function tsvFromPreview(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.join('\t')).join('\n')
}

// ── component ─────────────────────────────────────────────────────────────────

export function ExportModal({
  siteId,
  selectedIds,
  filters,
  previewOrders,
  onClose,
}: ExportModalProps) {
  const [templates, setTemplates] = useState<ExportTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({})
  const backdropRef = useRef<HTMLDivElement>(null)

  // Load templates
  useEffect(() => {
    let cancelled = false
    setLoadingTemplates(true)
    setLoadError(null)
    exportTemplatesApi
      .list()
      .then((res) => {
        if (cancelled) return
        const list = res.data ?? []
        setTemplates(list)
        const def = list.find((t) => t.is_default) ?? list[0]
        if (def) setSelectedTemplateId(def.id)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, 'Could not load templates.'))
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false)
      })
    return () => { cancelled = true }
  }, [siteId])

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null
  const previewSource =
    selectedIds.length > 0
      ? previewOrders.filter((o) => selectedIds.includes(o.woo_order_id))
      : previewOrders

  const totalPages = Math.max(1, Math.ceil(previewSource.length / PREVIEW_PAGE_SIZE))
  const clampedPage = Math.min(previewPage, totalPages - 1)
  
  const sourcePage = previewSource.slice(
    clampedPage * PREVIEW_PAGE_SIZE,
    (clampedPage + 1) * PREVIEW_PAGE_SIZE,
  )

  const hasItemCols = selectedTemplate?.columns.some((c) => c.key?.startsWith('item_')) ?? false

  // Fetch details for orders on current page if they have item columns
  useEffect(() => {
    if (!hasItemCols || sourcePage.length === 0) return
    let cancelled = false
    
    // Find which orders we need to fetch
    const ordersToFetch = sourcePage.filter(o => !orderDetails[o.woo_order_id])

    if (ordersToFetch.length > 0) {
      Promise.all(
        ordersToFetch.map(o => 
          ordersApi.detail(siteId, o.woo_order_id).then(res => ({ id: o.woo_order_id, detail: res.data })).catch(() => null)
        )
      ).then(results => {
        if (cancelled) return
        const newDetails = { ...orderDetails }
        let changed = false
        results.forEach(res => {
          if (res && res.detail) {
            newDetails[res.id] = res.detail
            changed = true
          }
        })
        if (changed) setOrderDetails(newDetails)
      })
    }

    return () => { cancelled = true }
  }, [siteId, hasItemCols, sourcePage, orderDetails])

  const { headers, rows: pageRows } = buildPreviewRows(selectedTemplate, sourcePage, orderDetails)
  const rows = pageRows
  const { rows: fullRows } = buildPreviewRows(selectedTemplate, previewSource, orderDetails)

  const handleDownload = async () => {
    if (!selectedTemplate) return
    setDownloadError(null)
    setDownloading(true)
    try {
      await exportOrdersCSV({
        siteId,
        templateId: selectedTemplate.id,
        ids: selectedIds.length > 0 ? selectedIds : undefined,
        ...filters,
      })
    } catch (err: unknown) {
      setDownloadError(getApiErrorMessage(err, 'Export failed. Please try again.'))
    } finally {
      setDownloading(false)
    }
  }

  const handleCopy = async () => {
    if (!headers.length) return
    try {
      await navigator.clipboard.writeText(tsvFromPreview(headers, fullRows))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select a textarea
    }
  }

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }


  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const exportScope =
    selectedIds.length > 0
      ? `${selectedIds.length} selected order${selectedIds.length !== 1 ? 's' : ''}`
      : 'all matching orders'

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-app-line bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
        style={{ height: 'min(700px, calc(100vh - 2rem))' }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-app-line bg-white px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
              <Download className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-app-strong">Export Orders</h2>
              <p className="text-xs text-app-muted">Exporting {exportScope}</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-app-muted hover:bg-surface-2 hover:text-app-strong transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">

          {/* Template sidebar */}
          <div className="flex w-52 shrink-0 flex-col border-r border-app-line bg-slate-50/80">
            <div className="shrink-0 px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Template</p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {loadingTemplates ? (
                <div className="flex items-center gap-2 py-4 text-xs text-app-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : loadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="mb-1 h-4 w-4" />
                  {loadError}
                </div>
              ) : templates.length === 0 ? (
                <div className="py-3 text-xs text-app-muted">
                  <p>No templates found.</p>
                  <a
                    href={`/dashboard/settings/export-templates`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <Settings className="h-3 w-3" />
                    Create a template
                  </a>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                          selectedTemplateId === t.id
                            ? 'border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm'
                            : 'border border-transparent text-app-strong hover:bg-white hover:shadow-sm'
                        }`}
                        onClick={() => {
                          setSelectedTemplateId(t.id)
                          setPreviewPage(0)
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          {t.is_default && (
                            <Star
                              className={`h-3 w-3 shrink-0 ${
                                selectedTemplateId === t.id
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'fill-yellow-400 text-yellow-400'
                              }`}
                            />
                          )}
                          <span className="truncate font-medium">{t.name}</span>
                        </div>
                        {t.description && (
                          <p
                            className={`mt-0.5 truncate ${
                              selectedTemplateId === t.id ? 'text-indigo-600/80' : 'text-app-muted'
                            }`}
                          >
                            {t.description}
                          </p>
                        )}
                        <p
                          className={`mt-0.5 ${
                            selectedTemplateId === t.id ? 'text-indigo-600/80' : 'text-app-muted'
                          }`}
                        >
                          {t.columns.length} columns
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Preview + footer */}
          <div className="flex min-w-0 flex-1 flex-col">

            {/* Preview table */}
            <div className="flex-1 overflow-auto">
              {!selectedTemplate ? (
                <div className="flex h-full items-center justify-center text-sm text-app-muted">
                  <div className="text-center">
                    <TableProperties className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p>Select a template</p>
                  </div>
                </div>
              ) : headers.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-app-muted">
                  Template has no columns
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-app-line bg-slate-50">
                      {headers.map((h, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap px-3 py-2 text-left font-semibold text-app-strong"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={headers.length}
                          className="px-3 py-8 text-center text-app-muted"
                        >
                          No orders in current view to preview
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row, ri) => (
                        <tr key={ri} className="transition-colors hover:bg-slate-50/80">
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-app-strong"
                              title={cell}
                            >
                              {cell || <span className="text-app-muted">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-app-line bg-slate-50/80 px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">

                {/* Info + pagination */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
                  {rows.length > 0 && (
                    <>
                      <span>Preview: {rows.length} row{rows.length !== 1 ? 's' : ''}</span>
                      {hasItemCols && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          ↕ item rows expand on download
                        </span>
                      )}
                    </>
                  )}
                  {totalPages > 1 && (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="rounded px-1 text-app-muted hover:bg-white hover:text-app-strong disabled:opacity-40"
                        disabled={clampedPage === 0}
                        onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                      >
                        ← Prev
                      </button>
                      <span className="tabular-nums">
                        {clampedPage + 1} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="rounded px-1 text-app-muted hover:bg-white hover:text-app-strong disabled:opacity-40"
                        disabled={clampedPage >= totalPages - 1}
                        onClick={() => setPreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                      >
                        Next →
                      </button>
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {downloadError && (
                    <span className="text-xs text-red-500">{downloadError}</span>
                  )}
                  <button
                    type="button"
                    className="btn-secondary gap-1.5 text-xs"
                    disabled={!headers.length || rows.length === 0}
                    onClick={handleCopy}
                    title="Copy as TSV — paste directly into Google Sheets or Excel"
                  >
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</>
                    ) : (
                      <><ClipboardCopy className="h-3.5 w-3.5" /> Copy for Sheets</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-primary gap-1.5 text-sm"
                    disabled={!selectedTemplate || downloading}
                    onClick={handleDownload}
                  >
                    {downloading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Downloading…</>
                    ) : (
                      <><Download className="h-4 w-4" /> Download CSV</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
