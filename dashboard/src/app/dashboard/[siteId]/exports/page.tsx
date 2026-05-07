'use client'

import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw, Users } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { DetailNote } from '@/components/ui/detail-note'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { statsApi } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'

type ExportType = 'events' | 'orders' | 'customers'
type ExportHistoryItem = {
  id: string
  type: ExportType
  range: PresetDateRange
  url: string
  createdAt: string
  status: 'ready' | 'downloaded'
}

const STORAGE_KEY = 'woosaas-recent-exports'
const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export default function ExportsPage() {
  const siteId = useSiteId()
  const [loading, setLoading] = useState(false)
  const [exportType, setExportType] = useState<ExportType>('events')
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')
  const [recentExports, setRecentExports] = useState<ExportHistoryItem[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as ExportHistoryItem[]
    setRecentExports(stored.filter((item) => item.url.includes(`site_id=${siteId}`)))
  }, [siteId])

  const persistExports = (items: ExportHistoryItem[]) => {
    setRecentExports(items)
    if (typeof window !== 'undefined') {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as ExportHistoryItem[]
      const unrelated = stored.filter((item) => !item.url.includes(`site_id=${siteId}`))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...items, ...unrelated].slice(0, 20)))
    }
  }

  const handleCreateExport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)

    try {
      const { from, to } = getPresetDateRange(dateRange)
      const url = statsApi.exportUrl(siteId, exportType, from, to)
      const nextItem: ExportHistoryItem = {
        id: `${exportType}-${dateRange}-${Date.now()}`,
        type: exportType,
        range: dateRange,
        url,
        createdAt: new Date().toISOString(),
        status: 'ready',
      }

      persistExports([nextItem, ...recentExports].slice(0, 8))
    } finally {
      setLoading(false)
    }
  }

  const markDownloaded = (id: string) => {
    persistExports(
      recentExports.map((item) => (item.id === id ? { ...item, status: 'downloaded' } : item))
    )
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Exports"
        description="Create CSV extracts from the analytics app and keep a lightweight record of recently prepared exports."
        controls={
          <StatusChip
            label={`${recentExports.filter((item) => item.status === 'ready').length} ready`}
            tone="good"
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Create Export"
          description="Choose export type and date range, then prepare a direct CSV download."
          action={
            <button type="button" className="btn-secondary gap-2" onClick={() => setRecentExports([...recentExports])}>
              <RefreshCw className="h-4 w-4" />
              Refresh list
            </button>
          }
        >
          <form onSubmit={handleCreateExport} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Export Type</label>
                <select
                  value={exportType}
                  onChange={(event) => setExportType(event.target.value as ExportType)}
                  className="select w-full"
                >
                  <option value="events">Events</option>
                  <option value="orders">Orders</option>
                  <option value="customers">Customers</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Date Range</label>
                <DateRangeSelect
                  value={dateRange}
                  onChange={(value) => setDateRange(value as PresetDateRange)}
                  options={DATE_RANGE_OPTIONS}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Readiness</label>
                <div className="flex h-[42px] items-center rounded-md border border-app-line bg-slate-50 px-3 text-sm text-app-muted">
                  Direct CSV is generated on demand
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-app-line bg-app-panel p-4">
              <div className="text-sm font-semibold text-app-strong">Selected export</div>
              <p className="mt-2 text-sm text-app-muted">
                {exportType} export for the {dateRange} range. The generated link is ready immediately and can be
                reopened from the recent exports list.
              </p>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="btn-primary gap-2">
                <Download className="h-4 w-4" />
                {loading ? 'Preparing...' : 'Create Export'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Recent Exports"
          description="Recently prepared exports for this site and their current readiness state."
          action={<StatusChip label={`${recentExports.length} recent`} tone="neutral" />}
        >
          {recentExports.length > 0 ? (
            <div className="space-y-3">
              {recentExports.map((item) => (
                <div key={item.id} className="rounded-lg border border-app-line bg-white px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip label={item.type} tone="info" />
                        <StatusChip label={item.range} tone="neutral" />
                        <StatusChip label={item.status} tone={item.status === 'ready' ? 'good' : 'neutral'} />
                      </div>
                      <div className="mt-2 text-sm text-app-muted">
                        Prepared {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary gap-2"
                      onClick={() => markDownloaded(item.id)}
                    >
                      <Download className="h-4 w-4" />
                      Download CSV
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileSpreadsheet className="h-12 w-12" />}
              title="No exports prepared yet"
              body="Create an events, orders, or customers export to populate this history panel."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DetailNote
          icon={<FileSpreadsheet className="h-4 w-4" />}
          title="CSV export types"
          body="Events exports preserve event-level rows, orders focus on purchase output, and customer exports summarize profiles plus value signals."
        />
        <DetailNote
          icon={<Users className="h-4 w-4" />}
          title="Readiness state"
          body="Prepared exports are marked ready immediately, then switch to downloaded after the first click for quick operator context."
        />
      </div>
    </div>
  )
}
