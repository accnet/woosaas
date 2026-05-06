'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { sitesApi, statsApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { LineChart } from '@/components/ui/charts'
import { useSiteId } from '@/hooks/use-site-id'
import { getDataFreshnessState } from '@/lib/data-freshness'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import type { OverviewStats, Site, TrendPoint } from '@/lib/types'

export default function OverviewPage() {
  const siteId = useSiteId()

  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('7d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [siteRes, overviewRes, trendRes] = await Promise.all([
          sitesApi.get(siteId),
          statsApi.overview(siteId, from, to),
          statsApi.trend(siteId, from, to, 'day'),
        ])
        setSite(siteRes.data)
        setOverview(overviewRes.data)
        setTrend(trendRes.data)
      } catch (err) {
        console.error('Failed to load stats', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId, dateRange])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  const pagesPerSession =
    overview && overview.sessions > 0
      ? (overview.pageviews / overview.sessions).toFixed(2)
      : '0.00'
  const freshness = getDataFreshnessState(site?.tracking_last_event_at ?? null)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Analytics Overview</h1>
        <select 
          value={dateRange} 
          onChange={(e) => setDateRange(e.target.value as PresetDateRange)}
          className="border rounded px-3 py-2"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card title="Pageviews" value={overview?.pageviews?.toLocaleString() || '0'} />
        <Card title="Sessions" value={overview?.sessions?.toLocaleString() || '0'} />
        <Card title="Revenue" value={`$${(overview?.revenue || 0).toFixed(2)}`} />
        <Card title="Conversion Rate" value={`${(overview?.conversion_rate || 0).toFixed(2)}%`} />
        <Card title="Data Freshness" value={freshness.label} change={freshness.detail} changeType={freshness.changeType} />
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-4">Traffic Trend</h2>
        {trend.length > 0 ? (
          <LineChart data={trend} dataKey="pageviews" />
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No data available
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-4">Ecommerce Stats</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Product Views</span>
              <span className="font-semibold">{overview?.product_views?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Add to Cart</span>
              <span className="font-semibold">{overview?.add_to_carts?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Checkouts</span>
              <span className="font-semibold">{overview?.checkouts?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Purchases</span>
              <span className="font-semibold">{overview?.purchases?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Average Order Value</span>
              <span className="font-semibold">${(overview?.aov || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-4">Users</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Unique Users</span>
              <span className="font-semibold">{overview?.users?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Sessions</span>
              <span className="font-semibold">{overview?.sessions?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Pages / Session</span>
              <span className="font-semibold">{pagesPerSession}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
