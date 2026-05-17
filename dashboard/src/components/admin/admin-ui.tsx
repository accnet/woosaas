'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-app-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-app-primary">{title}</h1>
        <p className="mt-1 text-sm text-app-muted">{description}</p>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  )
}

export function AdminPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-sm ${className}`}>
      {children}
    </section>
  )
}

export function AdminStatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${tones[tone]}`}>
      {label}
    </span>
  )
}

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  value,
  loading,
  onChange,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  value: string
  loading?: boolean
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  const disabled = loading || !value.trim()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-app-primary">{title}</h2>
            <p className="mt-1 text-sm text-app-muted">{description}</p>
          </div>
          <button type="button" className="rounded-md p-1 text-app-muted hover:bg-app-bg hover:text-app-primary" onClick={onCancel} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 px-5 py-4">
          <label className="block text-sm font-medium text-app-muted" htmlFor="admin-reason">
            Reason
          </label>
          <textarea
            id="admin-reason"
            className="input min-h-28 resize-none"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Required for audit log"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-app-border bg-app-bg px-5 py-4">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={disabled}>
            {loading ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
