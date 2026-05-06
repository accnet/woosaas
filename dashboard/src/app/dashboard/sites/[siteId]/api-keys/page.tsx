'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { sitesApi } from '@/lib/api'
import type { APIKey, APIKeyResponse, Site } from '@/lib/types'

export default function ApiKeysPage() {
  const siteId = useSiteId()
  const [keys, setKeys] = useState<APIKey[]>([])
  const [site, setSite] = useState<Site | null>(null)
  const [newKey, setNewKey] = useState<APIKeyResponse | null>(null)
  const [name, setName] = useState('WordPress Plugin')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [siteRes, keysRes] = await Promise.all([
        sitesApi.get(siteId),
        sitesApi.getApiKeys(siteId),
      ])
      setSite(siteRes.data)
      setKeys(keysRes.data)
    } catch (err) {
      console.error('Failed to load API keys', err)
    } finally {
      setLoading(false)
    }
  }

  const createKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await sitesApi.createApiKey(siteId, name)
      setNewKey(res.data)
      setName('WordPress Plugin')
      await loadData()
    } catch (err) {
      console.error('Failed to create API key', err)
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/sites" className="text-blue-500 hover:text-blue-700">
            Back to Sites
          </Link>
          <Link href={`/dashboard/sites/${siteId}/onboarding`} className="text-blue-500 hover:text-blue-700">
            Open Setup Guide
          </Link>
          <Link href={`/dashboard/sites/${siteId}/team`} className="text-blue-500 hover:text-blue-700">
            Team
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-2">API Keys</h1>
        <p className="text-gray-500">{site?.name} · {site?.domain}</p>
      </div>

      {newKey && (
        <div className="bg-green-50 border border-green-200 p-4 rounded">
          <div className="font-semibold text-green-900 mb-2">New API key</div>
          <code className="block bg-white border rounded p-3 break-all text-sm">{newKey.key}</code>
        </div>
      )}

      <form onSubmit={createKey} className="bg-white p-6 rounded-lg shadow">
        <label className="block text-sm font-medium text-gray-700 mb-2">Key name</label>
        <div className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-3 py-2 flex-1"
            required
            minLength={2}
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prefix</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="px-6 py-4">{key.name}</td>
                <td className="px-6 py-4 font-mono text-sm">{key.key_prefix}...</td>
                <td className="px-6 py-4">{key.status}</td>
                <td className="px-6 py-4 text-gray-500">
                  {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {keys.length === 0 && (
          <div className="p-8 text-center text-gray-500">No API keys yet</div>
        )}
      </div>
    </div>
  )
}
