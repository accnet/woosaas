'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { statsApi } from '@/lib/api'

export default function BotsPage() {
  const params = useParams()
  const siteId = params.siteId as string
  
  const [report, setReport] = useState<any>(null)
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
      const res = await statsApi.bots(siteId, from.toISOString(), to.toISOString())
      setReport(res.data)
    } catch (err) {
      console.error('Failed to load bot report', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bot Detection</h1>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Report Status</h2>
        <p className="text-gray-600">{report?.message || 'Bot report is not available yet.'}</p>
      </div>
    </div>
  )
}
