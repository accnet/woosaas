'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, KeyRound, Settings2, ShieldCheck } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { DetailNote } from '@/components/ui/detail-note'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { sitesApi } from '@/lib/api'
import type { Site } from '@/lib/types'

const STEPS = [
  {
    icon: 'key',
    title: 'Get API Key',
    description: 'Generate an API key for your site that the WooCommerce plugin uses.',
  },
  {
    icon: 'download',
    title: 'Install Plugin',
    description: 'Download and install the Woosaas plugin for WooCommerce.',
  },
  {
    icon: 'settings',
    title: 'Configure Plugin',
    description: 'Enter your API key in the plugin settings and activate the tracking features.',
  },
  {
    icon: 'check',
    title: 'Verify Setup',
    description: 'Confirm that data is flowing properly by verifying the connection.',
  },
]

function StepIcon({ icon, completed, current }: { icon: string; completed: boolean; current: boolean }) {
  const className = "w-5 h-5"

  if (completed) {
    return (
      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
        <svg className={`${className} text-emerald-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    )
  }

  if (current) {
    return (
      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
        <svg className={`${className} animate-spin text-primary-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-10 h-10 rounded-full bg-surface-100 flex items-center justify-center">
      <svg className={`${className} text-surface-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {icon === 'key' && (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        )}
        {icon === 'download' && (
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        )}
        {icon === 'settings' && (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        )}
        {icon === 'check' && (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        )}
      </svg>
    </div>
  )
}

export default function OnboardingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [site, setSite] = useState<Site | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [siteRes, keyRes] = await Promise.all([
          sitesApi.get(siteId),
          sitesApi.getApiKeys(siteId),
        ])
        setSite(siteRes.data)

        const keys = keyRes.data
        if (keys.length > 0) {
          setApiKey(keys[0].key_prefix)
        }
      } catch (err) {
        console.error('Failed to load onboarding data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  if (!site) {
    return (
      <div className="card"><EmptyState body="Site not found" /></div>
    )
  }

  const completedSteps = apiKey ? 1 : 0
  const setupCompletion = `${completedSteps}/${STEPS.length}`

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Setup Guide</h2>
          <p className="mt-2 text-sm text-app-muted">
            Bring <span className="font-medium text-app-strong">{site.name}</span> online and validate that tracking is flowing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Progress" value={setupCompletion} helper="Core onboarding milestones" valueClassName="text-2xl" />
        <MetricCard icon={<KeyRound className="h-4 w-4" />} label="API Key" value={apiKey ? 'Issued' : 'Missing'} helper="Required before plugin configuration" valueClassName="text-2xl" />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Target Domain" value={site.domain} helper="WordPress store expected to send events" valueClassName="text-2xl truncate" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Checklist" description="Run these steps in order to activate store tracking." icon={<Settings2 className="h-4 w-4" />}>
          <div className="space-y-8">
        {STEPS.map((step, index) => {
          const completed = index === 0 ? !!apiKey : false
          const current = index === 0 && !apiKey

          return (
            <div key={index} className="flex gap-4">
              <div className="flex flex-col items-center">
                <StepIcon icon={step.icon} completed={completed} current={current} />
                {index < STEPS.length - 1 && (
                  <div className={`w-0.5 h-full min-h-[2rem] ${completed ? 'bg-emerald-200' : 'bg-surface-200'}`} />
                )}
              </div>
              <div className="flex-1 pb-8">
                <h3 className="mb-1 text-base font-semibold text-app-strong">{step.title}</h3>
                <p className="mb-4 text-sm text-app-muted">{step.description}</p>

                {index === 0 && (
                  <div className="space-y-3">
                    {apiKey ? (
                      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                        <div>
                          <p className="text-sm font-medium text-emerald-700">API Key Generated</p>
                          <code className="text-xs text-emerald-600 font-mono">{apiKey.slice(0, 16)}...</code>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <Link
                          href={`/dashboard/sites/${siteId}/api-keys`}
                          className="btn-primary text-sm"
                        >
                          Generate API Key
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {index === 2 && apiKey && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-medium text-app-strong">Plugin Configuration</p>
                    <ol className="ml-5 list-decimal space-y-1 text-sm text-app-muted">
                      <li>Install the Woosaas plugin on your WordPress site</li>
                      <li>Go to WooCommerce → Settings → Woosaas</li>
                      <li>Enter your API key: <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono">{apiKey.slice(0, 16)}...</code></li>
                      <li>Enter your site domain: <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono">{site.domain}</code></li>
                      <li>Save settings and verify the connection</li>
                    </ol>
                  </div>
                )}

                {index === 3 && (
                  <Link
                    href={`/dashboard/${siteId}/health`}
                    className="btn-primary text-sm"
                  >
                    Verify Connection
                  </Link>
                )}
              </div>
            </div>
          )
        })}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Operator Notes" description="Current prerequisites for plugin activation." icon={<Download className="h-4 w-4" />}>
            <div className="space-y-3">
              <DetailNote
                icon={<ArrowRight className="h-4 w-4" />}
                title="Plugin location"
                body="WordPress plugin is managed outside this repo at /var/www/site1.local/wp-content/plugins/plugin."
              />
              <DetailNote
                icon={<ArrowRight className="h-4 w-4" />}
                title="Credential state"
                body={apiKey ? 'A key is available and ready to be entered in WooCommerce settings.' : 'No key is present yet. Generate one before continuing.'}
                tone={apiKey ? 'good' : 'warn'}
              />
              <DetailNote
                icon={<ArrowRight className="h-4 w-4" />}
                title="Verification"
                body="Use the Health page after setup to confirm the first events are reaching the pipeline."
              />
            </div>
          </SectionCard>

          <div className="card px-6 py-6">
            <h3 className="text-base font-semibold text-app-strong">Next Actions</h3>
            <div className="mt-4 space-y-3">
              <Link href={`/dashboard/sites/${siteId}/api-keys`} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm text-app-strong transition hover:border-slate-300 hover:bg-slate-50">
                <span>Manage API keys</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={`/dashboard/${siteId}/health`} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm text-app-strong transition hover:border-slate-300 hover:bg-slate-50">
                <span>Open health checks</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
