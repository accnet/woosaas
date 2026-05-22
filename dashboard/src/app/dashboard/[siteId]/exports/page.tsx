'use client'

import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { statsApi } from '@/lib/api'
import { useSiteId } from '@/hooks/use-site-id'
import { useDateRange } from '@/hooks/use-date-range'

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
const EXPORT_LABELS: Record<ExportType, string> = {
  events: 'Events',
  orders: 'Orders',
  customers: 'Contacts',
}

export default function ExportsPage() {
  const siteId = useSiteId()
  const [loading, setLoading] = useState(false)
  const [exportType, setExportType] = useState<ExportType>('events')
  const [dateRange, setDateRange] = useDateRange()
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
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Exports"
        controls={
          <StatusChip
            label={`${recentExports.filter((item) => item.status === 'ready').length} ready`}
            tone="good"
          />
        }
      />

      <AnalyticsPageContent>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Create Export"
          action={
            <button type="button" className="btn-secondary gap-2" onClick={() => setRecentExports([...recentExports])}>
              <RefreshCw className="h-4 w-4" />
              Refresh list
            </button>
          }
        >
          <form onSubmit={handleCreateExport} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-app-strong">Export Type</label>
                <select
                  value={exportType}
                  onChange={(event) => setExportType(event.target.value as ExportType)}
                  className="select w-full"
                >
                  <option value="events">Events</option>
                  <option value="orders">Orders</option>
                  <option value="customers">Contacts</option>
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
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] backdrop-blur-sm p-4">
              <Download className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 animate-pulse" />
              <p className="text-sm text-indigo-950 font-medium leading-relaxed">
                <span className="font-bold text-indigo-900">{EXPORT_LABELS[exportType]}</span> export for the{' '}
                <span className="font-bold text-indigo-900">{dateRange}</span> range — CSV is generated on demand and
                available for download immediately.
              </p>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="btn-primary gap-2 transition-all duration-150 hover:-translate-y-0.5">
                <Download className="h-4 w-4" />
                {loading ? 'Preparing...' : 'Create Export'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Recent Exports"
          action={<StatusChip label={`${recentExports.length} recent`} tone="neutral" />}
        >
          {recentExports.length > 0 ? (
            <div className="space-y-3">
              {recentExports.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200/50 bg-white/60 p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip label={EXPORT_LABELS[item.type]} tone="info" />
                        <StatusChip label={item.range} tone="neutral" />
                        <StatusChip label={item.status} tone={item.status === 'ready' ? 'good' : 'neutral'} />
                      </div>
                      <div className="mt-2.5 text-xs font-semibold text-app-muted">
                        Prepared: <span className="font-mono text-app-strong tabular-nums">{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary gap-2 py-2 text-xs transition-all duration-150 hover:-translate-y-0.5"
                      onClick={() => markDownloaded(item.id)}
                    >
                      <Download className="h-3.5 w-3.5" />
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
              body="Create an events, orders, or contacts export to populate this history panel."
            />
          )}
        </SectionCard>
        </div>


      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
