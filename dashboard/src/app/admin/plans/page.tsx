'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { AdminPageHeader, AdminPanel, ReasonDialog } from '@/components/admin/admin-ui'
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

  return (
    <>
      <AdminPageHeader title="Plans" description="Edit billing limits and feature flags." />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <AdminPanel key={plan.id} className="p-4">
            <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-app-muted">{plan.id}</div>
                <input className="input mt-2" value={plan.name} onChange={(event) => update(plan.id, { name: event.target.value })} />
              </div>
              <div className="rounded-md bg-app-bg px-3 py-2 text-right">
                <div className="text-lg font-semibold text-app-primary">${(Number(plan.price_cents) / 100).toFixed(0)}</div>
                <div className="text-xs text-app-muted">monthly</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Price cents" value={plan.price_cents} onChange={(value) => update(plan.id, { price_cents: value })} />
              <NumberField label="Site limit" value={plan.site_limit} onChange={(value) => update(plan.id, { site_limit: value })} />
              <NumberField label="Event limit / month" value={plan.event_limit} onChange={(value) => update(plan.id, { event_limit: value })} />
              <NumberField label="Tracking orders / month" value={plan.tracking_order_limit} onChange={(value) => update(plan.id, { tracking_order_limit: value })} />
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">Features</span>
              <textarea className="input min-h-24" value={formatFeatures(plan.features)} onChange={(event) => update(plan.id, { features: event.target.value })} />
            </label>
            <button className="btn-primary w-full gap-2" disabled={busy === plan.id} onClick={() => void save(plan)}>
              <Save className="h-4 w-4" />
              Save plan
            </button>
            </div>
          </AdminPanel>
        ))}
      </div>
      <ReasonDialog
        open={!!pendingPlan}
        title="Save plan changes"
        description={pendingPlan ? `Changes to ${pendingPlan.name} will affect quota and feature access.` : ''}
        confirmLabel="Save changes"
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
    <label className="block space-y-1">
      <span className="text-sm text-app-muted">{label}</span>
      <input className="input" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
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
