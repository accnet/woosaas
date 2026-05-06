'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { statsApi } from '@/lib/api'
import type { RealtimeStats } from '@/lib/types'

export default function RealtimePage() {
  const siteId = useSiteId()

  const [realtime, setRealtime] = useState<RealtimeStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await statsApi.realtime(siteId)
        setRealtime(res.data)
      } catch (err) {
        console.error('Failed to load realtime', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
    const interval = window.setInterval(() => {
      void loadData()
    }, 30000)
    return () => clearInterval(interval)
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Realtime</h1>
        <span className="flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-4xl font-bold text-green-500">{realtime?.online_users || 0}</div>
          <div className="text-gray-500 mt-2">Active Users</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-4xl font-bold text-blue-500">{realtime?.minutes || 5}</div>
          <div className="text-gray-500 mt-2">Minute Window</div>
        </div>
      </div>
    </div>
  )
}
