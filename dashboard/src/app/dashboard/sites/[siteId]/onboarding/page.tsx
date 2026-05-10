'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  HeartPulse,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { StatusChip } from '@/components/ui/status-chip'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { APIKey, APIKeyResponse, Site } from '@/lib/types'

type StepState = 'complete' | 'current' | 'blocked'

export default function OnboardingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [site, setSite] = useState<Site | null>(null)
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Key management state
  const [creating, setCreating] = useState(false)
  const [createdSecrets, setCreatedSecrets] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<string | null>(null)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const [showKeyManager, setShowKeyManager] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      if (!site) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const [siteRes, keyRes] = await Promise.all([sitesApi.get(siteId), sitesApi.getApiKeys(siteId)])
        if (!cancelled) {
          setSite(siteRes.data)
          setApiKeys(keyRes.data)
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Setup data could not be loaded.'))
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false) }
      }
    }
    void loadData()
    return () => { cancelled = true }
  }, [reloadKey, siteId])

  const handleCreateKey = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await sitesApi.createApiKey(siteId, `Key ${apiKeys.length + 1}`)
      const newKey = res.data as APIKeyResponse
      setCreatedSecrets((prev) => ({ ...prev, [newKey.id]: newKey.key }))
      setShowKey(newKey.id)
      setReloadKey((v) => v + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create API key.'))
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedValue(value)
    window.setTimeout(() => setCopiedValue(null), 2000)
  }

  const { steps, progress } = useMemo(() => {
    if (!site) return { steps: [] as Array<{ title: string; description: string; state: StepState }>, progress: 0 }
    const trackingState = getSiteTrackingState(site)
    const hasKey = apiKeys.length > 0
    const isVerified = trackingState.label === 'Verified' || trackingState.label === 'Active'
    const isActive = trackingState.label === 'Active'

    const steps: Array<{ title: string; description: string; state: StepState }> = [
      {
        title: 'Generate API Key',
        description: 'Create a credential that the WordPress plugin will use to authenticate events.',
        state: hasKey ? 'complete' : 'current',
      },
      {
        title: 'Install WordPress Plugin',
        description: 'Download and activate the Woosaas plugin in your WordPress / WooCommerce store.',
        state: isVerified ? 'complete' : hasKey ? 'current' : 'blocked',
      },
      {
        title: 'Configure Plugin',
        description: 'Paste the API key and site domain into the plugin settings page.',
        state: isVerified ? 'complete' : hasKey ? 'current' : 'blocked',
      },
      {
        title: 'Verify Live Collection',
        description: 'Confirm events are arriving via Pipeline Health and Realtime.',
        state: isActive ? 'complete' : isVerified ? 'current' : 'blocked',
      },
    ]

    return { steps, progress: steps.filter((s) => s.state === 'complete').length }
  }, [apiKeys, site])

  if (loading && !site) return <LoadingSpinner className="py-16" />
  if (!site) return <div className="card p-6"><p className="text-sm text-app-muted">{error || 'Site not found.'}</p></div>

  const trackingState = getSiteTrackingState(site)
  const primaryKey = apiKeys[0]
  const primarySecret = primaryKey ? (createdSecrets[primaryKey.id] || null) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-app-strong">Setup</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-app-muted">
            <span>{site.name}</span>
            <span className="text-app-line">·</span>
            <TrackingStatusChip site={site} />
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary gap-2"
          onClick={() => setReloadKey((v) => v + 1)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <InlineErrorState body={error} compact onRetry={() => setReloadKey((v) => v + 1)} />
      )}

      {/* Progress bar */}
      <div className="card px-5 py-4">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium text-app-strong">{progress} of {steps.length} steps complete</span>
          {progress === steps.length ? (
            <StatusChip label="Setup complete" tone="good" />
          ) : (
            <StatusChip label={`${steps.length - progress} remaining`} tone="neutral" />
          )}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-app-subtle">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(progress / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Generate API Key — inline */}
      <StepCard
        index={0}
        title={steps[0].title}
        description={steps[0].description}
        state={steps[0].state}
      >
        {apiKeys.length === 0 ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreateKey}
              disabled={creating}
              className="btn-primary gap-2"
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Generating…' : 'Generate API Key'}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Key issued — {apiKeys.length} key{apiKeys.length > 1 ? 's' : ''} active
              </div>
              <div className="mt-2 font-mono text-sm text-emerald-800">
                {primaryKey.key_prefix}…
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateKey}
              disabled={creating}
              className="btn-secondary gap-2 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? 'Generating…' : 'Generate another key'}
            </button>
          </div>
        )}
      </StepCard>

      {/* Step 2: Install Plugin */}
      <StepCard
        index={1}
        title={steps[1].title}
        description={steps[1].description}
        state={steps[1].state}
      >
        <div className="mt-4 space-y-3 text-sm text-app-muted">
          <ol className="space-y-2 pl-4">
            <li className="list-decimal">In WordPress admin → Plugins → Add New → Upload Plugin</li>
            <li className="list-decimal">Upload the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">woosaas.zip</code> file and click Install Now</li>
            <li className="list-decimal">Click Activate Plugin</li>
          </ol>
        </div>
      </StepCard>

      {/* Step 3: Configure Plugin — key + domain inline */}
      <StepCard
        index={2}
        title={steps[2].title}
        description={steps[2].description}
        state={steps[2].state}
      >
        <div className="mt-4 space-y-3">
          <p className="text-sm text-app-muted">
            In WordPress → WooSaaS Settings, paste these two values:
          </p>

          <CopyField
            label="API Key"
            value={primarySecret || (primaryKey ? `${primaryKey.key_prefix}… (generate a new key to see the full secret)` : 'No key generated yet')}
            copyValue={primarySecret || primaryKey?.key_prefix || ''}
            mono
            masked={!primarySecret}
            copiedValue={copiedValue}
            onCopy={handleCopy}
            extra={
              primaryKey && (
                <button
                  type="button"
                  onClick={() => setShowKey(showKey === primaryKey.id ? null : primaryKey.id)}
                  className="btn-ghost px-2 py-1 text-xs"
                >
                  {showKey === primaryKey.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showKey === primaryKey.id ? 'Hide' : 'Reveal'}
                </button>
              )
            }
            revealed={showKey === primaryKey?.id}
            fullSecret={primaryKey ? createdSecrets[primaryKey.id] : undefined}
          />

          <CopyField
            label="Site URL"
            value={site.domain}
            copyValue={site.domain}
            copiedValue={copiedValue}
            onCopy={handleCopy}
          />
        </div>
      </StepCard>

      {/* Step 4: Verify */}
      <StepCard
        index={3}
        title={steps[3].title}
        description={steps[3].description}
        state={steps[3].state}
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/dashboard/${siteId}/health`} className="btn-primary gap-2 text-sm">
            <HeartPulse className="h-4 w-4" />
            Pipeline Health
          </Link>
          <Link href={`/dashboard/${siteId}/realtime`} className="btn-secondary gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Realtime
          </Link>
        </div>
      </StepCard>

      {/* Key Manager — collapsible */}
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowKeyManager((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-app-strong hover:bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-app-muted" />
            API Key Management
            <StatusChip label={`${apiKeys.length} active`} tone="neutral" />
          </div>
          {showKeyManager ? <ChevronUp className="h-4 w-4 text-app-muted" /> : <ChevronDown className="h-4 w-4 text-app-muted" />}
        </button>

        {showKeyManager && (
          <div className="border-t border-app-line px-5 pb-5 pt-4 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The full secret is shown <strong>only once</strong> after creation. If lost, generate a new key and update the plugin.
            </div>

            {apiKeys.length === 0 ? (
              <p className="text-sm text-app-muted">No keys issued yet.</p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => {
                  const secret = createdSecrets[key.id]
                  const isVisible = showKey === key.id
                  const displayValue = isVisible && secret ? secret : `${key.key_prefix}…`

                  return (
                    <div key={key.id} className="rounded-lg border border-app-line bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-app-strong">{key.name}</div>
                          <div className="mt-0.5 text-xs text-app-muted">
                            Created {key.created_at ? new Date(key.created_at).toLocaleString() : '-'}
                            {key.last_used_at ? ` · Last used ${new Date(key.last_used_at).toLocaleString()}` : ' · Unused'}
                          </div>
                          <div className="mt-2 font-mono text-xs text-app-strong break-all">{displayValue}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowKey(isVisible ? null : key.id)}
                            className="btn-ghost px-2.5 py-1 text-xs"
                          >
                            {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {isVisible ? 'Hide' : 'Reveal'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(secret || key.key_prefix)}
                            className="btn-primary px-2.5 py-1 text-xs"
                          >
                            {copiedValue === (secret || key.key_prefix) ? (
                              <><Check className="h-3.5 w-3.5" /> Copied</>
                            ) : (
                              <><Copy className="h-3.5 w-3.5" /> Copy</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateKey}
              disabled={creating}
              className="btn-secondary gap-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Generating…' : 'Generate new key'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StepCard({
  index,
  title,
  description,
  state,
  children,
}: {
  index: number
  title: string
  description: string
  state: StepState
  children?: React.ReactNode
}) {
  const isComplete = state === 'complete'
  const isBlocked = state === 'blocked'

  return (
    <div className={`card px-5 py-5 ${isBlocked ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-4">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            isComplete
              ? 'bg-emerald-100 text-emerald-700'
              : isBlocked
                ? 'bg-app-subtle text-app-muted'
                : 'bg-blue-100 text-blue-700'
          }`}
        >
          {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-app-strong">{title}</span>
            {isComplete && <StatusChip label="Complete" tone="good" />}
            {state === 'current' && <StatusChip label="Next" tone="info" />}
            {isBlocked && <StatusChip label="Blocked" tone="neutral" />}
          </div>
          <p className="mt-1 text-sm text-app-muted">{description}</p>
          {!isBlocked && children}
        </div>
      </div>
    </div>
  )
}

function CopyField({
  label,
  value,
  copyValue,
  mono = false,
  masked = false,
  copiedValue,
  onCopy,
  extra,
  revealed,
  fullSecret,
}: {
  label: string
  value: string
  copyValue: string
  mono?: boolean
  masked?: boolean
  copiedValue: string | null
  onCopy: (v: string) => void
  extra?: React.ReactNode
  revealed?: boolean
  fullSecret?: string
}) {
  const displayValue = revealed && fullSecret ? fullSecret : value
  const effectiveCopyValue = revealed && fullSecret ? fullSecret : copyValue

  return (
    <div className="rounded-lg border border-app-line bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-app-line px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-app-soft">{label}</span>
        <div className="flex items-center gap-1">
          {extra}
          <button
            type="button"
            onClick={() => onCopy(effectiveCopyValue)}
            disabled={masked && !revealed}
            className="btn-primary px-2.5 py-1 text-xs disabled:opacity-40"
          >
            {copiedValue === effectiveCopyValue ? (
              <><Check className="h-3.5 w-3.5" /> Copied</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copy</>
            )}
          </button>
        </div>
      </div>
      <div className={`break-all px-4 py-3 text-sm ${mono ? 'font-mono' : ''} ${masked ? 'text-app-muted' : 'text-app-strong'}`}>
        {displayValue}
      </div>
    </div>
  )
}
