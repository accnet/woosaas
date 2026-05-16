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
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-app-strong hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
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
            onClick={() => void loadIntegration()}
            className="icon-btn"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />
      <AnalyticsPageContent>
        {actionMsg && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            {actionMsg}
          </div>
        )}

        {/* Connection */}
        <SectionCard title="ShopBase Connection" className="mb-4">
          <DetailRow label="Platform" value="ShopBase" />
          <DetailRow
            label="Status"
            value={integration.status}
            tone={connectionTone(integration.status)}
          />
          <DetailRow label="Shop Domain" value={integration.shop_domain || '—'} />
        </SectionCard>

        {/* Tracking Script */}
        <SectionCard
          title="Tracking Script"
          className="mb-4"
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
            value={script?.installed ? 'Installed' : script?.reason === 'permission_required' ? 'Permission required' : 'Missing'}
            tone={script?.installed ? 'good' : script?.reason === 'permission_required' ? 'warn' : 'neutral'}
          />
          {script?.src && <DetailRow label="Script URL" value={script.src} />}
          {script?.script_tag_id ? <DetailRow label="Script Tag ID" value={String(script.script_tag_id)} /> : null}
          <p className="text-sm text-app-muted">
            Install the Woosaas tracking script on your ShopBase store automatically via Script
            Tags. Click "Install Script" to add or verify the script.
          </p>
          {manualSnippet && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-sm font-medium text-amber-900">Manual snippet</div>
              <div className="flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-white px-2 py-1.5 text-xs text-amber-900">
                  {manualSnippet}
                </code>
                <button
                  type="button"
                  className="icon-button"
                  title="Copy snippet"
                  onClick={() => navigator.clipboard?.writeText(manualSnippet)}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Webhooks */}
        <SectionCard
          title="Webhooks"
          className="mb-4"
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
              value={formatDateTime(sync.last_webhook_at)}
            />
          )}
          <p className="mt-2 text-sm text-app-muted">
            Register required webhook topics on your ShopBase store so order events are delivered in
            real time.
          </p>
        </SectionCard>

        {/* Sync State */}
        {sync && (
          <SectionCard
            title="Order Sync / Backfill"
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
              value={sync.status}
              tone={syncTone(sync.status)}
            />
            <DetailRow
              label="Last Success"
              value={formatDateTime(sync.last_success_at)}
            />
            <DetailRow
              label="Backfill Completed"
              value={formatDateTime(sync.backfill_completed_at)}
            />
            <DetailRow
              label="Last Order Synced"
              value={formatDateTime(sync.last_order_updated_at)}
            />
            {sync.last_error && (
              <DetailRow label="Last Error" value={sync.last_error} tone="warn" />
            )}
            {sync.last_error_at && (
              <DetailRow label="Error At" value={formatDateTime(sync.last_error_at)} />
            )}
          </SectionCard>
        )}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
