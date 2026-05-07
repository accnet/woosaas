'use client'

import { useEffect, useState } from 'react'
import { Activity, ShoppingCart, Target, TrendingDown } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { useSiteId } from '@/hooks/use-site-id'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { FunnelStats } from '@/lib/types'

function FunnelBar({ label, count, rate, maxCount }: { label: string; count: number; rate: number; maxCount: number }) {
  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-app-muted">{label}</span>
        <span className="text-sm font-semibold text-app-strong">{count.toLocaleString()}</span>
      </div>
      <div className="relative h-10 rounded-lg bg-slate-100 overflow-hidden">

        <div
          className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium text-white drop-shadow-sm">{rate.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

export default function FunnelPage() {
  const siteId = useSiteId()
  const [funnel, setFunnel] = useState<FunnelStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.funnel(siteId, from, to)
        setFunnel(res.data)
      } catch (err) {
        console.error('Failed to load funnel data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  if (!funnel) {
    return (
      <div className="card p-12 text-center">
        <p className="text-app-muted">No funnel data available</p>
      </div>

    )
  }

  const steps = [
    { label: 'Pageviews', count: funnel.pageviews, rate: 100 },
    { label: 'Product Views', count: funnel.product_views, rate: funnel.product_view_rate },
    { label: 'Add to Carts', count: funnel.add_to_carts, rate: funnel.add_to_cart_rate },
    { label: 'Checkouts', count: funnel.checkouts, rate: funnel.checkout_rate },
    { label: 'Purchases', count: funnel.purchases, rate: funnel.purchase_rate },
  ]

  const maxCount = Math.max(...steps.map(s => s.count))
  const biggestDrop = steps.slice(1).reduce(
    (worst, step) => (step.rate < worst.rate ? step : worst),
    steps[1] ?? steps[0]
  )

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Conversion Funnel</h2>
          <p className="mt-2 text-sm text-app-muted">
            Step-by-step movement from traffic to purchase across the active date range.
          </p>
        </div>

        <select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value as PresetDateRange)}
          className="select"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Activity className="h-4 w-4" />} label="Entry Volume" value={funnel.pageviews.toLocaleString()} helper="Tracked pageviews at funnel start" />
        <MetricCard icon={<ShoppingCart className="h-4 w-4" />} label="Purchases" value={funnel.purchases.toLocaleString()} helper="Completed orders in range" />
        <MetricCard icon={<Target className="h-4 w-4" />} label="Purchase Rate" value={`${funnel.purchase_rate.toFixed(1)}%`} helper="Share of traffic reaching purchase" />
        <MetricCard icon={<TrendingDown className="h-4 w-4" />} label="Largest Drop" value={biggestDrop?.label || '-'} helper={biggestDrop ? `${biggestDrop.rate.toFixed(1)}% retained` : 'No drop-off detected'} valueClassName="text-2xl truncate" />
      </div>

      <SectionCard title="Stage Performance" description="Compare absolute counts and retained share at each step.">
        <div className="space-y-6">
          {steps.map((step, i) => (
            <FunnelBar
              key={i}
              label={step.label}
              count={step.count}
              rate={step.rate}
              maxCount={maxCount}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
