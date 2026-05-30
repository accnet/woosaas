'use client'

import type { ReactNode } from 'react'
import { ShieldAlert, X } from 'lucide-react'

export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-admin-title text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm font-medium text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  )
}

export function AdminPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`card-admin-glass overflow-hidden ${className}`}>
      {children}
    </section>
  )
}

export function AdminSectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="space-y-1">
      {eyebrow ? <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400/90">{eyebrow}</div> : null}
      <h2 className="font-admin-title text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
  )
}

export function AdminStatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-700',
    danger: 'border-red-500/20 bg-red-500/10 text-red-700',
  }
  const dotTones = {
    neutral: 'bg-slate-400',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotTones[tone]} animate-pulse`} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md transition-all duration-300" role="dialog" aria-modal="true">
      <div className="animate-slide-up w-full max-w-md overflow-hidden rounded-[24px] border border-slate-200/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-admin-title text-base font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">{description}</p>
            </div>
          </div>
          <button type="button" className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={onCancel} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 px-6 py-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="admin-reason">
            Reason for Audit Log
          </label>
          <textarea
            id="admin-reason"
            className="admin-input-premium min-h-28 resize-none"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Please enter a detailed explanation..."
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button type="button" className="admin-btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn-danger rounded-xl' : 'admin-btn-primary'} onClick={onConfirm} disabled={disabled}>
            {loading ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

