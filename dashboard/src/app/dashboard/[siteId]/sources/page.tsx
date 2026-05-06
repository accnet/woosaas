'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { statsApi } from '@/lib/api'
import { getLastDaysRange } from '@/lib/date-range'
import type { SourceStats } from '@/lib/types'

export default function SourcesPage() {
  const siteId = useSiteId()

  const [sources, setSources] = useState<SourceStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getLastDaysRange(30)
        const res = await statsApi.sources(siteId, from, to)
        setSources(res.data)
      } catch (err) {
        console.error('Failed to load sources', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Traffic Sources</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medium</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sessions</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Users</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Conversions</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Conv. Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sources.map((source, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap font-medium">{source.source || '(direct)'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{source.medium || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">{source.sessions.toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">{source.users.toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">{source.conversions.toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">${source.revenue.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">{source.conversion_rate.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sources.length === 0 && (
          <div className="p-8 text-center text-gray-500">No source data available</div>
        )}
      </div>
    </div>
  )
}
