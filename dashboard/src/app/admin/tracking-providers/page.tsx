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
      description: `${provider.display_name} will be ${enabled ? 'available' : 'blocked'} for tenant outbound tracking actions.`,
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
          <button className="admin-btn-secondary gap-2 px-4 py-2.5 text-xs" onClick={() => void load()} disabled={!!busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Carriers
          </button>
        }
      />
      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <ProviderMetricCard
          label="Supported Providers"
          value={providers.length.toString()}
          icon={<Activity className="h-4 w-4" />}
        />
        <ProviderMetricCard
          label="Active Carriers"
          value={enabledProviders.toString()}
          tone="success"
          icon={<Activity className="h-4 w-4" />}
        />
        <ProviderMetricCard
          label="Webhooks Ready"
          value={webhookProviders.toString()}
          icon={<Webhook className="h-4 w-4" />}
        />
        <ProviderMetricCard
          label="Encrypted Secrets"
          value={configuredSecrets.toString()}
          icon={<Link2 className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {providers.map((provider) => (
          <AdminPanel key={provider.id} className="p-6">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200/50 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700">
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

              <div className="grid gap-3 sm:grid-cols-3">
                <CapabilityCard label="Webhooks" enabled={provider.supports_webhooks} />
                <CapabilityCard label="Refresh" enabled={provider.supports_refresh} />
                <CapabilityCard label="Register" enabled={provider.supports_register} />
              </div>

              {provider.id === 'trackingmore' ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.9fr)]">
                  <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-slate-50/40 p-4">
                    <AdminSectionIntro
                      eyebrow="Credentials"
                      title="TrackingMore API Keys"
                    />
                    <div className="grid gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Base URL</span>
                        <input
                          className="admin-input-premium !py-1.5 text-xs"
                          value={trackingMoreForm.base_url}
                          onChange={(event) => setTrackingMoreForm((value) => ({ ...value, base_url: event.target.value }))}
                          placeholder="https://api.trackingmore.com/v2"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">API Key {provider.has_api_key ? '(configured)' : ''}</span>
                        <input
                          className="admin-input-premium !py-1.5 text-xs"
                          value={trackingMoreForm.api_key}
                          onChange={(event) => setTrackingMoreForm((value) => ({ ...value, api_key: event.target.value }))}
                          placeholder={provider.has_api_key ? '••••••••••••••••••••••••' : 'TrackingMore API Key'}
                          type="password"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Webhook Secret {provider.has_webhook_secret ? '(configured)' : ''}</span>
                        <input
                          className="admin-input-premium !py-1.5 text-xs"
                          value={trackingMoreForm.webhook_secret}
                          onChange={(event) => setTrackingMoreForm((value) => ({ ...value, webhook_secret: event.target.value }))}
                          placeholder={provider.has_webhook_secret ? '••••••••••••••••••••••••' : 'Shared Webhook Secret'}
                          type="password"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <AdminSectionIntro
                      eyebrow="Callback"
                      title="Outbound Webhook"
                    />
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] text-slate-500">
                      <span className="font-mono break-all">{provider.webhook_url}</span>
                    </div>
                    <div className="space-y-2">
                      <ProviderCheck label="API Credential" ready={provider.has_api_key || Boolean(trackingMoreForm.api_key)} />
                      <ProviderCheck label="Webhook Signature" ready={provider.has_webhook_secret || Boolean(trackingMoreForm.webhook_secret)} />
                      <ProviderCheck label="Carrier Enabled" ready={provider.enabled} warning={!provider.enabled} />
                    </div>
                    <button className="admin-btn-secondary w-full gap-2 rounded-xl text-xs py-2" disabled={busy === provider.id} onClick={() => void saveTrackingMoreConfig(provider)}>
                      <Save className="h-3.5 w-3.5" />
                      Save Configurations
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/60 bg-slate-50/40 p-5 text-center text-xs text-slate-400">
                  This provider is managed internally and does not require custom credentials config.
                </div>
              )}

              <button className={provider.enabled ? 'btn-danger w-full rounded-xl py-2.5 text-sm' : 'admin-btn-primary w-full rounded-xl py-2.5 text-sm'} disabled={busy === provider.id} onClick={() => void update(provider, !provider.enabled)}>
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

function ProviderMetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  tone?: 'neutral' | 'success'
}) {
  const toneClasses = {
    neutral: 'from-slate-500/5 to-slate-600/5 hover:border-slate-300',
    success: 'from-emerald-500/5 to-teal-500/5 hover:border-emerald-500/30 text-emerald-950',
  }
  const iconColor = {
    neutral: 'bg-slate-500/10 text-slate-600',
    success: 'bg-emerald-500/10 text-emerald-600',
  }

  return (
    <div className={`card-admin-glass bg-gradient-to-br ${toneClasses[tone as 'neutral' | 'success']} p-5 hover:-translate-y-1 transition-all duration-300`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="mt-2 font-admin-title text-3xl font-extrabold tracking-tight text-slate-900">{value}</div>
          {hint ? <div className="mt-2 text-xs font-semibold text-slate-500">{hint}</div> : null}
        </div>
        {icon ? <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconColor[tone as 'neutral' | 'success']}`}>{icon}</div> : null}
      </div>
    </div>
  )
}

function CapabilityCard({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`rounded-xl border p-3 transition-colors ${enabled ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700' : 'border-slate-200/50 bg-slate-50 text-slate-400'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xs font-semibold">{enabled ? 'Active' : 'Not Supported'}</div>
    </div>
  )
}

function ProviderCheck({ label, ready, warning }: { label: string; ready: boolean; warning?: boolean }) {
  const tone = ready ? 'text-emerald-600' : warning ? 'text-amber-500' : 'text-slate-400'
  const dotTone = ready ? 'bg-emerald-500' : warning ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 px-3.5 py-2.5">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotTone} ${ready ? 'animate-pulse' : ''}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${tone}`}>{ready ? 'Ready' : warning ? 'Review' : 'Missing'}</span>
      </div>
    </div>
  )
}
