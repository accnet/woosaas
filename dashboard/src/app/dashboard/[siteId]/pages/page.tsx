'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { statsApi } from '@/lib/api'
import type { PageStats } from '@/lib/types'

export default function PagesPage() {
  const siteId = useSiteId()
  const [pages, setPages] = useState<PageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.pages(siteId, from, to, 25)
        setPages(res.data)
      } catch (err) {
        console.error('Failed to load page stats', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, siteId])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Top Pages</h1>
          <p className="text-gray-600">Find the URLs that pull in the most traffic and product interest.</p>
        </div>

        <select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value as PresetDateRange)}
          className="rounded border px-3 py-2"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Path</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Pageviews</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Sessions</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Product Views</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pages.map((page) => (
              <tr key={page.path} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm text-gray-900">{page.path}</td>
                <td className="px-6 py-4 text-right">{page.pageviews.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">{page.sessions.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">{page.product_views.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No page data available</div>
        ) : null}
      </div>
    </div>
  )
}
