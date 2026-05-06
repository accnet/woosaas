'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sitesApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export default function DashboardPage() {
  const router = useRouter()
  const { user, isAuthenticated, hasHydrated, logout } = useAuthStore()
  const [sites, setSites] = useState<any[]>([])
  const [loadingSites, setLoadingSites] = useState(true)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.push('/login')
    }
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) {
      return
    }

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

    loadSites()
  }, [hasHydrated, isAuthenticated])

  if (!hasHydrated || !isAuthenticated || !user) {
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
            <div className="text-gray-500">Loading sites...</div>
          ) : sites.length === 0 ? (
            <div className="text-gray-500">No sites yet. Add a site to start tracking.</div>
          ) : (
            <div className="divide-y">
              {sites.map((site) => (
                <div key={site.id} className="py-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{site.name}</div>
                    <div className="text-sm text-gray-500">{site.domain}</div>
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
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
