'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Save } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
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

  return (
    <>
      <AdminPageHeader title="Tracking Providers" description="System-level provider availability and webhook-first tracking configuration." />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {providers.map((provider) => (
          <AdminPanel key={provider.id} className="p-4">
            <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-app-bg text-app-accent">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-app-primary">{provider.display_name}</div>
                  <div className="text-sm text-app-muted">{provider.id}</div>
                </div>
              </div>
              <AdminStatusBadge label={provider.enabled ? 'enabled' : 'disabled'} tone={provider.enabled ? 'success' : 'danger'} />
            </div>
            {provider.id === 'trackingmore' ? (
              <div className="space-y-3 rounded-md border border-app-border bg-app-bg p-3">
                <div className="grid gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-app-muted">Base URL</span>
                    <input
                      className="input"
                      value={trackingMoreForm.base_url}
                      onChange={(event) => setTrackingMoreForm((value) => ({ ...value, base_url: event.target.value }))}
                      placeholder="https://api.trackingmore.com/v2"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-app-muted">API key {provider.has_api_key ? '(configured)' : ''}</span>
                    <input
                      className="input"
                      value={trackingMoreForm.api_key}
                      onChange={(event) => setTrackingMoreForm((value) => ({ ...value, api_key: event.target.value }))}
                      placeholder={provider.has_api_key ? 'Leave blank to keep current key' : 'TrackingMore API key'}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-app-muted">Webhook secret {provider.has_webhook_secret ? '(configured)' : ''}</span>
                    <input
                      className="input"
                      value={trackingMoreForm.webhook_secret}
                      onChange={(event) => setTrackingMoreForm((value) => ({ ...value, webhook_secret: event.target.value }))}
                      placeholder={provider.has_webhook_secret ? 'Leave blank to keep current secret' : 'Shared webhook secret'}
                    />
                  </label>
                </div>
                <div className="rounded-md bg-app-surface px-2 py-1 text-xs text-app-muted">
                  Webhook URL: <span className="font-mono">{provider.webhook_url}</span>
                </div>
                <button className="btn-secondary w-full" disabled={busy === provider.id} onClick={() => void saveTrackingMoreConfig(provider)}>
                  <Save className="h-4 w-4" />
                  Save TrackingMore config
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2 text-xs text-app-muted">
              <Capability label="Webhooks" enabled={provider.supports_webhooks} />
              <Capability label="Refresh" enabled={provider.supports_refresh} />
              <Capability label="Register" enabled={provider.supports_register} />
            </div>
            <button className={provider.enabled ? 'btn-danger w-full' : 'btn-primary w-full'} disabled={busy === provider.id} onClick={() => void update(provider, !provider.enabled)}>
              {provider.enabled ? 'Disable provider' : 'Enable provider'}
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

function Capability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1 text-center ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
      {label}
    </div>
  )
}
