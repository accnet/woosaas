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
      setNotice('Site data was reset successfully. Integrations and API keys were preserved.')
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_4px_20px_rgba(99,102,241,0.08)] border border-slate-100 transition-all duration-300 hover:scale-105">
            <PlatformIcon platform={site.platform} size={28} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-app-strong font-outfit">{site.name}</h1>
              <PlatformIcon platform={site.platform} size={18} />
              <TrackingStatusChip site={site} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-app-muted">
              <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 border border-slate-100">
                <Globe className="h-3.5 w-3.5 text-indigo-500" />
                <span className="font-semibold text-slate-600">{site.domain}</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 border border-slate-100">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-slate-600">{formatRelativeTimeLabel(lastSignal)}</span>
              </span>
              {site.timezone && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500 font-semibold">{site.timezone}</span>
                </>
              )}
              {site.currency && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500 font-semibold">{site.currency}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/sites/${site.id}/onboarding`} className="btn-secondary text-xs flex items-center shadow-sm">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Setup Workspace
          </Link>
        </div>
      </div>

      {/* Global general notices */}
      {notice ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 px-5 py-4 text-sm text-indigo-900 card-glass shadow-sm flex items-center gap-3 animate-fade-in">
          <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0" />
          <div className="font-semibold">{notice}</div>
        </div>
      ) : null}

      {/* Pending tracking banner */}
      {isPending && (
        <div className="relative overflow-hidden flex items-start gap-4 rounded-2xl border border-amber-100 bg-amber-50/40 p-5 card-glass shadow-sm animate-fade-in">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-amber-400 to-yellow-500" />
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/60 border border-amber-200/50 shadow-inner">
            <AlertTriangle className="h-5 w-5 text-amber-700 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-amber-900 font-outfit">Tracking not verified yet</div>
            <p className="mt-1 text-sm leading-relaxed text-amber-800/80">{trackingState.detail}</p>
            <div className="mt-3">
              <Link href={`/dashboard/sites/${site.id}/onboarding`} className="inline-flex items-center text-sm font-bold text-amber-900 underline underline-offset-4 hover:no-underline hover:text-amber-950">
                Finish setup workspace
                <Zap className="ml-1 h-3.5 w-3.5" />
              </Link>
            </div>
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
        <QuickLink href={`/dashboard/${site.id}/realtime`} icon={<Activity className="h-4 w-4" />} label="Realtime Events" />
        <QuickLink href={`/dashboard/${site.id}/health`} icon={<ShieldCheck className="h-4 w-4" />} label="Pipeline Health" />
        <QuickLink href={`/dashboard/teams?siteId=${site.id}`} icon={<Users className="h-4 w-4" />} label="Team Access" />
        <QuickLink href={`/dashboard/sites/${site.id}/onboarding`} icon={<Settings className="h-4 w-4" />} label="Configuration" />
      </div>

      {/* ShopBase settings section */}
      {isShopBase ? (
        <section className="rounded-2xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-500" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-app-strong font-outfit tracking-tight flex items-center gap-2">
                <PlatformIcon platform="shopbase" size={20} />
                ShopBase settings
              </h2>
              <p className="mt-1 text-sm text-app-muted">
                Manage tracking script, webhook registration, and order backfill for this ShopBase site.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/dashboard/${site.id}/integrations`} className="btn-secondary text-xs flex items-center shadow-sm">
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                Open integrations
              </Link>
              <button 
                type="button" 
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 shadow-sm" 
                title="Refresh ShopBase settings" 
                onClick={() => void loadShopBaseIntegration()}
              >
                {shopbaseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {shopbaseNotice ? (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3.5 text-sm text-indigo-900 font-semibold card-glass flex items-center gap-2.5 animate-fade-in shadow-sm">
              <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>{shopbaseNotice}</span>
            </div>
          ) : null}

          {shopbaseError ? (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/40 px-4 py-3.5 text-sm text-red-900 font-semibold card-glass flex items-center gap-2.5 animate-fade-in shadow-sm">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 animate-bounce" />
              <span>{shopbaseError}</span>
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
            <div className="py-10 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Danger Zone */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-200/60 bg-gradient-to-r from-rose-50/30 via-white to-white p-6 shadow-sm">
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-red-400 to-rose-500" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-900 font-outfit tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />
              Danger zone
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-red-700/80">
              Reset site data clears analytics, orders, contacts, and tracking while keeping the site workspace configuration, active integrations, and API keys.
              Delete site removes the site completely and deletes all associated events and database history.
            </p>
          </div>
          <div className="flex flex-wrap shrink-0 gap-3">
            <button 
              type="button" 
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-all duration-200 hover:bg-red-50 hover:border-red-300 shadow-sm active:translate-y-0.5" 
              onClick={() => { setDangerError(null); setDangerModal('reset') }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset site data
            </button>
            <button 
              type="button" 
              className="btn-danger flex items-center gap-2" 
              onClick={() => { setDangerError(null); setConfirmValue(''); setDangerModal('delete') }}
            >
              <Trash2 className="h-4 w-4" />
              Delete site
            </button>
          </div>
        </div>
      </section>

      {/* Danger Modal */}
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
  if (status === 'connected' || status === 'idle') return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
  if (status === 'error' || status === 'disconnected') return 'bg-red-50 text-red-700 border-red-200/60'
  return 'bg-slate-50 text-slate-600 border-slate-200/60'
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
      className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-app-strong transition-all duration-200 hover:border-indigo-200 hover:bg-slate-50 hover:text-indigo-750 shadow-sm active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : <Icon className="h-4 w-4 text-slate-500" />}
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
        <div className="space-y-5 rounded-2xl border border-slate-100 bg-slate-50/40 p-5 shadow-sm">
          <div className="flex flex-wrap gap-2.5">
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
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-md animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-400 font-mono">
                <span>manual-script-tag.js</span>
                <span className="text-[10px] rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">HTML Script</span>
              </div>
              <div className="flex items-start gap-3 p-4">
                <code className="min-w-0 flex-1 break-all rounded bg-slate-900/50 p-2 font-mono text-[11px] leading-relaxed text-indigo-300 select-all whitespace-pre-wrap">
                  {manualSnippet}
                </code>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
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

        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-sm font-bold text-app-strong font-outfit tracking-tight pb-3.5 border-b border-slate-100">Sync features flags</div>
            <div className="mt-3.5 space-y-1">
              <FlagRow label="Orders syncing" enabled={!!sync?.order_sync_enabled} />
              <FlagRow label="Customers syncing" enabled={!!sync?.customer_sync_enabled} />
              <FlagRow label="Products syncing" enabled={!!sync?.product_sync_enabled} />
              <FlagRow label="Checkout syncing" enabled={!!sync?.checkout_sync_enabled} />
            </div>
          </div>
          {sync?.last_error ? (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/40 p-3.5 text-xs text-red-700 card-glass flex items-start gap-2 animate-fade-in shadow-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span className="font-semibold leading-relaxed break-all">{sync.last_error}</span>
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
  let dotColor = 'bg-slate-400'
  let cardBorder = 'border-slate-200/60'
  let pulseClass = ''
  
  const valLower = value.toLowerCase()
  if (valLower === 'connected' || valLower === 'installed' || valLower === 'idle') {
    dotColor = 'bg-emerald-500'
    cardBorder = 'hover:border-emerald-300/50'
    pulseClass = 'animate-pulse'
  } else if (valLower === 'error' || valLower === 'disconnected' || valLower === 'permission required' || valLower === 'missing') {
    dotColor = 'bg-red-500'
    cardBorder = 'hover:border-red-300/50'
    pulseClass = 'animate-pulse'
  } else if (valLower === 'running') {
    dotColor = 'bg-indigo-500'
    cardBorder = 'hover:border-indigo-300/50'
    pulseClass = 'animate-ping'
  }

  return (
    <div className={`rounded-xl border bg-white/80 p-5 transition-all duration-300 hover:shadow-[0_8px_20px_rgba(148,163,184,0.06)] hover:-translate-y-0.5 ${cardBorder}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 font-sans">{label}</div>
      <div className="mt-3.5 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${tone}`}>
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor} ${pulseClass}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
          </span>
          {value}
        </span>
      </div>
      <div className="mt-3.5 font-mono text-[11px] leading-relaxed text-app-muted truncate" title={detail}>
        {detail}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white px-4 py-3 transition-all duration-300 hover:border-indigo-100 hover:shadow-[0_4px_12px_rgba(99,102,241,0.03)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-app-muted font-sans">{label}</div>
      <div className="mt-1.5 font-mono text-[11px] font-semibold text-app-strong">{value}</div>
    </div>
  )
}

function FlagRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-all duration-300 border ${
        enabled 
          ? 'bg-emerald-50/50 text-emerald-700 border-emerald-200/50' 
          : 'bg-amber-50/50 text-amber-700 border-amber-200/50'
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  )
}

const TONE_CLASSES: Record<string, { gradient: string; border: string; bgIcon: string; textIcon: string; textBtn: string; hoverBtn: string; glow: string }> = {
  emerald: {
    gradient: 'from-emerald-400 to-teal-500',
    border: 'group-hover:border-emerald-300/60',
    bgIcon: 'bg-emerald-50 border-emerald-100/50 text-emerald-600',
    textIcon: 'text-emerald-600',
    textBtn: 'border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
    hoverBtn: 'hover:shadow-[0_4px_12px_rgba(16,185,129,0.15)]',
    glow: 'rgba(16, 185, 129, 0.08)',
  },
  blue: {
    gradient: 'from-blue-400 to-indigo-500',
    border: 'group-hover:border-blue-300/60',
    bgIcon: 'bg-blue-50 border-blue-100/50 text-blue-600',
    textIcon: 'text-blue-600',
    textBtn: 'border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-600 hover:text-white hover:border-blue-600',
    hoverBtn: 'hover:shadow-[0_4px_12px_rgba(37,99,235,0.15)]',
    glow: 'rgba(37, 99, 235, 0.08)',
  },
  violet: {
    gradient: 'from-violet-400 to-purple-500',
    border: 'group-hover:border-violet-300/60',
    bgIcon: 'bg-violet-50 border-violet-100/50 text-violet-600',
    textIcon: 'text-violet-600',
    textBtn: 'border border-violet-200 text-violet-700 bg-violet-50/50 hover:bg-violet-600 hover:text-white hover:border-violet-600',
    hoverBtn: 'hover:shadow-[0_4px_12px_rgba(124,58,237,0.15)]',
    glow: 'rgba(124, 58, 237, 0.08)',
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
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(148,163,184,0.12)] ${t.border}`}
      style={{
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.01), 0 10px 30px rgba(149, 157, 165, 0.04)',
      }}
    >
      {/* Premium Top Line Accent */}
      <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${t.gradient}`} />
      
      {/* Card Icon */}
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-110 ${t.bgIcon}`}>
        {icon}
      </div>
      
      {/* Title & Desc */}
      <div className="mt-5 text-lg font-bold text-app-strong font-outfit tracking-tight group-hover:text-indigo-900 transition-colors duration-200">{title}</div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-app-muted">{description}</p>
      
      {/* CTA Button */}
      <div className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${t.textBtn} ${t.hoverBtn}`}>
        Open {title}
        <span className="ml-1.5 transition-transform duration-200 group-hover:translate-x-1">→</span>
      </div>
    </Link>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm font-semibold text-app-strong transition-all duration-300 hover:border-indigo-200 hover:bg-white hover:shadow-[0_8px_20px_rgba(99,102,241,0.05)] hover:-translate-y-0.5 group"
    >
      <div className="flex items-center gap-3">
        <span className="text-slate-400 group-hover:text-indigo-500 transition-colors duration-200">{icon}</span>
        <span className="group-hover:text-indigo-900 transition-colors duration-200">{label}</span>
      </div>
      <span className="text-slate-300 group-hover:text-indigo-400 transition-all duration-200 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-xs font-bold">→</span>
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
  const isReset = mode === 'reset'
  const shadowGlow = isReset 
    ? 'shadow-[0_24px_80px_rgba(99,102,241,0.18)] border-indigo-100' 
    : 'shadow-[0_24px_80px_rgba(244,63,94,0.18)] border-red-100'
  const accentTop = isReset
    ? 'bg-gradient-to-r from-indigo-500 to-blue-600'
    : 'bg-gradient-to-r from-red-500 to-rose-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-md animate-fade-in">
      <div className={`relative w-full max-w-lg overflow-hidden rounded-2xl border bg-white p-6 transition-all duration-300 animate-slide-up ${shadowGlow}`}>
        {/* Top accent border */}
        <div className={`absolute top-0 left-0 h-1.5 w-full ${accentTop}`} />
        
        <h3 className="text-xl font-bold font-outfit tracking-tight text-app-strong flex items-center gap-2">
          {isReset ? (
            <>
              <RotateCcw className="h-5 w-5 text-indigo-500" />
              Reset site data
            </>
          ) : (
            <>
              <AlertTriangle className="h-5 w-5 text-red-500 animate-bounce" />
              Delete site
            </>
          )}
        </h3>
        
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          {isReset
            ? `This action will clear all analytics, synced commerce orders, customer profiles, and tracking events for ${siteName}. Connected integrations, configurations, and API keys will remain active.`
            : `This action will permanently delete ${siteName} and erase all associated workspace databases and integration pipelines. This action is irreversible.`}
        </p>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3.5 shadow-inner">
          <div className="text-sm font-bold text-app-strong font-outfit">{siteName}</div>
          <div className="mt-1 font-mono text-xs text-app-muted">{siteDomain}</div>
        </div>

        {!isReset ? (
          <div className="mt-4">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-app-soft">
              Type <span className="font-mono text-red-600 select-all bg-red-50 px-1 py-0.5 rounded border border-red-100">{deleteKeyword}</span> to confirm
            </label>
            <input
              value={confirmValue}
              onChange={(event) => onConfirmValueChange(event.target.value)}
              className="input text-sm font-mono border-slate-200 focus:border-red-500 focus:ring-red-100"
              placeholder={deleteKeyword}
              disabled={busy}
            />
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 px-4 py-3 text-sm font-semibold text-red-800 flex items-center gap-2 animate-fade-in">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {isReset ? (
            <button 
              type="button" 
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-indigo-500/10" 
              onClick={onReset} 
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : 'Reset site data'}
            </button>
          ) : (
            <button 
              type="button" 
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-red-500/10" 
              onClick={onDelete} 
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : 'Delete site'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
