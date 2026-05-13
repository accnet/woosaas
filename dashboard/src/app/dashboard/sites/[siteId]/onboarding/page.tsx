'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  HeartPulse,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { TrackingStatusChip } from '@/components/ui/tracking-status-chip'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { APIKey, APIKeyResponse, Site } from '@/lib/types'

type StepState = 'complete' | 'current' | 'upcoming'

export default function OnboardingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [site, setSite] = useState<Site | null>(null)
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [activeSecret, setActiveSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

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
      const res = await sitesApi.createApiKey(siteId, 'Plugin Key')
      const newKey = res.data as APIKeyResponse
      setActiveSecret(newKey.key)
      setShowSecret(true)
      setReloadKey((v) => v + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create API key.'))
    } finally {
      setCreating(false)
    }
  }

  const handleRegenerateKey = async () => {
    setRegenerating(true)
    setError(null)
    try {
      const res = await sitesApi.createApiKey(siteId, 'Plugin Key')
      const newKey = res.data as APIKeyResponse
      setActiveSecret(newKey.key)
      setShowSecret(true)
      setReloadKey((v) => v + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to regenerate API key.'))
    } finally {
      setRegenerating(false)
    }
  }

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedValue(value)
    window.setTimeout(() => setCopiedValue(null), 2000)
  }

  const { steps, progress } = useMemo(() => {
    if (!site) return { steps: [] as Array<{ id: number; title: string; description: string; state: StepState; summary?: string }>, progress: 0 }
    const trackingState = getSiteTrackingState(site)
    const hasKey = apiKeys.length > 0
    const isVerified = trackingState.label === 'Verified' || trackingState.label === 'Active'
    const isActive = trackingState.label === 'Active'

    const steps: Array<{ id: number; title: string; description: string; state: StepState; summary?: string }> = [
      {
        id: 0,
        title: 'Generate API Key',
        description: 'Create a credential that the WordPress plugin will use to authenticate events.',
        state: hasKey ? 'complete' : 'current',
        summary: hasKey ? `Active · ${apiKeys[0]?.key_prefix}…` : undefined,
      },
      {
        id: 1,
        title: 'Install WordPress Plugin',
        description: 'Download and activate the Woosaas plugin in your WordPress / WooCommerce store.',
        state: isVerified ? 'complete' : hasKey ? 'current' : 'upcoming',
        summary: isVerified ? 'Plugin installed and activated' : undefined,
      },
      {
        id: 2,
        title: 'Configure Plugin',
        description: 'Paste the API key and site URL into the plugin settings page.',
        state: isVerified ? 'complete' : hasKey ? 'current' : 'upcoming',
        summary: isVerified ? `Configured for ${site.domain}` : undefined,
      },
      {
        id: 3,
        title: 'Verify Live Data',
        description: 'Confirm events are arriving via Pipeline Health.',
        state: isActive ? 'complete' : isVerified ? 'current' : 'upcoming',
        summary: isActive ? 'Live data confirmed' : undefined,
      },
    ]

    return { steps, progress: steps.filter((s) => s.state === 'complete').length }
  }, [apiKeys, site])

  // Auto-expand current step
  useEffect(() => {
    if (steps.length > 0 && expandedStep === null) {
      const currentIdx = steps.findIndex((s) => s.state === 'current')
      setExpandedStep(currentIdx >= 0 ? currentIdx : null)
    }
  }, [steps, expandedStep])

  if (loading && !site) return <LoadingSpinner className="py-16" />
  if (!site) return <div className="card p-6"><p className="text-sm text-app-muted">{error || 'Site not found.'}</p></div>

  const primaryKey = apiKeys[0] ?? null
  const allDone = progress === steps.length && steps.length > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-app-strong">Setup</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-app-muted">
            <span>{site.name}</span>
            <span className="text-app-line">·</span>
            <span className="font-mono text-xs text-app-soft">{site.domain}</span>
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

      {/* All done banner */}
      {allDone && (
        <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Sparkles className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-emerald-800">Setup complete</div>
            <div className="mt-0.5 text-sm text-emerald-700">Your site is live and collecting data.</div>
          </div>
          <Link href={`/dashboard/${siteId}/overview`} className="btn-primary shrink-0 gap-1.5 text-sm">
            Open Analytics
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-app-subtle">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: steps.length > 0 ? `${(progress / steps.length) * 100}%` : '0%' }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-app-muted tabular-nums">
          {progress} / {steps.length}
        </span>
      </div>

      {/* Vertical stepper */}
      <div className="relative">
        {/* Connector line */}
        <div className="absolute left-[19px] top-5 bottom-5 w-px bg-app-line" />

        <div className="space-y-0">
          {steps.map((step, idx) => {
            const isComplete = step.state === 'complete'
            const isCurrent = step.state === 'current'
            const isUpcoming = step.state === 'upcoming'
            const isExpanded = expandedStep === idx
            const isLast = idx === steps.length - 1

            return (
              <div key={step.id} className={`relative flex gap-4 ${isLast ? '' : 'pb-1'}`}>
                {/* Step indicator */}
                <div className="relative z-10 mt-4 shrink-0">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all ${
                      isComplete
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : isCurrent
                          ? 'border-blue-500 bg-blue-500 text-white shadow-sm shadow-blue-200'
                          : 'border-app-line bg-white text-app-muted'
                    }`}
                  >
                    {isComplete ? <Check className="h-4 w-4" strokeWidth={3} /> : idx + 1}
                  </div>
                </div>

                {/* Step content */}
                <div className={`mb-3 min-w-0 flex-1 rounded-xl border transition-all ${
                  isCurrent
                    ? 'border-blue-200 bg-white shadow-sm'
                    : isComplete
                      ? 'border-app-line bg-white'
                      : 'border-app-line bg-app-panel opacity-60'
                }`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isUpcoming) setExpandedStep(isExpanded ? null : idx)
                    }}
                    disabled={isUpcoming}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${isUpcoming ? 'text-app-muted' : 'text-app-strong'}`}>
                          {step.title}
                        </span>
                        {isComplete && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <Check className="h-3 w-3" strokeWidth={3} />
                            Done
                          </span>
                        )}
                        {isCurrent && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            Now
                          </span>
                        )}
                      </div>
                      {!isExpanded && step.summary && (
                        <div className="mt-0.5 truncate text-xs text-app-muted">{step.summary}</div>
                      )}
                      {!isExpanded && !step.summary && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-app-muted">{step.description}</div>
                      )}
                    </div>
                    {!isUpcoming && (
                      isExpanded
                        ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
                        : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-app-line px-4 pb-4 pt-3">
                      <p className="mb-4 text-sm text-app-muted">{step.description}</p>

                      {/* Step 1 content */}
                      {idx === 0 && (
                        <div className="space-y-4">
                          {!primaryKey ? (
                            <button
                              type="button"
                              onClick={handleCreateKey}
                              disabled={creating}
                              className="btn-primary gap-2"
                            >
                              <KeyRound className="h-4 w-4" />
                              {creating ? 'Generating…' : 'Generate API Key'}
                            </button>
                          ) : (
                            <>
                              {/* Current key display */}
                              <div className="rounded-lg border border-app-line bg-slate-50 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-app-strong">API Key</div>
                                    <div className="mt-0.5 font-mono text-xs text-app-muted break-all">
                                      {showSecret && activeSecret ? activeSecret : `${primaryKey.key_prefix}…`}
                                    </div>
                                    <div className="mt-1 text-[11px] text-app-soft">
                                      Created {primaryKey.created_at ? new Date(primaryKey.created_at).toLocaleDateString() : '–'}
                                      {primaryKey.last_used_at ? ` · Used ${new Date(primaryKey.last_used_at).toLocaleDateString()}` : ' · Unused'}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {activeSecret && (
                                      <button
                                        type="button"
                                        onClick={() => setShowSecret((v) => !v)}
                                        className="btn-ghost px-2.5 py-1 text-xs"
                                      >
                                        {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(activeSecret || primaryKey.key_prefix)}
                                      className="btn-secondary px-2.5 py-1 text-xs"
                                    >
                                      {copiedValue === (activeSecret || primaryKey.key_prefix)
                                        ? <><Check className="h-3.5 w-3.5" /> Copied</>
                                        : <><Copy className="h-3.5 w-3.5" /> Copy</>
                                      }
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Regenerate */}
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={handleRegenerateKey}
                                  disabled={regenerating}
                                  className="btn-secondary gap-1.5 text-xs"
                                >
                                  <RotateCcw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                                  {regenerating ? 'Regenerating…' : 'Regenerate key'}
                                </button>
                                <span className="text-xs text-app-muted">Old key will stop working immediately</span>
                              </div>
                            </>
                          )}
                          {primaryKey && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                              <strong>Note:</strong> The full secret is shown only once after generation. Copy it now.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Step 2 content */}
                      {idx === 1 && (
                        <ol className="space-y-2.5 text-sm text-app-muted">
                          <li className="flex gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-subtle text-[11px] font-bold text-app-soft">1</span>
                            WordPress admin → <strong className="text-app-strong">Plugins → Add New → Upload Plugin</strong>
                          </li>
                          <li className="flex gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-subtle text-[11px] font-bold text-app-soft">2</span>
                            Upload <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-app-strong">woosaas.zip</code> → click <strong className="text-app-strong">Install Now</strong>
                          </li>
                          <li className="flex gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-subtle text-[11px] font-bold text-app-soft">3</span>
                            Click <strong className="text-app-strong">Activate Plugin</strong>
                          </li>
                        </ol>
                      )}

                      {/* Step 3 content */}
                      {idx === 2 && (
                        <div className="space-y-3">
                          <p className="text-sm text-app-muted">
                            In WordPress → <strong className="text-app-strong">WooSaaS → Settings</strong>, paste these values:
                          </p>
                          <CopyField
                            label="API Key"
                            value={
                              primaryKey
                                ? (showSecret && activeSecret ? activeSecret : `${primaryKey.key_prefix}…`)
                                : 'No key yet — complete step 1 first'
                            }
                            copyValue={primaryKey ? (activeSecret || primaryKey.key_prefix) : ''}
                            mono
                            masked={!activeSecret}
                            copiedValue={copiedValue}
                            onCopy={handleCopy}
                            extra={
                              activeSecret ? (
                                <button
                                  type="button"
                                  onClick={() => setShowSecret((v) => !v)}
                                  className="btn-ghost px-2 py-1 text-xs"
                                >
                                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              ) : null
                            }
                          />
                          <CopyField
                            label="Site URL"
                            value={site.domain}
                            copyValue={site.domain}
                            copiedValue={copiedValue}
                            onCopy={handleCopy}
                          />
                        </div>
                      )}

                      {/* Step 4 content */}
                      {idx === 3 && (
                        <div className="space-y-3">
                          <p className="text-sm text-app-muted">
                            Open Pipeline Health or Realtime to confirm events are arriving from your store.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/dashboard/${siteId}/health`} className="btn-primary gap-2 text-sm">
                              <HeartPulse className="h-4 w-4" />
                              Pipeline Health
                            </Link>
                            <Link href={`/dashboard/${siteId}/realtime`} className="btn-secondary gap-2 text-sm">
                              <Activity className="h-4 w-4" />
                              Realtime
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
}: {
  label: string
  value: string
  copyValue: string
  mono?: boolean
  masked?: boolean
  copiedValue: string | null
  onCopy: (v: string) => void
  extra?: React.ReactNode
}) {
  const copied = copiedValue === copyValue
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-app-soft">{label}</span>
      </div>
      <div className="flex items-center gap-0 overflow-hidden rounded-lg border border-app-line bg-white transition focus-within:ring-2 focus-within:ring-blue-500/20">
        <div className={`min-w-0 flex-1 truncate px-3.5 py-2.5 text-sm ${mono ? 'font-mono' : ''} ${masked ? 'text-app-muted' : 'text-app-strong'}`}>
          {value}
        </div>
        {extra && (
          <div className="flex shrink-0 items-center border-l border-app-line px-1">
            {extra}
          </div>
        )}
        <button
          type="button"
          onClick={() => onCopy(copyValue)}
          disabled={masked}
          className={`flex shrink-0 items-center gap-1.5 border-l border-app-line px-3.5 py-2.5 text-xs font-medium transition disabled:opacity-40
            ${copied
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-50 text-app-muted hover:bg-slate-100 hover:text-app-strong'
            }`}
        >
          {copied
            ? <><Check className="h-3.5 w-3.5" /> Copied</>
            : <><Copy className="h-3.5 w-3.5" /> Copy</>
          }
        </button>
      </div>
    </div>
  )
}
