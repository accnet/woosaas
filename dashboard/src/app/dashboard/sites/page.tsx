'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { sitesApi } from '@/lib/api'
import {
  getSiteTrackingRank,
  getSiteTrackingState,
  type SiteTrackingLabel,
} from '@/lib/tracking-status'
import type { CreateSiteInput, Site } from '@/lib/types'

const FILTER_OPTIONS: Array<{ label: string; value: 'All' | SiteTrackingLabel }> = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Pending', value: 'Pending' },
]

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateSiteInput>({ name: '', domain: '' })
  const [statusFilter, setStatusFilter] = useState<'All' | SiteTrackingLabel>('All')

  const loadSites = async () => {
    try {
      const res = await sitesApi.list()
      setSites(res.data)
    } catch (err) {
      console.error('Failed to load sites', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      await sitesApi.create(form)
      setForm({ name: '', domain: '' })
      setShowForm(false)
      await loadSites()
    } catch (err) {
      console.error('Failed to create site', err)
    }
  }

  useEffect(() => {
    void loadSites()
  }, [])

  const filteredSites = useMemo(() => {
    return [...sites]
      .filter((site) => {
        if (statusFilter === 'All') {
          return true
        }

        return getSiteTrackingState(site).label === statusFilter
      })
      .sort((left, right) => {
        const leftState = getSiteTrackingState(left)
        const rightState = getSiteTrackingState(right)
        const rankDifference =
          getSiteTrackingRank(leftState.label) - getSiteTrackingRank(rightState.label)

        if (rankDifference !== 0) {
          return rankDifference
        }

        const leftTime =
          Date.parse(left.tracking_last_event_at || left.tracking_last_checked_at || left.created_at) || 0
        const rightTime =
          Date.parse(
            right.tracking_last_event_at || right.tracking_last_checked_at || right.created_at
          ) || 0

        return rightTime - leftTime
      })
  }, [sites, statusFilter])

  const statusCounts = useMemo(() => {
    return sites.reduce<Record<'Active' | 'Verified' | 'Pending', number>>(
      (counts, site) => {
        counts[getSiteTrackingState(site).label] += 1
        return counts
      },
      { Active: 0, Verified: 0, Pending: 0 }
    )
  }, [sites])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Sites</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          {showForm ? 'Cancel' : '+ Add Site'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Site Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border p-2 rounded"
              required
            />
            <input
              type="url"
              placeholder="https://example.com"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              className="border p-2 rounded"
              required
            />
          </div>
          <button
            type="submit"
            className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Create Site
          </button>
        </form>
      )}

      {sites.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
          No sites yet. Add your first website to start tracking!
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex flex-wrap items-center gap-2">
              {FILTER_OPTIONS.map((option) => {
                const count =
                  option.value === 'All'
                    ? sites.length
                    : statusCounts[option.value]

                const isActive = statusFilter === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option.label} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {filteredSites.map((site) => {
            const trackingState = getSiteTrackingState(site)

            return (
              <div key={site.id} className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-bold text-lg">{site.name}</h3>
                    <p className="text-gray-500">{site.domain}</p>
                    <p className="mt-2 text-sm text-gray-600">{trackingState.detail}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded font-medium ${trackingState.badgeClassName}`}
                  >
                    {trackingState.label}
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/dashboard/sites/${site.id}/onboarding`}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    Setup Guide
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link
                    href={`/dashboard/sites/${site.id}/team`}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    Team
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link
                    href={`/dashboard/sites/${site.id}/api-keys`}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    Manage API Keys
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link
                    href={`/dashboard/${site.id}/overview`}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    View Analytics
                  </Link>
                </div>
              </div>
            )
          })}

          {filteredSites.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
              No sites match this tracking status yet.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
