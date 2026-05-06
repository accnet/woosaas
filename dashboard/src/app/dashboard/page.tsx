'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { sitesApi } from '@/lib/api'
import { getSiteTrackingState } from '@/lib/tracking-status'
import type { Site } from '@/lib/types'
import { useAuthStore } from '@/store/auth'

export default function DashboardPage() {
  const { user, logout } = useAuthStore()
  const [sites, setSites] = useState<Site[]>([])
  const [loadingSites, setLoadingSites] = useState(true)

  useEffect(() => {
    const loadSites = async () => {
      try {
        const res = await sitesApi.list()
        setSites(res.data)
      } catch (err) {
        console.error('Failed to load sites', err)
      } finally {
        setLoadingSites(false)
      }
    }

    void loadSites()
  }, [])

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Woosaas Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user.name}</span>
            <button
              onClick={logout}
              className="text-blue-500 hover:text-blue-700"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">Welcome back, {user.name}!</h2>
          <p className="text-gray-600">Here's your analytics overview</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">Sites</h3>
            <Link
              href="/dashboard/sites"
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Manage sites
            </Link>
          </div>

          {loadingSites ? (
            <LoadingSpinner className="py-8" />
          ) : sites.length === 0 ? (
            <div className="text-gray-500">No sites yet. Add a site to start tracking.</div>
          ) : (
            <div className="divide-y">
              {sites.map((site) => {
                const trackingState = getSiteTrackingState(site)

                return (
                  <div key={site.id} className="py-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{site.name}</div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${trackingState.badgeClassName}`}
                        >
                          {trackingState.label}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">{site.domain}</div>
                      <div className="text-sm text-gray-500">{trackingState.detail}</div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <Link href={`/dashboard/${site.id}/overview`} className="text-blue-500 hover:text-blue-700">
                        Overview
                      </Link>
                      <Link href={`/dashboard/sites/${site.id}/api-keys`} className="text-blue-500 hover:text-blue-700">
                        API Keys
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
