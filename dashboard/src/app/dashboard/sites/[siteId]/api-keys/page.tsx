'use client'

import { use, useEffect, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Plus, ShieldCheck } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { sitesApi } from '@/lib/api'
import type { APIKey, APIKeyResponse } from '@/lib/types'

export default function ApiKeysPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [keys, setKeys] = useState<APIKey[]>([])
  const [createdSecrets, setCreatedSecrets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showKey, setShowKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loadKeys = async () => {
    setLoading(true)
    try {
      const res = await sitesApi.getApiKeys(siteId)
      setKeys(res.data)
    } catch (err) {
      console.error('Failed to load API keys', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await sitesApi.createApiKey(siteId, 'Default')
      const newKey = res.data as APIKeyResponse
      setCreatedSecrets((prev) => ({ ...prev, [newKey.id]: newKey.key }))
      setKeys(prev => [...prev, newKey])
      setShowKey(res.data.id)
      await loadKeys()
    } catch (err) {
      console.error('Failed to create API key', err)
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  useEffect(() => {
    void loadKeys()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const activeKeys = keys.length
  const recentlyUsed = keys.filter((key) => !!key.last_used_at).length
  const visibleSecret = showKey ? createdSecrets[showKey] : null

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">API Keys</h2>
          <p className="mt-2 text-sm text-app-muted">
            Credential inventory for the WooCommerce plugin and service integrations.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary"
        >
          {creating ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Generate Key
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<KeyRound className="h-4 w-4" />}
          label="Active Keys"
          value={activeKeys.toString()}
          helper="Issued credentials for this site"
        />
        <MetricCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Recently Used"
          value={recentlyUsed.toString()}
          helper="Keys with recorded activity"
        />
        <MetricCard
          icon={<Copy className="h-4 w-4" />}
          label="Visible Secret"
          value={visibleSecret ? '1 open' : 'Hidden'}
          helper="Full secret is only available immediately after creation"
        />
      </div>

      {keys.length === 0 ? (
        <div className="card">
          <EmptyState icon={<KeyRound className="h-8 w-8 text-app-strong" />} title="No API keys issued" body="Generate a credential before connecting the plugin." />
        </div>
      ) : (
        <div className="space-y-4">
          {keys.map((key) => (
            <div key={key.id} className="card px-6 py-5">
              {(() => {
                const secret = createdSecrets[key.id]
                const canRevealSecret = !!secret

                return (
                  <>
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-app-subtle text-app-strong">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-medium text-app-strong">{key.name}</span>
                    <p className="text-xs text-app-muted">
                      Created {key.created_at ? new Date(key.created_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                    className="btn-ghost text-xs px-2.5 py-1"
                  >
                    <span className="flex items-center gap-1.5">
                      {showKey === key.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {showKey === key.id ? 'Hide' : canRevealSecret ? 'Show' : 'Preview'}
                    </span>
                  </button>
                  <button
                    onClick={() => handleCopy(secret || key.key_prefix)}
                    className="btn-primary text-xs px-2.5 py-1"
                  >
                    {copiedKey === (secret || key.key_prefix) ? (
                      <span className="flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />
                        Copied!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {showKey === key.id && (
                <div className="animate-slide-up rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-app-strong break-all">
                  {secret || `${key.key_prefix}...`}
                </div>
              )}

              {!canRevealSecret && (
                <p className="mt-3 text-xs text-amber-700">
                  Full API key is only shown once when created. Generate a new key if you need the full secret again.
                </p>
              )}

              {key.last_used_at && (
                <p className="mt-3 text-xs text-app-muted">
                  Last used: {new Date(key.last_used_at).toLocaleString()}
                </p>
              )}
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
