'use client'

import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell } from '@/components/ui/table-primitives'
import { TableSection } from '@/components/ui/table-section'
import { billingApi, getApiErrorMessage } from '@/lib/api'
import type { Invoice } from '@/lib/types'

const STATUS_TONE: Record<Invoice['status'], 'neutral' | 'info' | 'good' | 'warn' | 'danger'> = {
  draft: 'neutral',
  open: 'info',
  paid: 'good',
  void: 'neutral',
  uncollectible: 'danger',
}

export default function InvoicesSettingsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (invoices.length === 0) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const res = await billingApi.listInvoices()
        if (!cancelled) setInvoices(res.data)
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Invoices could not be loaded.'))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [reloadKey])

  if (loading && invoices.length === 0) return <TableLoadingSkeleton rows={5} columns={6} />

  return (
    <div className="space-y-6">
      {error ? <InlineErrorState body={error} compact={invoices.length > 0} onRetry={() => setReloadKey((value) => value + 1)} /> : null}
      <div className="flex justify-end">
        <button type="button" className="btn-secondary gap-2" onClick={() => setReloadKey((value) => value + 1)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
          Refresh
        </button>
      </div>
      <TableSection
        title="Invoices"
        action={<StatusChip label={`${invoices.length} invoices`} tone="neutral" />}
        isEmpty={invoices.length === 0}
        emptyTitle="No invoices yet"
        emptyBody="Invoices will appear here when billing records are issued."
        emptyIcon={<FileText className="h-12 w-12" />}
      >
        {invoices.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} body="No invoices yet." />
        ) : (
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <TableHeaderCell>Invoice</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Issued</TableHeaderCell>
                <TableHeaderCell>Due</TableHeaderCell>
                <TableHeaderCell align="right">Amount</TableHeaderCell>
                <TableHeaderCell align="right">Actions</TableHeaderCell>
              </tr>
            </thead>
            <tbody className="table-body">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="table-row">
                  <td className="table-cell font-medium text-app-strong">{invoice.invoice_number}</td>
                  <td className="table-cell"><StatusChip label={invoice.status} tone={STATUS_TONE[invoice.status]} /></td>
                  <td className="table-cell text-app-muted">{formatDate(invoice.issued_at)}</td>
                  <td className="table-cell text-app-muted">{formatDate(invoice.due_at)}</td>
                  <td className="table-cell text-right font-medium">{formatAmount(invoice.amount_cents, invoice.currency)}</td>
                  <td className="table-cell">
                    <div className="flex justify-end gap-2">
                      {invoice.hosted_url ? (
                        <a className="btn-secondary gap-2 px-3 py-1.5 text-xs" href={invoice.hosted_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </a>
                      ) : null}
                      {invoice.pdf_url ? (
                        <a className="btn-secondary gap-2 px-3 py-1.5 text-xs" href={invoice.pdf_url} target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      ) : null}
                      {!invoice.hosted_url && !invoice.pdf_url ? <span className="text-sm text-app-soft">-</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableSection>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountCents / 100)
}
