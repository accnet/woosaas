'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { sitesApi } from '@/lib/api'
import { getDataFreshnessState } from '@/lib/data-freshness'
import type { TrackingCodeResponse } from '@/lib/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const DEBUG_EVENTS = ['pageview', 'product_view', 'add_to_cart', 'checkout_start', 'purchase'] as const
type DebugEventName = (typeof DEBUG_EVENTS)[number]

export default function SiteOnboardingPage() {
  const siteId = useSiteId()
  const [data, setData] = useState<TrackingCodeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [sendingDebugEvent, setSendingDebugEvent] = useState(false)
  const [debugEventName, setDebugEventName] = useState<DebugEventName>('pageview')
  const [statusMessage, setStatusMessage] = useState('')

  const loadData = async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const response = await sitesApi.getTrackingCode(siteId)
      setData(response.data)
    } catch (error) {
      console.error('Failed to load onboarding data', error)
      setStatusMessage('Failed to refresh onboarding data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [siteId])

  const readiness = useMemo(() => {
    const verification = data?.verification
    const hasKey = (data?.api_keys.length ?? 0) > 0
    const hasVerifiedCheck = Boolean(verification?.last_checked_at)
    const hasEvent = Boolean(verification?.last_event_at)

    if (hasEvent) {
      return {
        label: 'Tracking active',
        description: 'The site has already sent at least one event through the collect pipeline.',
      }
    }

    if (hasVerifiedCheck) {
      return {
        label: 'Verified, waiting for events',
        description: 'The plugin key has been verified. The next step is browsing the storefront or sending a debug event.',
      }
    }

    if (hasKey) {
      return {
        label: 'Key ready',
        description: 'Create the plugin connection in WordPress and run the verify action to bind the site.',
      }
    }

    return {
      label: 'Setup required',
      description: 'Create an API key first, then connect the WordPress plugin to this site.',
    }
  }, [data])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 p-6">
        <Link href="/dashboard/sites" className="text-sm text-blue-500 hover:text-blue-700">
          Back to Sites
        </Link>
        <div className="rounded-lg bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Setup Guide</h1>
          <p className="mt-2 text-gray-600">Unable to load onboarding details for this site.</p>
        </div>
      </div>
    )
  }

  const verification = data.verification
  const recentKey = data.api_keys[0] ?? null
  const freshness = getDataFreshnessState(verification?.last_event_at ?? null)

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/sites" className="text-blue-500 hover:text-blue-700">
            Back to Sites
          </Link>
          <Link href={`/dashboard/sites/${siteId}/team`} className="text-blue-500 hover:text-blue-700">
            Team
          </Link>
          <Link href={`/dashboard/sites/${siteId}/api-keys`} className="text-blue-500 hover:text-blue-700">
            Manage API Keys
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-bold">Setup Guide</h1>
        <p className="text-gray-600">
          {data.site.name} · {data.site.domain}
        </p>
        {statusMessage ? (
          <p className="mt-2 text-sm text-gray-500">{statusMessage}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Status" value={readiness.label} change={readiness.description} />
        <Card title="Data Freshness" value={freshness.label} change={freshness.detail} changeType={freshness.changeType} />
        <Card title="API Keys" value={data.api_keys.length.toLocaleString()} />
        <Card
          title="Last Verify"
          value={formatTimestamp(verification?.last_checked_at)}
          change={verification?.status ? `Verification state: ${verification.status}` : 'Waiting for first verification'}
        />
        <Card
          title="Last Event"
          value={formatTimestamp(verification?.last_event_at)}
          change={recentKey?.last_used_at ? `Latest API key use: ${formatTimestamp(recentKey.last_used_at)}` : 'No API key usage recorded yet'}
        />
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">Connection Values</h2>
            <p className="text-gray-600">Use these values inside WordPress under WooCommerce → Woosaas.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData(false)}
            disabled={refreshing}
            className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CopyField
            label="API URL"
            value={API_URL}
            fieldName="api-url"
            copiedField={copiedField}
            onCopy={setCopiedField}
          />
          <CopyField
            label="Site Domain"
            value={data.site.domain}
            fieldName="site-domain"
            copiedField={copiedField}
            onCopy={setCopiedField}
          />
          <CopyField
            label="API Key Hint"
            value={data.instructions.config.api_key || 'Create an API key to continue'}
            fieldName="api-key-hint"
            copiedField={copiedField}
            onCopy={setCopiedField}
          />
          <CopyField
            label="Plugin Method"
            value={data.instructions.method}
            fieldName="plugin-method"
            copiedField={copiedField}
            onCopy={setCopiedField}
          />
        </div>

        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          API keys are only shown in full when created. If you no longer have the real key value, generate a new one from the API Keys page and paste it into WordPress immediately.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-bold">Launch Checklist</h2>
          <ol className="mt-4 space-y-4 text-sm text-gray-700">
            <li className="flex gap-3">
              <StepState done={data.api_keys.length > 0} />
              <div>
                <div className="font-medium text-gray-900">Generate an API key</div>
                <div>Create a site key for the plugin and keep the full key value available while configuring WordPress.</div>
              </div>
            </li>
            <li className="flex gap-3">
              <StepState done={Boolean(verification?.last_checked_at)} />
              <div>
                <div className="font-medium text-gray-900">Verify plugin access</div>
                <div>Paste the API URL and API key into the plugin settings, then click the plugin verify action until it returns the linked site ID.</div>
              </div>
            </li>
            <li className="flex gap-3">
              <StepState done={Boolean(verification?.last_event_at)} />
              <div>
                <div className="font-medium text-gray-900">Send live or debug traffic</div>
                <div>Browse the storefront, view a product, or use the plugin debug screen to push a controlled test event into ingestion.</div>
              </div>
            </li>
            <li className="flex gap-3">
              <StepState done={Boolean(verification?.last_event_at)} />
              <div>
                <div className="font-medium text-gray-900">Confirm reports</div>
                <div>After the worker flushes data into ClickHouse, check overview, sources, funnel, realtime, and bots in the dashboard.</div>
              </div>
            </li>
          </ol>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-bold">Dashboard Debug Event</h2>
            <p className="mt-2 text-sm text-gray-600">
              Send a controlled event through the backend ingest path, then refresh the status cards to confirm the worker and ClickHouse flow are healthy.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <select
                value={debugEventName}
                onChange={(event) => setDebugEventName(event.target.value as DebugEventName)}
                className="rounded border px-3 py-2"
              >
                {DEBUG_EVENTS.map((eventName) => (
                  <option key={eventName} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={sendingDebugEvent}
                onClick={async () => {
                  setSendingDebugEvent(true)
                  try {
                    await sitesApi.sendDebugEvent(siteId, debugEventName)
                    setStatusMessage(`Sent debug event: ${debugEventName}`)
                    await loadData(false)
                  } catch (error) {
                    console.error('Failed to send debug event', error)
                    setStatusMessage(`Failed to send debug event: ${debugEventName}`)
                  } finally {
                    setSendingDebugEvent(false)
                  }
                }}
                className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {sendingDebugEvent ? 'Sending...' : 'Send Debug Event'}
              </button>
            </div>
          </section>

          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-bold">Helpful Links</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Link href={`/dashboard/sites/${siteId}/api-keys`} className="block text-blue-500 hover:text-blue-700">
                Open API Keys
              </Link>
              <Link href={`/dashboard/sites/${siteId}/team`} className="block text-blue-500 hover:text-blue-700">
                Open Team Settings
              </Link>
              <Link href={`/dashboard/${siteId}/overview`} className="block text-blue-500 hover:text-blue-700">
                Open Analytics Overview
              </Link>
              <a href={data.instructions.plugin_url} target="_blank" rel="noreferrer" className="block text-blue-500 hover:text-blue-700">
                Plugin Reference
              </a>
            </div>
          </section>

          <section className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-bold">Tracking Health</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600">Verification status</dt>
                <dd className="font-medium text-gray-900">{verification?.status || 'pending'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600">Data freshness</dt>
                <dd className="font-medium text-gray-900">{freshness.label}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600">Last verified</dt>
                <dd className="font-medium text-gray-900">{formatTimestamp(verification?.last_checked_at)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600">Last event seen</dt>
                <dd className="font-medium text-gray-900">{formatTimestamp(verification?.last_event_at)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600">Most recent key use</dt>
                <dd className="font-medium text-gray-900">{formatTimestamp(recentKey?.last_used_at)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}

function StepState({ done }: { done: boolean }) {
  return (
    <span
      className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold ${
        done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {done ? '✓' : '•'}
    </span>
  )
}

function CopyField({
  label,
  value,
  fieldName,
  copiedField,
  onCopy,
}: {
  label: string
  value: string
  fieldName: string
  copiedField: string
  onCopy: (field: string) => void
}) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      onCopy(fieldName)
      window.setTimeout(() => onCopy(''), 1200)
    } catch (error) {
      console.error('Failed to copy field', error)
    }
  }

  return (
    <div className="rounded border p-4">
      <div className="mb-2 text-sm font-medium text-gray-700">{label}</div>
      <div className="flex gap-3">
        <input
          readOnly
          value={value}
          className="min-w-0 flex-1 rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          {copiedField === fieldName ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Not yet'
  }

  return new Date(value).toLocaleString()
}
