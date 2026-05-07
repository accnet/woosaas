'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, Users } from 'lucide-react'
import { DetailNote } from '@/components/ui/detail-note'
import { SectionCard } from '@/components/ui/section-card'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'

export default function ExportsPage() {
  const siteId = useSiteId()
  const [loading, setLoading] = useState(false)
  const [exportType, setExportType] = useState<'events' | 'orders' | 'customers'>('events')
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const handleCreateExport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setDownloadUrl(null)
    try {
      const { from, to } = getPresetDateRange(dateRange)
      setDownloadUrl(statsApi.exportUrl(siteId, exportType, from, to))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Exports</h2>
          <p className="mt-2 text-sm text-app-muted">Generate CSV extracts for events, orders, and customer records.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Create Export">
        <form onSubmit={handleCreateExport}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-app-strong">Data Type</label>
              <select value={exportType} onChange={(e) => setExportType(e.target.value as 'events' | 'orders' | 'customers')} className="select">
                <option value="events">Events</option>
                <option value="orders">Orders</option>
                <option value="customers">Customers</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-app-strong">Date Range</label>
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value as PresetDateRange)} className="select">
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Preparing...' : 'Generate Export'}
              </button>
            </div>
          </div>

          {downloadUrl && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-emerald-800">Export Ready</div>
                  <div className="mt-1 text-sm text-emerald-700">CSV file prepared for download.</div>
                </div>
                <a href={downloadUrl} className="btn-primary" target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1.5 h-4 w-4" />
                  Download CSV
                </a>
              </div>
            </div>
          )}
        </form>
        </SectionCard>

        <div className="space-y-4">
          <DetailNote icon={<FileSpreadsheet className="h-4 w-4" />} title="CSV export" body="Exports are direct CSV downloads for the selected type and time window." />
          <DetailNote icon={<Users className="h-4 w-4" />} title="Customer extracts" body="Customer exports include profile, order, and revenue totals suitable for spreadsheet review." />
        </div>
      </div>
    </div>
  )
}
