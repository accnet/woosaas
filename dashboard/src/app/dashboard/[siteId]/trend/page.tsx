'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { LineChart } from '@/components/ui/charts'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { statsApi } from '@/lib/api'
import type { TrendPoint } from '@/lib/types'

type TrendMetric = 'pageviews' | 'sessions' | 'users' | 'purchases' | 'revenue'
type TrendGranularity = 'hour' | 'day' | 'week' | 'month'

export default function TrendPage() {
  const siteId = useSiteId()
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')
  const [metric, setMetric] = useState<TrendMetric>('revenue')
  const [granularity, setGranularity] = useState<TrendGranularity>('day')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.trend(siteId, from, to, granularity)
        setTrend(res.data)
      } catch (err) {
        console.error('Failed to load trend data', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, granularity, siteId])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  const totalRevenue = trend.reduce((sum, point) => sum + point.revenue, 0)
  const totalPurchases = trend.reduce((sum, point) => sum + point.purchases, 0)
  const totalSessions = trend.reduce((sum, point) => sum + point.sessions, 0)
  const totalUsers = trend.reduce((sum, point) => sum + point.users, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trend</h1>
          <p className="text-gray-600">Track traffic and revenue movement over time for the selected site.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as PresetDateRange)}
            className="rounded border px-3 py-2"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>

          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as TrendGranularity)}
            className="rounded border px-3 py-2"
          >
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>

          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as TrendMetric)}
            className="rounded border px-3 py-2"
          >
            <option value="revenue">Revenue</option>
            <option value="pageviews">Pageviews</option>
            <option value="sessions">Sessions</option>
            <option value="users">Users</option>
            <option value="purchases">Purchases</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
        <Card title="Purchases" value={totalPurchases.toLocaleString()} />
        <Card title="Sessions" value={totalSessions.toLocaleString()} />
        <Card title="Users" value={totalUsers.toLocaleString()} />
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold">Performance Trend</h2>
        {trend.length > 0 ? (
          <LineChart data={trend} dataKey={metric} height={380} />
        ) : (
          <div className="flex h-72 items-center justify-center text-gray-500">
            No trend data available
          </div>
        )}
      </div>
    </div>
  )
}
