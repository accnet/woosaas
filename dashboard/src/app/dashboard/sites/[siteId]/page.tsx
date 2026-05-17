'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, AlertTriangle, Copy, Globe, Loader2, ReceiptText, RefreshCw, RotateCcw, Settings, ShieldCheck, Trash2, Users, Webhook, Zap } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { PlatformIcon } from '@/components/ui/platform-icon'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, shopbaseApi, sitesApi } from '@/lib/api'
import { formatRelativeTimeLabel } from '@/lib/dashboard-metadata'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { ShopBaseIntegrationStatus, Site } from '@/lib/types'

const RECENT_SITES_KEY = 'woosaas-recent-sites'
const PINNED_SITES_KEY = 'woosaas-pinned-sites'

export default function WebsiteHomePage() {
  const router = useRouter()
  const siteId = useSiteId()
  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopbaseIntegration, setShopbaseIntegration] = useState<ShopBaseIntegrationStatus | null>(null)
  const [shopbaseLoading, setShopbaseLoading] = useState(false)
  const [shopbaseError, setShopbaseError] = useState<string | null>(null)
  const [shopbaseNotice, setShopbaseNotice] = useState<string | null>(null)
  const [manualSnippet, setManualSnippet] = useState<string | null>(null)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [dangerModal, setDangerModal] = useState<null | 'reset' | 'delete'>(null)
  const [confirmValue, setConfirmValue] = useState('')
  const [dangerError, setDangerError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSite = async () => {
    setLoading(true)
    try {
      const res = await sitesApi.get(siteId)
      setSite(res.data)
    } catch (error) {
      console.error('Failed to load site workspace', error)
    } finally {
      setLoading(false)
    }
  }

  const loadShopBaseIntegration = useCallback(async () => {
    setShopbaseLoading(true)
    try {
      const res = await shopbaseApi.getIntegration(siteId)
      setShopbaseIntegration(res.data)
      setShopbaseError(null)
    } catch (error) {
      setShopbaseIntegration(null)
      setShopbaseError(getApiErrorMessage(error, 'Could not load ShopBase settings.'))
    } finally {
      setShopbaseLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    void loadSite()
  }, [siteId])

  useEffect(() => {
    if (site?.platform === 'shopbase') {
      void loadShopBaseIntegration()
    } else {
      setShopbaseIntegration(null)
      setShopbaseError(null)
    }
  }, [site?.platform, loadShopBaseIntegration])

  useEffect(() => {
    if (shopbaseIntegration?.sync_state?.status === 'running') {
      pollingRef.current = setInterval(() => {
        void loadShopBaseIntegration()
      }, 5000)
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [shopbaseIntegration?.sync_state?.status, loadShopBaseIntegration])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  if (!site) {
    return null
  }

  const trackingState = getSiteTrackingState(site)
  const lastSignal = site.tracking_last_event_at || site.tracking_last_checked_at || site.created_at
  const isPending = trackingState.label === 'Pending'
  const isShopBase = site.platform === 'shopbase'
  const deleteKeyword = site.domain

  const cleanupSiteStorage = (deletedSiteId: string) => {
    if (typeof window === 'undefined') return
    for (const key of [RECENT_SITES_KEY, PINNED_SITES_KEY]) {
      try {
        const current = JSON.parse(window.localStorage.getItem(key) || '[]')
        if (!Array.isArray(current)) continue
        window.localStorage.setItem(key, JSON.stringify(current.filter((value) => value !== deletedSiteId)))
      } catch {
        window.localStorage.removeItem(key)
      }
    }
  }

  const handleResetData = async () => {
    setResetting(true)
    setDangerError(null)
    try {
      await sitesApi.resetData(site.id)
      setDangerModal(null)
      setNotice('Site data was reset. Integrations and API keys were kept.')
      void loadSite()
    } catch (error) {
      setDangerError(getApiErrorMessage(error, 'Could not reset site data.'))
    } finally {
      setResetting(false)
    }
  }

  const handleDeleteSite = async () => {
    if (confirmValue.trim().toLowerCase() !== deleteKeyword.trim().toLowerCase()) {
      setDangerError(`Type ${deleteKeyword} to confirm deletion.`)
      return
    }

    setDeleting(true)
    setDangerError(null)
    try {
      await sitesApi.delete(site.id)
      cleanupSiteStorage(site.id)
      router.push('/dashboard/sites')
    } catch (error) {
      setDangerError(getApiErrorMessage(error, 'Could not delete site.'))
    } finally {
      setDeleting(false)
    }
  }

  const handleInstallScript = async () => {
    setScriptLoading(true)
    setShopbaseNotice(null)
    setManualSnippet(null)
    try {
      const res = await shopbaseApi.installScript(site.id)
      if (res.data?.installed === false && res.data?.fallback_snippet) {
        setManualSnippet(res.data.fallback_snippet)
        setShopbaseNotice('ScriptTag permission is required. Use the manual snippet below.')
      } else if (res.data?.already_existed) {
        setShopbaseNotice('Tracking script is already installed.')
      } else {
        setShopbaseNotice('Tracking script installed successfully.')
      }
      await loadShopBaseIntegration()
      await loadSite()
    } catch (error) {
      setShopbaseNotice(getApiErrorMessage(error, 'Failed to install script.'))
    } finally {
      setScriptLoading(false)
    }
  }

  const handleRegisterWebhooks = async () => {
    setWebhooksLoading(true)
    setShopbaseNotice(null)
    try {
      await shopbaseApi.registerWebhooks(site.id)
      setShopbaseNotice('Webhooks registered successfully.')
      await loadShopBaseIntegration()
    } catch (error) {
      setShopbaseNotice(getApiErrorMessage(error, 'Failed to register webhooks.'))
    } finally {
      setWebhooksLoading(false)
    }
  }

  const handleStartBackfill = async () => {
    setBackfillLoading(true)
    setShopbaseNotice(null)
    try {
      await shopbaseApi.startBackfill(site.id)
      setShopbaseNotice('Backfill started.')
      await loadShopBaseIntegration()
    } catch (error) {
      setShopbaseNotice(getApiErrorMessage(error, 'Failed to start backfill.'))
    } finally {
      setBackfillLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center">
            <PlatformIcon platform={site.platform} size={40} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-app-strong">{site.name}</h1>
              <PlatformIcon platform={site.platform} size={18} />
              <TrackingStatusChip site={site} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-app-muted">
              <span className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {site.domain}
              </span>
              <span className="text-app-line">·</span>
              <span className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                {formatRelativeTimeLabel(lastSignal)}
              </span>
              {site.timezone && (
                <>
                  <span className="text-app-line">·</span>
                  <span>{site.timezone}</span>
                </>
              )}
              {site.currency && (
                <>
                  <span className="text-app-line">·</span>
                  <span>{site.currency}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-secondary text-xs">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Setup
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
          {notice}
        </div>
      ) : null}

      {/* Pending tracking banner */}
      {isPending && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-800">Tracking not verified yet</div>
            <p className="mt-0.5 text-sm text-amber-700">{trackingState.detail}</p>
            <Link href={`/dashboard/sites/${site.id}/onboarding`} className="mt-3 inline-flex items-center text-sm font-medium text-amber-800 underline underline-offset-2 hover:no-underline">
              Finish setup
            </Link>
          </div>
        </div>
      )}

      {/* App grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AppCard
          title="Analytics"
          description="Traffic, funnels, revenue, geo, devices, campaigns, and customer analytics."
          href={`/dashboard/${site.id}/overview`}
          icon={<Activity className="h-5 w-5" />}
          tone="emerald"
        />
        <AppCard
          title="Orders"
          description="WooCommerce order directory, order details, refunds, and commerce sync state."
          href={`/dashboard/${site.id}/orders`}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="blue"
        />
        <AppCard
          title="Contacts"
          description="Customer and contact directory anchored to event identity and purchase history."
          href={`/dashboard/${site.id}/contacts`}
          icon={<Users className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <QuickLink href={`/dashboard/${site.id}/realtime`} icon={<Activity className="h-4 w-4" />} label="Realtime" />
        <QuickLink href={`/dashboard/${site.id}/health`} icon={<ShieldCheck className="h-4 w-4" />} label="Pipeline Health" />
        <QuickLink href={`/dashboard/teams?siteId=${site.id}`} icon={<Users className="h-4 w-4" />} label="Team" />
        <QuickLink href={`/dashboard/sites/${site.id}/onboarding`} icon={<Settings className="h-4 w-4" />} label="Setup" />
      </div>

      {isShopBase ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-app-strong">ShopBase settings</h2>
              <p className="mt-1 text-sm text-app-muted">
                Manage tracking script, webhook registration, and order backfill for this ShopBase site.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/dashboard/${site.id}/integrations`} className="btn-secondary text-xs">
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                Open integrations
              </Link>
              <button type="button" className="icon-btn" title="Refresh ShopBase settings" onClick={() => void loadShopBaseIntegration()}>
                {shopbaseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {shopbaseNotice ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {shopbaseNotice}
            </div>
          ) : null}

          {shopbaseError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {shopbaseError}
            </div>
          ) : null}

          {shopbaseIntegration ? (
            <ShopBaseSettingsPanel
              integration={shopbaseIntegration}
              manualSnippet={manualSnippet}
              scriptLoading={scriptLoading}
              webhooksLoading={webhooksLoading}
              backfillLoading={backfillLoading}
              onInstallScript={handleInstallScript}
              onRegisterWebhooks={handleRegisterWebhooks}
              onStartBackfill={handleStartBackfill}
            />
          ) : shopbaseLoading ? (
            <div className="py-10">
              <LoadingSpinner />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-red-200 bg-red-50/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-red-900">Danger zone</h2>
            <p className="mt-1 text-sm text-red-700">
              Reset site data clears analytics, orders, contacts, and tracking while keeping the site, integrations, and API keys.
              Delete site removes the site and all associated data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-red-700 hover:bg-red-100" onClick={() => { setDangerError(null); setDangerModal('reset') }}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset data
            </button>
            <button type="button" className="btn-danger" onClick={() => { setDangerError(null); setConfirmValue(''); setDangerModal('delete') }}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete site
            </button>
          </div>
        </div>
      </section>

      {dangerModal ? (
        <DangerModal
          mode={dangerModal}
          siteName={site.name}
          siteDomain={site.domain}
          deleteKeyword={deleteKeyword}
          confirmValue={confirmValue}
          onConfirmValueChange={(value) => {
            setConfirmValue(value)
            if (dangerError) setDangerError(null)
          }}
          error={dangerError}
          busy={resetting || deleting}
          onClose={() => {
            if (resetting || deleting) return
            setDangerModal(null)
            setDangerError(null)
          }}
          onReset={handleResetData}
          onDelete={handleDeleteSite}
        />
      ) : null}
    </div>
  )
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function statusTone(status: string): string {
  if (status === 'connected' || status === 'idle') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'error' || status === 'disconnected') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading,
  disabled,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-app-strong hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}

function ShopBaseSettingsPanel({
  integration,
  manualSnippet,
  scriptLoading,
  webhooksLoading,
  backfillLoading,
  onInstallScript,
  onRegisterWebhooks,
  onStartBackfill,
}: {
  integration: ShopBaseIntegrationStatus
  manualSnippet: string | null
  scriptLoading: boolean
  webhooksLoading: boolean
  backfillLoading: boolean
  onInstallScript: () => void
  onRegisterWebhooks: () => void
  onStartBackfill: () => void
}) {
  const sync = integration.sync_state
  const script = integration.script_tag

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <SettingStatCard label="Connection" value={integration.status} tone={statusTone(integration.status)} detail={integration.shop_domain || 'No shop domain'} />
        <SettingStatCard
          label="Tracking script"
          value={script?.installed ? 'Installed' : script?.reason === 'permission_required' ? 'Permission required' : 'Missing'}
          tone={statusTone(script?.installed ? 'connected' : script?.reason === 'permission_required' ? 'error' : 'pending')}
          detail={script?.src || 'No script tag found'}
        />
        <SettingStatCard
          label="Order sync"
          value={sync?.status || 'Unknown'}
          tone={statusTone(sync?.status || 'pending')}
          detail={sync?.last_success_at ? `Last success ${formatDateTime(sync.last_success_at)}` : 'No completed sync yet'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Install script" icon={Zap} onClick={onInstallScript} loading={scriptLoading} />
            <ActionButton label="Register webhooks" icon={Webhook} onClick={onRegisterWebhooks} loading={webhooksLoading} />
            <ActionButton
              label={sync?.status === 'running' ? 'Backfill running' : 'Start backfill'}
              icon={RefreshCw}
              onClick={onStartBackfill}
              loading={backfillLoading}
              disabled={sync?.status === 'running'}
            />
          </div>

          {manualSnippet ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-sm font-medium text-amber-900">Manual snippet</div>
              <div className="flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-white px-2 py-1.5 text-xs text-amber-900">
                  {manualSnippet}
                </code>
                <button
                  type="button"
                  className="icon-btn"
                  title="Copy snippet"
                  onClick={() => navigator.clipboard?.writeText(manualSnippet)}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Last webhook" value={formatDateTime(sync?.last_webhook_at)} />
            <InfoRow label="Backfill completed" value={formatDateTime(sync?.backfill_completed_at)} />
            <InfoRow label="Last order synced" value={formatDateTime(sync?.last_order_updated_at)} />
            <InfoRow label="Last verified" value={formatDateTime(integration.sync_state?.updated_at)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-app-strong">Sync flags</div>
          <div className="mt-3 space-y-3 text-sm text-app-muted">
            <FlagRow label="Orders" enabled={!!sync?.order_sync_enabled} />
            <FlagRow label="Customers" enabled={!!sync?.customer_sync_enabled} />
            <FlagRow label="Products" enabled={!!sync?.product_sync_enabled} />
            <FlagRow label="Checkout" enabled={!!sync?.checkout_sync_enabled} />
          </div>
          {sync?.last_error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {sync.last_error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SettingStatCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: string
  tone: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-app-muted">{label}</div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-sm font-medium ${tone}`}>{value}</span>
      </div>
      <div className="mt-3 text-sm text-app-muted">{detail}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-app-muted">{label}</div>
      <div className="mt-1 text-sm text-app-strong">{value}</div>
    </div>
  )
}

function FlagRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${enabled ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}`}>
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  )
}

const TONE_CLASSES: Record<string, { bg: string; icon: string; btn: string }> = {
  emerald: {
    bg: 'bg-emerald-50 border-emerald-100',
    icon: 'bg-emerald-100 text-emerald-700',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  blue: {
    bg: 'bg-blue-50 border-blue-100',
    icon: 'bg-blue-100 text-blue-700',
    btn: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  violet: {
    bg: 'bg-violet-50 border-violet-100',
    icon: 'bg-violet-100 text-violet-700',
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
}

function AppCard({
  title,
  description,
  href,
  icon,
  tone,
}: {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  tone: 'emerald' | 'blue' | 'violet'
}) {
  const t = TONE_CLASSES[tone]
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border p-5 transition hover:shadow-md ${t.bg}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${t.icon}`}>
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-app-strong">{title}</div>
      <p className="mt-1.5 flex-1 text-sm text-app-muted">{description}</p>
      <div className={`mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition ${t.btn}`}>
        Open {title}
      </div>
    </Link>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-app-line bg-white px-4 py-3 text-sm font-medium text-app-strong transition hover:border-slate-300 hover:shadow-sm"
    >
      <span className="text-app-muted">{icon}</span>
      {label}
    </Link>
  )
}

function DangerModal({
  mode,
  siteName,
  siteDomain,
  deleteKeyword,
  confirmValue,
  onConfirmValueChange,
  error,
  busy,
  onClose,
  onReset,
  onDelete,
}: {
  mode: 'reset' | 'delete'
  siteName: string
  siteDomain: string
  deleteKeyword: string
  confirmValue: string
  onConfirmValueChange: (value: string) => void
  error: string | null
  busy: boolean
  onClose: () => void
  onReset: () => void
  onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-app-line bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <h3 className="text-lg font-semibold text-app-strong">
          {mode === 'reset' ? 'Reset site data' : 'Delete site'}
        </h3>
        <p className="mt-2 text-sm text-app-muted">
          {mode === 'reset'
            ? `This will clear analytics, orders, contacts, and tracking data for ${siteName}. Integrations, team access, and API keys stay in place.`
            : `This will permanently delete ${siteName} and all associated data. Type ${deleteKeyword} to confirm.`}
        </p>

        <div className="mt-4 rounded-xl border border-app-line bg-slate-50 px-4 py-3 text-sm text-app-strong">
          <div>{siteName}</div>
          <div className="mt-1 text-xs text-app-muted">{siteDomain}</div>
        </div>

        {mode === 'delete' ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-app-soft">
              Confirm domain
            </label>
            <input
              value={confirmValue}
              onChange={(event) => onConfirmValueChange(event.target.value)}
              className="input"
              placeholder={deleteKeyword}
              disabled={busy}
            />
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {mode === 'reset' ? (
            <button type="button" className="btn-secondary text-red-700 hover:bg-red-100" onClick={onReset} disabled={busy}>
              {busy ? 'Resetting...' : 'Reset data'}
            </button>
          ) : (
            <button type="button" className="btn-danger" onClick={onDelete} disabled={busy}>
              {busy ? 'Deleting...' : 'Delete site'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
