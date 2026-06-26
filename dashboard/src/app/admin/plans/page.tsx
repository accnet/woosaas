'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { Box, RefreshCw, Save, Zap } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminSectionIntro, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
import { adminApi, type AdminPlan, getAdminToken } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

export default function AdminPlansPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<AdminPlan | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    try {
      const res = await adminApi.plans()
      setPlans(res.data.plans || [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Plans could not be loaded.'))
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const update = (id: string, patch: Partial<AdminPlan>) => {
    setPlans((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const save = async (plan: AdminPlan) => {
    setReason('')
    setPendingPlan(plan)
  }

  const confirmSave = async () => {
    if (!pendingPlan || !reason.trim()) return
    setBusy(pendingPlan.id)
    try {
      await adminApi.updatePlan(pendingPlan.id, {
        name: pendingPlan.name,
        price_cents: Number(pendingPlan.price_cents),
        event_limit: Number(pendingPlan.event_limit),
        site_limit: Number(pendingPlan.site_limit),
        tracking_order_limit: Number(pendingPlan.tracking_order_limit),
        features: parseFeatures(pendingPlan.features),
        reason: reason.trim(),
      })
      await load()
      setPendingPlan(null)
      setReason('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Plan update failed.'))
    } finally {
      setBusy(null)
    }
  }

  const totalSites = plans.reduce((sum, plan) => sum + Number(plan.site_limit || 0), 0)
  const totalEvents = plans.reduce((sum, plan) => sum + Number(plan.event_limit || 0), 0)
  const highestPrice = plans.reduce((max, plan) => Math.max(max, Number(plan.price_cents || 0)), 0)

  return (
    <>
      <AdminPageHeader
        title="Plans"
        description="Configure tenant quotas, feature flags, and pricing."
        action={
          <button className="admin-btn-secondary gap-2 text-xs" onClick={() => void load()} disabled={!!busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />
      {error ? <div className="admin-alert-error">{error}</div> : null}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlanStatCard label="Total Plans" value={plans.length.toString()} icon={<Box className="h-4 w-4" />} iconBg="bg-slate-100 text-slate-600" />
        <PlanStatCard label="Site Capacity" value={totalSites.toLocaleString()} icon={<Zap className="h-4 w-4" />} iconBg="bg-blue-100 text-blue-600" />
        <PlanStatCard label="Event Capacity" value={totalEvents.toLocaleString()} icon={<Box className="h-4 w-4" />} iconBg="bg-emerald-100 text-emerald-600" />
        <PlanStatCard label="Top Price Tier" value={`$${(highestPrice / 100).toFixed(0)}`} icon={<Zap className="h-4 w-4" />} iconBg="bg-violet-100 text-violet-600" />
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {plans.map((plan) => (
          <AdminPanel key={plan.id} className="p-6">
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <Box className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{plan.id}</div>
                    <input
                      className="admin-input-premium mt-1.5 !py-1.5 text-sm font-semibold"
                      value={plan.name}
                      onChange={(event) => update(plan.id, { name: event.target.value })}
                    />
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <AdminStatusBadge label={plan.interval} tone="neutral" />
                  <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-white">
                    <div className="font-admin-title text-xl font-bold">${(Number(plan.price_cents) / 100).toFixed(0)}</div>
                    <div className="text-[10px] text-slate-400">per {plan.interval}</div>
                  </div>
                </div>
              </div>

              {/* Quota Badges */}
              <div className="grid gap-3 sm:grid-cols-3">
                <QuotaBadge label="Sites" value={Number(plan.site_limit)} />
                <QuotaBadge label="Events/mo" value={Number(plan.event_limit)} />
                <QuotaBadge label="Tracked Orders" value={Number(plan.tracking_order_limit)} />
              </div>

              {/* Pricing & Features */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
                <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <AdminSectionIntro eyebrow="Commercial" title="Pricing & Limits" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label="Price (cents)" value={plan.price_cents} onChange={(value) => update(plan.id, { price_cents: value })} />
                    <NumberField label="Site Limit" value={plan.site_limit} onChange={(value) => update(plan.id, { site_limit: value })} />
                    <NumberField label="Event Limit" value={plan.event_limit} onChange={(value) => update(plan.id, { event_limit: value })} />
                    <NumberField label="Order Limit" value={plan.tracking_order_limit} onChange={(value) => update(plan.id, { tracking_order_limit: value })} />
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4">
                  <AdminSectionIntro eyebrow="Access" title="Feature Flags" />
                  <label className="block space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Features (comma separated)</span>
                    <textarea
                      className="admin-input-premium min-h-[120px] resize-none text-xs"
                      value={formatFeatures(plan.features)}
                      onChange={(event) => update(plan.id, { features: event.target.value })}
                    />
                  </label>
                </div>
              </div>

              {/* Save */}
              <button
                className="admin-btn-primary w-full gap-2"
                disabled={busy === plan.id}
                onClick={() => void save(plan)}
              >
                <Save className="h-4 w-4" />
                Save Plan Changes
              </button>
            </div>
          </AdminPanel>
        ))}
      </div>

      <ReasonDialog
        open={!!pendingPlan}
        title="Save Plan Changes"
        description={pendingPlan ? `Changes to ${pendingPlan.name} will affect quota and feature access.` : ''}
        confirmLabel="Save Changes"
        value={reason}
        loading={!!busy}
        onChange={setReason}
        onCancel={() => setPendingPlan(null)}
        onConfirm={() => void confirmSave()}
      />
    </>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        className="admin-input-premium !py-1.5 text-xs"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function PlanStatCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string
  value: string
  icon?: ReactNode
  iconBg?: string
}) {
  return (
    <div className="card-admin-stat">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="font-admin-title text-[1.75rem] font-bold tracking-tight text-slate-900">{value}</div>
        </div>
        {icon ? <div className={`stat-icon ${iconBg || 'bg-slate-100 text-slate-600'}`}>{icon}</div> : null}
      </div>
    </div>
  )
}

function QuotaBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 font-admin-title text-lg font-bold text-slate-900">{value.toLocaleString()}</div>
    </div>
  )
}

function formatFeatures(features: string) {
  try {
    const parsed = JSON.parse(features)
    return Array.isArray(parsed) ? parsed.join(', ') : features
  } catch {
    return features
  }
}

function parseFeatures(features: string) {
  try {
    const parsed = JSON.parse(features)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return features.split(',').map((item) => item.trim()).filter(Boolean)
  }
}
