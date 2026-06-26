'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Link2, RefreshCw, Save, Webhook } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminSectionIntro, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
import { adminApi, type AdminTrackingProvider, getAdminToken } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

export default function AdminTrackingProvidersPage() {
  const router = useRouter()
  const [providers, setProviders] = useState<AdminTrackingProvider[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [trackingMoreForm, setTrackingMoreForm] = useState({ base_url: '', api_key: '', webhook_secret: '' })
  const [dialog, setDialog] = useState<{
    title: string
    description: string
    confirmLabel: string
    danger?: boolean
    run: (reason: string) => Promise<void>
  } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    try {
      const res = await adminApi.trackingProviders()
      const nextProviders = res.data.providers || []
      setProviders(nextProviders)
      const trackingMore = nextProviders.find((provider) => provider.id === 'trackingmore')
      if (trackingMore) {
        setTrackingMoreForm((value) => ({ ...value, base_url: trackingMore.base_url || 'https://api.trackingmore.com/v2' }))
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Tracking providers could not be loaded.'))
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const update = async (provider: AdminTrackingProvider, enabled: boolean) => {
    openReasonDialog({
      title: enabled ? 'Enable provider' : 'Disable provider',
      description: `${provider.display_name} will be ${enabled ? 'available' : 'blocked'} for tenant outbound tracking.`,
      confirmLabel: enabled ? 'Enable' : 'Disable',
      danger: !enabled,
      run: async (reasonText) => {
        setBusy(provider.id)
        try {
          await adminApi.updateTrackingProvider(provider.id, { enabled, reason: reasonText })
          await load()
        } catch (err) {
          setError(getApiErrorMessage(err, 'Provider update failed.'))
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const saveTrackingMoreConfig = async (provider: AdminTrackingProvider) => {
    openReasonDialog({
      title: 'Update TrackingMore config',
      description: 'API key and webhook secret are encrypted before saving.',
      confirmLabel: 'Save config',
      run: async (reasonText) => {
        setBusy(provider.id)
        try {
          await adminApi.updateTrackingProvider(provider.id, {
            base_url: trackingMoreForm.base_url,
            api_key: trackingMoreForm.api_key,
            webhook_secret: trackingMoreForm.webhook_secret,
            reason: reasonText,
          })
          setTrackingMoreForm((value) => ({ ...value, api_key: '', webhook_secret: '' }))
          await load()
        } catch (err) {
          setError(getApiErrorMessage(err, 'TrackingMore configuration update failed.'))
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const openReasonDialog = (next: NonNullable<typeof dialog>) => {
    setReason('')
    setDialog(next)
  }

  const submitDialog = async () => {
    if (!dialog || !reason.trim()) return
    await dialog.run(reason.trim())
    setDialog(null)
    setReason('')
  }

  const enabledProviders = providers.filter((provider) => provider.enabled).length
  const webhookProviders = providers.filter((provider) => provider.supports_webhooks).length
  const configuredSecrets = providers.filter((provider) => provider.has_api_key || provider.has_webhook_secret).length

  return (
    <>
      <AdminPageHeader
        title="Tracking Providers"
        description="Configure outbound package tracking carriers and API credentials."
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
        <ProviderStatCard label="Providers" value={providers.length.toString()} icon={<Activity className="h-4 w-4" />} iconBg="bg-slate-100 text-slate-600" />
        <ProviderStatCard label="Active" value={enabledProviders.toString()} icon={<Activity className="h-4 w-4" />} iconBg="bg-emerald-100 text-emerald-600" />
        <ProviderStatCard label="Webhooks" value={webhookProviders.toString()} icon={<Webhook className="h-4 w-4" />} iconBg="bg-blue-100 text-blue-600" />
        <ProviderStatCard label="Secrets" value={configuredSecrets.toString()} icon={<Link2 className="h-4 w-4" />} iconBg="bg-violet-100 text-violet-600" />
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {providers.map((provider) => (
          <AdminPanel key={provider.id} className="p-6">
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-admin-title text-base font-bold text-slate-900">{provider.display_name}</div>
                    <div className="text-xs text-slate-400">{provider.id}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <AdminStatusBadge label={provider.enabled ? 'enabled' : 'disabled'} tone={provider.enabled ? 'success' : 'danger'} />
                  <AdminStatusBadge label={provider.supports_webhooks ? 'webhooks' : 'manual'} tone={provider.supports_webhooks ? 'neutral' : 'warning'} />
                </div>
              </div>

              {/* Capabilities */}
              <div className="grid gap-3 sm:grid-cols-3">
                <CapabilityCard label="Webhooks" enabled={provider.supports_webhooks} />
                <CapabilityCard label="Refresh" enabled={provider.supports_refresh} />
                <CapabilityCard label="Register" enabled={provider.supports_register} />
              </div>

              {/* TrackingMore Config */}
              {provider.id === 'trackingmore' ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.9fr)]">
                  <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                    <AdminSectionIntro eyebrow="Credentials" title="TrackingMore API Keys" />
                    <div className="grid gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Base URL</span>
                        <input className="admin-input-premium text-xs" value={trackingMoreForm.base_url} onChange={(event) => setTrackingMoreForm((v) => ({ ...v, base_url: event.target.value }))} placeholder="https://api.trackingmore.com/v2" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">API Key {provider.has_api_key ? '(set)' : ''}</span>
                        <input className="admin-input-premium text-xs" type="password" value={trackingMoreForm.api_key} onChange={(event) => setTrackingMoreForm((v) => ({ ...v, api_key: event.target.value }))} placeholder={provider.has_api_key ? '••••••••••••••••••••••••' : 'TrackingMore API Key'} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Webhook Secret {provider.has_webhook_secret ? '(set)' : ''}</span>
                        <input className="admin-input-premium text-xs" type="password" value={trackingMoreForm.webhook_secret} onChange={(event) => setTrackingMoreForm((v) => ({ ...v, webhook_secret: event.target.value }))} placeholder={provider.has_webhook_secret ? '••••••••••••••••••••••••' : 'Shared Webhook Secret'} />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4">
                    <AdminSectionIntro eyebrow="Callback" title="Outbound Webhook" />
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] text-slate-500 font-mono break-all">
                      {provider.webhook_url}
                    </div>
                    <div className="space-y-2">
                      <ProviderCheck label="API Credential" ready={provider.has_api_key || Boolean(trackingMoreForm.api_key)} />
                      <ProviderCheck label="Webhook Signature" ready={provider.has_webhook_secret || Boolean(trackingMoreForm.webhook_secret)} />
                      <ProviderCheck label="Carrier Enabled" ready={provider.enabled} warning={!provider.enabled} />
                    </div>
                    <button className="admin-btn-secondary w-full gap-2 text-xs" disabled={busy === provider.id} onClick={() => void saveTrackingMoreConfig(provider)}>
                      <Save className="h-3.5 w-3.5" />
                      Save Configurations
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-center text-xs text-slate-400">
                  This provider is managed internally — no custom credentials needed.
                </div>
              )}

              {/* Toggle */}
              <button
                className={provider.enabled ? 'btn-danger w-full py-2.5 text-sm' : 'admin-btn-primary w-full py-2.5 text-sm'}
                disabled={busy === provider.id}
                onClick={() => void update(provider, !provider.enabled)}
              >
                {provider.enabled ? 'Deactivate Carrier' : 'Activate Carrier'}
              </button>
            </div>
          </AdminPanel>
        ))}
      </div>

      <ReasonDialog
        open={!!dialog}
        title={dialog?.title || ''}
        description={dialog?.description || ''}
        confirmLabel={dialog?.confirmLabel}
        danger={dialog?.danger}
        value={reason}
        loading={!!busy}
        onChange={setReason}
        onCancel={() => setDialog(null)}
        onConfirm={() => void submitDialog()}
      />
    </>
  )
}

function ProviderStatCard({
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

function CapabilityCard({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`rounded-xl border p-3 transition-colors ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xs font-semibold">{enabled ? 'Active' : 'Not Supported'}</div>
    </div>
  )
}

function ProviderCheck({ label, ready, warning }: { label: string; ready: boolean; warning?: boolean }) {
  const tone = ready ? 'text-emerald-600' : warning ? 'text-amber-500' : 'text-slate-400'
  const dotTone = ready ? 'bg-emerald-500' : warning ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${tone}`}>
          {ready ? 'Ready' : warning ? 'Review' : 'Missing'}
        </span>
      </div>
    </div>
  )
}
