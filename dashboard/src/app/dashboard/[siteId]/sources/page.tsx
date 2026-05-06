'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { statsApi } from '@/lib/api'

export default function SourcesPage() {
  const params = useParams()
  const siteId = params.siteId as string
  
  const [sources, setSources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [siteId])

  const loadData = async () => {
    setLoading(true)
    try {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 30)
      const res = await statsApi.sources(siteId, from.toISOString(), to.toISOString())
      setSources(res.data)
    } catch (err) {
      console.error('Failed to load sources', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>
  }

  const totalSessions = sources.reduce((sum, s) => sum + s.sessions, 0)

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
