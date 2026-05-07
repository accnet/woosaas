'use client'

import { useEffect, useState } from 'react'
import { FileText, MousePointerClick, TrendingUp } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { PageStats } from '@/lib/types'

export default function PagesPage() {
  const siteId = useSiteId()
  const [pages, setPages] = useState<PageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.pages(siteId, from, to, 20)
        setPages(res.data)
      } catch (err) {
        console.error('Failed to load page data', err)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [dateRange, siteId])

  if (loading) return <LoadingSpinner className="py-16" />

  const totalViews = pages.reduce((sum, page) => sum + (page.pageviews || 0), 0)
  const totalRevenue = pages.reduce((sum, page) => sum + (page.revenue || 0), 0)

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Top Pages</h2>
          <p className="mt-2 text-sm text-app-muted">Landing pages and content paths ranked by traffic and value.</p>
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value as PresetDateRange)} className="select">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <MetricCard icon={<FileText className="h-4 w-4" />} label="Pages" value={pages.length.toString()} />
        <MetricCard icon={<MousePointerClick className="h-4 w-4" />} label="Pageviews" value={totalViews.toLocaleString()} />
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
      </div>

      <div className="table-container">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Page</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Pageviews</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Sessions</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Δ Pageviews</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Δ Sessions</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Δ Revenue</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {pages.map((page, i) => (
              <tr key={i} className="table-row">
                <td className="table-cell max-w-[200px] truncate font-medium text-app-strong" title={page.path}>{page.path || '/'}</td>
                <td className="table-cell text-right">{page.pageviews?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{page.sessions?.toLocaleString() || '0'}</td>
                <td className={`table-cell text-right ${(page.pageviews_delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(page.pageviews_delta ?? 0) >= 0 ? '+' : ''}{page.pageviews_delta ?? 0}</td>
                <td className={`table-cell text-right ${(page.sessions_delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(page.sessions_delta ?? 0) >= 0 ? '+' : ''}{page.sessions_delta ?? 0}</td>
                <td className="table-cell text-right font-medium">${(page.revenue || 0).toFixed(2)}</td>
                <td className={`table-cell text-right ${(page.revenue_delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(page.revenue_delta ?? 0) >= 0 ? '+' : ''}{page.revenue_delta ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages.length === 0 && <EmptyState body="No page data available" />}
      </div>
    </div>
  )
}
