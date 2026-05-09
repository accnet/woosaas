'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingDown,
} from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { useSiteId } from '@/hooks/use-site-id'
import axios from 'axios'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { FunnelStats } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

function FunnelBar({
  label,
  count,
  retainedFromPrevious,
  retainedFromEntry,
  maxCount,
}: {
  label: string
  count: number
  retainedFromPrevious: number
  retainedFromEntry: number
  maxCount: number
}) {
  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0
  const dropOff = 100 - retainedFromPrevious

  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50/50 last:border-0">
      <div className="w-28 shrink-0 text-xs font-medium text-app-muted sm:w-32">{label}</div>
      <div className="h-5 flex-1 overflow-hidden rounded-sm bg-app-subtle">
        <div
          className="h-full rounded-sm bg-indigo-500/70 transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-app-strong">{count.toLocaleString()}</div>
      <div className={`w-16 shrink-0 text-right text-xs tabular-nums ${dropOff > 40 && label !== 'Pageviews' ? 'font-medium text-red-600' : 'text-app-muted'}`}>
        {retainedFromPrevious.toFixed(0)}%
      </div>
    </div>
  )
}

function getBottleneckNarrative(label: string) {
  switch (label) {
    case 'Product Views':
      return 'Traffic is landing, but fewer visitors are reaching product detail pages. Review landing-page relevance and merchandising links.'
    case 'Add to Carts':
      return 'Interest exists, but product detail pages are not converting intent into cart actions. Revisit product clarity, pricing, and trust cues.'
    case 'Checkouts':
      return 'Cart intent is strong, but checkout starts are falling off. Inspect cart UX, shipping thresholds, and checkout entry points.'
    case 'Purchases':
      return 'Checkout starts are healthy, yet completion is leaking. Payment, form friction, or unexpected costs are likely worth a closer look.'
    default:
      return 'Funnel retention is relatively balanced across steps in the selected range.'
  }
}

export default function FunnelPage() {
  const siteId = useSiteId()
  const [funnel, setFunnel] = useState<FunnelStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (!funnel) setLoading(true)
      else setRefreshing(true)

      setError(null)

      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.funnel(siteId, from, to, { signal: controller.signal })
        setFunnel(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        setError(getApiErrorMessage(err, 'Funnel analytics could not be loaded right now.'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()
    return () => controller.abort()
  }, [dateRange, reloadKey, siteId])

  const steps = useMemo(() => {
    if (!funnel) {
      return []
    }

    const base = funnel.pageviews || 1

    return [
      {
        label: 'Pageviews',
        count: funnel.pageviews,
        retainedFromPrevious: 100,
        retainedFromEntry: 100,
      },
      {
        label: 'Product Views',
        count: funnel.product_views,
        retainedFromPrevious: funnel.product_view_rate,
        retainedFromEntry: (funnel.product_views / base) * 100,
      },
      {
        label: 'Add to Carts',
        count: funnel.add_to_carts,
        retainedFromPrevious: funnel.add_to_cart_rate,
        retainedFromEntry: (funnel.add_to_carts / base) * 100,
      },
      {
        label: 'Checkouts',
        count: funnel.checkouts,
        retainedFromPrevious: funnel.checkout_rate,
        retainedFromEntry: (funnel.checkouts / base) * 100,
      },
      {
        label: 'Purchases',
        count: funnel.purchases,
        retainedFromPrevious: funnel.purchase_rate,
        retainedFromEntry: (funnel.purchases / base) * 100,
      },
    ]
  }, [funnel])

  const funnelSummary = useMemo(() => {
    const nonEntrySteps = steps.slice(1)
    const weakestStep =
      nonEntrySteps.reduce<(typeof nonEntrySteps)[number] | null>((lowest, step) => {
        if (!lowest || step.retainedFromPrevious < lowest.retainedFromPrevious) {
          return step
        }
        return lowest
      }, null) ?? null

    const maxCount = Math.max(...steps.map((step) => step.count), 0)
    const purchaseRetention = steps[steps.length - 1]?.retainedFromEntry ?? 0

    return { weakestStep, maxCount, purchaseRetention }
  }, [steps])

  if (loading && !funnel) {
    return <LoadingSpinner className="py-16" />
  }

  if (!funnel) {
    return (
      <InlineErrorState
        body={error || 'No funnel data is available for this site yet.'}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  const isEmpty = steps.every((step) => step.count === 0)

  return (
    <AnalyticsPage>

      <AnalyticsPageHeader
        title="Conversion Funnel"
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <DateRangeSelect
              value={dateRange}
              onChange={(value) => setDateRange(value as PresetDateRange)}
              options={DATE_RANGE_OPTIONS}
            />
          </>
        }
      />

      <AnalyticsPageContent>
        {error ? (
          <InlineErrorState
            body={error}
            compact
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <MetricGrid mobileCols={1}>
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Entry Volume"
          value={funnel.pageviews.toLocaleString()}
          helper="Tracked pageviews at funnel start"
        />
        <MetricCard
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Purchases"
          value={funnel.purchases.toLocaleString()}
          helper="Completed orders in range"
        />
        <MetricCard
          icon={<Target className="h-4 w-4" />}
          label="End-to-End Rate"
          value={`${funnelSummary.purchaseRetention.toFixed(1)}%`}
          helper="Share of entry traffic reaching purchase"
        />
        <MetricCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Weakest Step"
          value={funnelSummary.weakestStep?.label || '-'}
          helper={
            funnelSummary.weakestStep
              ? `${funnelSummary.weakestStep.retainedFromPrevious.toFixed(1)}% retained from previous step`
              : 'No drop-off detected'
          }
          valueClassName="truncate text-2xl"
        />
        </MetricGrid>

        {isEmpty ? (
          <SectionCard
            title="Stage Performance"
          >
            <EmptyState
              icon={<ShoppingCart className="h-12 w-12" />}
              title="No funnel data yet"
              body="Collect product, cart, checkout, and purchase events to unlock funnel analysis for this site."
            />
          </SectionCard>
        ) : (
          <>
            <SectionCard
              title="Stage Performance"
              className="px-0 py-0 overflow-hidden"
              action={
                <button
                  type="button"
                  className="btn-secondary gap-2"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
                  Refresh
                </button>
              }
            >
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-app-soft">
                <div className="w-28 sm:w-32">Stage</div>
                <div className="flex-1">Progress</div>
                <div className="w-20 text-right">Count</div>
                <div className="w-16 text-right">Rate</div>
              </div>
              <div className="divide-y divide-slate-50">
                {steps.map((step) => (
                  <FunnelBar
                    key={step.label}
                    label={step.label}
                    count={step.count}
                    retainedFromPrevious={step.retainedFromPrevious}
                    retainedFromEntry={step.retainedFromEntry}
                    maxCount={funnelSummary.maxCount}
                  />
                ))}
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <SectionCard
                title="Step Totals"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {steps.map((step) => (
                    <div key={step.label} className="rounded-lg border border-app-line bg-white p-4">
                      <div className="text-sm font-medium text-app-muted">{step.label}</div>
                      <div className="mt-2 text-2xl font-semibold text-app-strong">
                        {step.count.toLocaleString()}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-app-muted">
                        <ArrowDown className="h-3.5 w-3.5" />
                        {step.retainedFromPrevious.toFixed(1)}% from previous step
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Bottleneck Analysis"
              >
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-amber-800">Primary bottleneck</div>
                      <StatusChip
                        label={funnelSummary.weakestStep?.label || 'None'}
                        tone={funnelSummary.weakestStep ? 'warn' : 'good'}
                      />
                    </div>
                    <p className="mt-2 text-sm text-amber-700">
                      {getBottleneckNarrative(funnelSummary.weakestStep?.label || '')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-app-line bg-app-panel p-4">
                    <div className="text-sm font-semibold text-app-strong">Purchase completion</div>
                    <p className="mt-2 text-sm text-app-muted">
                      {funnel.purchase_rate.toFixed(1)}% of checkout starts become purchases in the selected
                      period.
                    </p>
                  </div>
                  <div className="rounded-lg border border-app-line bg-app-panel p-4">
                    <div className="text-sm font-semibold text-app-strong">Overall throughput</div>
                    <p className="mt-2 text-sm text-app-muted">
                      {funnelSummary.purchaseRetention.toFixed(1)}% of entry pageviews make it all the way to
                      purchase.
                    </p>
                  </div>
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
