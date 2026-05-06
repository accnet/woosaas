'use client'

import { useEffect, useState } from 'react'
import { sitesApi } from '@/lib/api'

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', domain: '' })

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await sitesApi.create(form)
      setForm({ name: '', domain: '' })
      setShowForm(false)
      loadSites()
    } catch (err) {
      console.error('Failed to create site', err)
    }
  }

  useEffect(() => {
    loadSites()
  }, [])

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
          {sites.map((site) => (
            <div key={site.id} className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{site.name}</h3>
                  <p className="text-gray-500">{site.domain}</p>
                </div>
                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                  Active
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={`/dashboard/sites/${site.id}/api-keys`}
                  className="text-blue-500 hover:text-blue-700 text-sm"
                >
                  Manage API Keys
                </a>
                <span className="text-gray-300">|</span>
                <a
                  href={`/dashboard/${site.id}/overview`}
                  className="text-blue-500 hover:text-blue-700 text-sm"
                >
                  View Analytics
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
