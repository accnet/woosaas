'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, CheckCircle2, Circle, Copy, Loader2, RefreshCw, Webhook, Zap } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { DetailRow } from '@/components/ui/detail-row'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { shopbaseApi, getApiErrorMessage } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import type { ShopBaseIntegrationStatus } from '@/lib/types'

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function connectionTone(status: string): 'good' | 'warn' | 'neutral' {
  if (status === 'connected') return 'good'
  if (status === 'error' || status === 'disconnected') return 'warn'
  return 'neutral'
}

function syncTone(status: string): 'good' | 'warn' | 'neutral' {
  if (status === 'idle') return 'good'
  if (status === 'running') return 'neutral'
  if (status === 'error') return 'warn'
  return 'neutral'
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
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3.5 py-2 text-xs font-semibold text-app-strong shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5 text-indigo-500" />
      )}
      {label}
    </button>
  )
}

export default function IntegrationsPage() {
  const siteId = useSiteId()
  const [integration, setIntegration] = useState<ShopBaseIntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [manualSnippet, setManualSnippet] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadIntegration = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await shopbaseApi.getIntegration(siteId)
        setIntegration(res.data)
        setError(null)
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getApiErrorMessage(err, 'Could not load integration status.'))
        }
      } finally {
        setLoading(false)
      }
    },
    [siteId],
  )

  // Poll when backfill is running
  useEffect(() => {
    if (integration?.sync_state?.status === 'running') {
      pollingRef.current = setInterval(() => {
        void loadIntegration()
      }, 5000)
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [integration?.sync_state?.status, loadIntegration])

  useEffect(() => {
    const controller = new AbortController()
    void loadIntegration(controller.signal)
    return () => controller.abort()
  }, [loadIntegration])

  const handleInstallScript = async () => {
    setScriptLoading(true)
    setActionMsg(null)
    setManualSnippet(null)
    try {
      const res = await shopbaseApi.installScript(siteId)
      if (res.data?.installed === false && res.data?.fallback_snippet) {
        setManualSnippet(res.data.fallback_snippet)
        setActionMsg('ScriptTag permission is required. Use the manual snippet below.')
      } else if (res.data?.already_existed) {
        setActionMsg('Tracking script is already installed.')
      } else {
        setActionMsg('Tracking script installed successfully.')
      }
      void loadIntegration()
    } catch (err) {
      setActionMsg(getApiErrorMessage(err, 'Failed to install script.'))
    } finally {
      setScriptLoading(false)
    }
  }

  const handleRegisterWebhooks = async () => {
    setWebhooksLoading(true)
    setActionMsg(null)
    try {
      await shopbaseApi.registerWebhooks(siteId)
      setActionMsg('Webhooks registered successfully.')
      void loadIntegration()
    } catch (err) {
      setActionMsg(getApiErrorMessage(err, 'Failed to register webhooks.'))
    } finally {
      setWebhooksLoading(false)
    }
  }

  const handleStartBackfill = async () => {
    setBackfillLoading(true)
    setActionMsg(null)
    try {
      await shopbaseApi.startBackfill(siteId)
      setActionMsg('Backfill started.')
      void loadIntegration()
    } catch (err) {
      setActionMsg(getApiErrorMessage(err, 'Failed to start backfill.'))
    } finally {
      setBackfillLoading(false)
    }
  }

  if (loading) {
    return (
      <AnalyticsPage>
        <AnalyticsPageHeader title="Integrations" />
        <AnalyticsPageContent>
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner />
          </div>
        </AnalyticsPageContent>
      </AnalyticsPage>
    )
  }

  if (error && !integration) {
    return (
      <AnalyticsPage>
        <AnalyticsPageHeader title="Integrations" />
        <AnalyticsPageContent>
          <InlineErrorState body={error} />
        </AnalyticsPageContent>
      </AnalyticsPage>
    )
  }

  // No ShopBase integration for this site
  if (!integration || integration.platform !== 'shopbase') {
    return (
      <AnalyticsPage>
        <AnalyticsPageHeader title="Integrations" />
        <AnalyticsPageContent>
          <SectionCard title="ShopBase Integration">
            <p className="text-sm text-app-muted">
              No ShopBase integration connected for this site. Connect one from the{' '}
              <a href="/dashboard/sites" className="text-blue-600 hover:underline">
                Websites
              </a>{' '}
              page.
            </p>
          </SectionCard>
        </AnalyticsPageContent>
      </AnalyticsPage>
    )
  }

  const sync = integration.sync_state
  const script = integration.script_tag

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Integrations"
        controls={
          <button
            type="button"
            className="btn-secondary gap-2 transition-all duration-150 hover:-translate-y-0.5"
            onClick={() => void loadIntegration()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />
      <AnalyticsPageContent>
        {actionMsg && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] backdrop-blur-sm px-5 py-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            <p className="text-sm font-semibold text-indigo-900 leading-normal">{actionMsg}</p>
          </div>
        )}

        {/* Connection */}
        <SectionCard
          title="ShopBase Connection"
          className="mb-4 card-glass border-slate-200/50 hover:border-indigo-500/20 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <DetailRow label="Platform" value="ShopBase" />
          <DetailRow
            label="Status"
            value={<span className="font-mono text-xs uppercase font-bold">{integration.status}</span>}
            tone={connectionTone(integration.status)}
          />
          <DetailRow
            label="Shop Domain"
            value={<span className="font-mono text-xs text-app-strong">{integration.shop_domain || '—'}</span>}
          />
        </SectionCard>

        {/* Tracking Script */}
        <SectionCard
          title="Tracking Script"
          className="mb-4 card-glass border-slate-200/50 hover:border-indigo-500/20 shadow-sm hover:shadow-md transition-all duration-200"
          action={
            <ActionButton
              label="Install Script"
              icon={Zap}
              onClick={() => void handleInstallScript()}
              loading={scriptLoading}
            />
          }
        >
          <DetailRow
            label="Status"
            value={
              <span className="font-mono text-xs font-semibold">
                {script?.installed ? 'Installed' : script?.reason === 'permission_required' ? 'Permission required' : 'Missing'}
              </span>
            }
            tone={script?.installed ? 'good' : script?.reason === 'permission_required' ? 'warn' : 'neutral'}
          />
          {script?.src && (
            <DetailRow
              label="Script URL"
              value={
                <span className="font-mono text-[11px] text-app-muted truncate max-w-[240px] inline-block" title={script.src}>
                  {script.src}
                </span>
              }
            />
          )}
          {script?.script_tag_id ? (
            <DetailRow
              label="Script Tag ID"
              value={<span className="font-mono text-xs tabular-nums text-app-strong">{String(script.script_tag_id)}</span>}
            />
          ) : null}
          <p className="text-xs font-medium text-app-muted leading-relaxed mt-4">
            Install the Woosaas tracking script on your ShopBase store automatically via Script
            Tags. Click "Install Script" to add or verify the script.
          </p>
          {manualSnippet && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.02] backdrop-blur-sm p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-800">Manual Snippet installation</div>
              <div className="flex items-start gap-3 bg-slate-900 rounded-xl p-3.5 border border-slate-800">
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-300 select-all leading-relaxed">
                  {manualSnippet}
                </pre>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-all duration-150 active:scale-95"
                  title="Copy snippet"
                  onClick={() => {
                    void navigator.clipboard?.writeText(manualSnippet)
                    setActionMsg('Snippet copied to clipboard.')
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Webhooks */}
        <SectionCard
          title="Webhooks"
          className="mb-4 card-glass border-slate-200/50 hover:border-indigo-500/20 shadow-sm hover:shadow-md transition-all duration-200"
          action={
            <ActionButton
              label="Register Webhooks"
              icon={Webhook}
              onClick={() => void handleRegisterWebhooks()}
              loading={webhooksLoading}
            />
          }
        >
          {sync && (
            <DetailRow
              label="Last Webhook"
              value={<span className="font-mono text-xs tabular-nums font-semibold">{formatDateTime(sync.last_webhook_at)}</span>}
            />
          )}
          <p className="text-xs font-medium text-app-muted leading-relaxed mt-4">
            Register required webhook topics on your ShopBase store so order events are delivered in
            real time.
          </p>
        </SectionCard>

        {/* Sync State */}
        {sync && (
          <SectionCard
            title="Order Sync / Backfill"
            className="card-glass border-slate-200/50 hover:border-indigo-500/20 shadow-sm hover:shadow-md transition-all duration-200"
            action={
              <ActionButton
                label={sync.status === 'running' ? 'Running…' : 'Start Backfill'}
                icon={sync.status === 'running' ? Loader2 : RefreshCw}
                onClick={() => void handleStartBackfill()}
                loading={backfillLoading}
                disabled={sync.status === 'running'}
              />
            }
          >
            <DetailRow
              label="Sync Status"
              value={<span className="font-mono text-xs uppercase font-bold">{sync.status}</span>}
              tone={syncTone(sync.status)}
            />
            <DetailRow
              label="Last Success"
              value={<span className="font-mono text-xs tabular-nums font-medium">{formatDateTime(sync.last_success_at)}</span>}
            />
            <DetailRow
              label="Backfill Completed"
              value={<span className="font-mono text-xs tabular-nums font-medium">{formatDateTime(sync.backfill_completed_at)}</span>}
            />
            <DetailRow
              label="Last Order Synced"
              value={<span className="font-mono text-xs tabular-nums font-medium">{formatDateTime(sync.last_order_updated_at)}</span>}
            />
            {sync.last_error && (
              <DetailRow
                label="Last Error"
                value={<span className="font-mono text-xs text-rose-600 font-semibold">{sync.last_error}</span>}
                tone="warn"
              />
            )}
            {sync.last_error_at && (
              <DetailRow
                label="Error At"
                value={<span className="font-mono text-xs tabular-nums text-rose-600 font-medium">{formatDateTime(sync.last_error_at)}</span>}
              />
            )}
          </SectionCard>
        )}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
