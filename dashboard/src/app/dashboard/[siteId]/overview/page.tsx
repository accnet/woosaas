'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { statsApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { LineChart } from '@/components/ui/charts'

export default function OverviewPage() {
  const params = useParams()
  const siteId = params.siteId as string
  
  const [overview, setOverview] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('7d')

  useEffect(() => {
    loadData()
  }, [siteId, dateRange])

  const loadData = async () => {
    setLoading(true)
    try {
      const [from, to] = getDateRange(dateRange)
      const [overviewRes, trendRes] = await Promise.all([
        statsApi.overview(siteId, from, to),
        statsApi.trend(siteId, from, to, 'day')
      ])
      setOverview(overviewRes.data)
      setTrend(trendRes.data)
    } catch (err) {
      console.error('Failed to load stats', err)
    } finally {
      setLoading(false)
    }
  }

  const getDateRange = (range: string): [string, string] => {
    const to = new Date()
    const from = new Date()
    switch (range) {
      case '24h': from.setHours(from.getHours() - 24); break
      case '7d': from.setDate(from.getDate() - 7); break
      case '30d': from.setDate(from.getDate() - 30); break
      case '90d': from.setDate(from.getDate() - 90); break
    }
    return [from.toISOString(), to.toISOString()]
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Analytics Overview</h1>
        <select 
          value={dateRange} 
          onChange={(e) => setDateRange(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Pageviews" value={overview?.pageviews?.toLocaleString() || '0'} />
        <Card title="Sessions" value={overview?.sessions?.toLocaleString() || '0'} />
        <Card title="Revenue" value={`$${(overview?.revenue || 0).toFixed(2)}`} />
        <Card title="Conversion Rate" value={`${(overview?.conversion_rate || 0).toFixed(2)}%`} />
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
              <span className="font-semibold">
                {overview?.sessions > 0 ? (overview.pageviews / overview.sessions).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
