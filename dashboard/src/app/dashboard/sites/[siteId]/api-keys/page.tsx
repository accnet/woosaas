'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell, TableRowActionZone } from '@/components/ui/table-primitives'
import { TableSection } from '@/components/ui/table-section'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import type { APIKey, APIKeyResponse } from '@/lib/types'

export default function ApiKeysPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [keys, setKeys] = useState<APIKey[]>([])
  const [createdSecrets, setCreatedSecrets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showKey, setShowKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadKeys = async () => {
      if (keys.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const res = await sitesApi.getApiKeys(siteId)
        if (!cancelled) {
          setKeys(res.data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'API keys could not be loaded right now.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadKeys()

    return () => {
      cancelled = true
    }
  }, [keys.length, reloadKey, siteId])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)

    try {
      const res = await sitesApi.createApiKey(siteId, `Key ${keys.length + 1}`)
      const newKey = res.data as APIKeyResponse
      setCreatedSecrets((previous) => ({ ...previous, [newKey.id]: newKey.key }))
      setShowKey(newKey.id)
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create an API key.'))
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(value)
    window.setTimeout(() => setCopiedKey(null), 2000)
  }

  const summary = useMemo(() => {
    const activeKeys = keys.length
    const recentlyUsed = keys.filter((key) => !!key.last_used_at).length
    const newlyCreated = keys.filter((key) => createdSecrets[key.id]).length
    return { activeKeys, recentlyUsed, newlyCreated }
  }, [createdSecrets, keys])

  const recentCreatedKeys = useMemo(
    () => keys.filter((key) => createdSecrets[key.id]).slice(0, 3),
    [createdSecrets, keys]
  )

  if (loading && keys.length === 0) {
    return <TableLoadingSkeleton rows={4} columns={4} />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="API Keys"
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="btn-secondary gap-2">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
            <button type="button" onClick={handleCreate} disabled={creating} className="btn-primary gap-2">
              <Plus className="h-4 w-4" />
              {creating ? 'Creating...' : 'Generate Key'}
            </button>
          </>
        }
      />

      {error ? (
        <InlineErrorState
          body={error}
          compact={keys.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <MetricCard icon={<KeyRound className="h-4 w-4" />} label="Active Keys" value={summary.activeKeys.toString()} helper="Issued credentials for this site" />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Recently Used" value={summary.recentlyUsed.toString()} helper="Keys with recorded usage" tone={summary.recentlyUsed > 0 ? 'good' : 'neutral'} />
        <MetricCard icon={<Eye className="h-4 w-4" />} label="Visible Secrets" value={summary.newlyCreated.toString()} helper="Full secret is shown only once after creation" />
      </div>

      <SectionCard title="One-Time Secret Rule" description="The full secret is only available immediately after creation. Keep this note close to the inventory.">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Full secrets cannot be recovered later from the API key list. If a secret is lost, issue a new key and rotate the plugin or integration to use it.
        </div>
      </SectionCard>

      {keys.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<KeyRound className="h-10 w-10" />}
            title="No API keys issued"
            body="Generate the first credential before connecting the WordPress plugin or any downstream service."
          />
        </div>
      ) : (
        <>
          <TableSection
            title="Active Keys"
            action={<StatusChip label={`${keys.length} active`} tone="neutral" />}
          >
            <table className="min-w-full">
              <thead className="table-header">
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Prefix / Secret</TableHeaderCell>
                  <TableHeaderCell>Last Used</TableHeaderCell>
                  <TableHeaderCell align="right">Actions</TableHeaderCell>
                </tr>
              </thead>
              <tbody className="table-body">
                {keys.map((key) => {
                  const secret = createdSecrets[key.id]
                  const isVisible = showKey === key.id

                  return (
                    <tr key={key.id} className="table-row">
                      <td className="table-cell">
                        <div className="font-medium text-app-strong">{key.name}</div>
                        <div className="mt-1 text-xs text-app-muted">
                          Created {key.created_at ? new Date(key.created_at).toLocaleString() : '-'}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-2">
                          <StatusChip label={key.status || 'active'} tone="good" />
                          <StatusChip label={key.last_used_at ? 'Used' : 'Unused'} tone={key.last_used_at ? 'info' : 'neutral'} />
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="font-mono text-sm text-app-strong break-all">
                          {isVisible ? secret || `${key.key_prefix}...` : `${key.key_prefix}...`}
                        </div>
                        <div className="mt-1 text-xs text-app-muted">
                          {secret ? 'Full secret available in this session only.' : 'Prefix only after the first reveal window expires.'}
                        </div>
                      </td>
                      <td className="table-cell">
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Not yet used'}
                      </td>
                      <td className="table-cell">
                        <TableRowActionZone>
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
                            {copiedKey === (secret || key.key_prefix) ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </>
                            )}
                          </button>
                        </TableRowActionZone>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableSection>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title="Recently Created"
              action={<StatusChip label={`${recentCreatedKeys.length} visible`} tone="good" />}
            >
              {recentCreatedKeys.length > 0 ? (
                <div className="space-y-3">
                  {recentCreatedKeys.map((key) => (
                    <div key={key.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-emerald-800">{key.name}</div>
                          <div className="mt-1 font-mono text-xs text-emerald-700 break-all">
                            {createdSecrets[key.id]}
                          </div>
                        </div>
                        <StatusChip label="Visible once" tone="good" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState body="Newly created keys with visible secrets will appear here during the current session." />
              )}
            </SectionCard>

            <SectionCard title="Usage State" description="Quick operator read on whether issued keys have started being consumed.">
              <div className="space-y-3">
                <div className="rounded-lg border border-app-line bg-app-panel px-4 py-4">
                  <div className="text-sm font-semibold text-app-strong">Used keys</div>
                  <p className="mt-2 text-sm text-app-muted">
                    {summary.recentlyUsed} of {summary.activeKeys} active keys have recorded usage.
                  </p>
                </div>
                <div className="rounded-lg border border-app-line bg-app-panel px-4 py-4">
                  <div className="text-sm font-semibold text-app-strong">Unused keys</div>
                  <p className="mt-2 text-sm text-app-muted">
                    {summary.activeKeys - summary.recentlyUsed} keys are still waiting to be configured in a plugin or integration.
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
