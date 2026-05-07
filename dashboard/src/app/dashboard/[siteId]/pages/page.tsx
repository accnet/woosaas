'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  MousePointerClick,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { DeltaIndicator } from '@/components/ui/delta-indicator'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TableSection } from '@/components/ui/table-section'
import { statsApi, getApiErrorMessage } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { PageStats } from '@/lib/types'

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export default function PagesPage() {
  const siteId = useSiteId()
  const [pages, setPages] = useState<PageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (pages.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.pages(siteId, from, to, 100)
        if (!cancelled) {
          setPages(res.data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Page analytics could not be loaded right now.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [dateRange, reloadKey, siteId])

  const filteredPages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return pages
    }

    return pages.filter((page) => page.path.toLowerCase().includes(normalizedQuery))
  }, [pages, query])

  const totals = useMemo(() => {
    const totalViews = pages.reduce((sum, page) => sum + (page.pageviews || 0), 0)
    const totalSessions = pages.reduce((sum, page) => sum + (page.sessions || 0), 0)
    const totalRevenue = pages.reduce((sum, page) => sum + (page.revenue || 0), 0)
    const totalPurchases = pages.reduce((sum, page) => sum + (page.purchases || 0), 0)
    const topPage = pages.reduce<PageStats | null>((leader, page) => {
      if (!leader || page.pageviews > leader.pageviews) {
        return page
      }
      return leader
    }, null)

    return { totalViews, totalSessions, totalRevenue, totalPurchases, topPage }
  }, [pages])

  if (loading && pages.length === 0) {
    return <LoadingSpinner className="py-16" />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Top Pages"
        description="Landing pages and content paths ranked by traffic, conversion signals, and revenue."
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <DateRangeSelect
              value={dateRange}
              onChange={(value) => setDateRange(value as PresetDateRange)}
              options={DATE_RANGE_OPTIONS}
            />
          </>
        }
      />

      {error ? (
        <InlineErrorState
          body={error}
          compact={pages.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard
          icon={<FileText className="h-4 w-4" />}
          label="Pages"
          value={pages.length.toString()}
          helper={totals.topPage ? `Top path: ${totals.topPage.path}` : 'No page paths in this range'}
          valueClassName="truncate text-2xl"
        />
        <MetricCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Pageviews"
          value={totals.totalViews.toLocaleString()}
          helper="Tracked page loads"
        />
        <MetricCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Purchases"
          value={totals.totalPurchases.toLocaleString()}
          helper="Orders credited to listed pages"
        />
        <MetricCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Revenue"
          value={`$${totals.totalRevenue.toFixed(2)}`}
          helper={`${totals.totalSessions.toLocaleString()} sessions across visible pages`}
        />
      </div>

      <TableSection
        title="Page Performance"
        description="Scan page-level traffic, value, and period-over-period momentum using one consistent pattern."
        icon={<FileText className="h-4 w-4" />}
        action={
          <div className="flex flex-col gap-2 sm:min-w-[320px] sm:max-w-[460px]">
            <div className="flex items-center justify-end gap-2">
              <StatusChip label={`${filteredPages.length} visible`} tone="neutral" />
              <button
                type="button"
                className="btn-secondary gap-2"
                onClick={() => setReloadKey((value) => value + 1)}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
                Refresh
              </button>
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Filter by page path" />
          </div>
        }
        isEmpty={filteredPages.length === 0}
        emptyTitle={pages.length === 0 ? 'No page data yet' : 'No matching page paths'}
        emptyBody={
          pages.length === 0
            ? 'Top pages will appear here once traffic data has been collected for this site.'
            : 'Try a shorter page path or clear the current filter to see the full list again.'
        }
        emptyIcon={<FileText className="h-12 w-12" />}
      >
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th>Page</th>
              <th className="text-right">Pageviews</th>
              <th className="text-right">Sessions</th>
              <th className="text-right">Product Views</th>
              <th className="text-right">Purchases</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Momentum</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {filteredPages.map((page) => (
              <tr key={page.path} className="table-row">
                <td className="table-cell max-w-[280px]">
                  <div className="truncate font-medium text-app-strong" title={page.path || '/'}>
                    {page.path || '/'}
                  </div>
                  <div className="mt-1 text-xs text-app-muted">
                    {page.previous_pageviews.toLocaleString()} views in previous range
                  </div>
                </td>
                <td className="table-cell text-right">
                  <div className="font-medium text-app-strong">{page.pageviews.toLocaleString()}</div>
                  <div className="mt-1 flex justify-end">
                    <DeltaIndicator value={page.pageviews_delta} />
                  </div>
                </td>
                <td className="table-cell text-right">
                  <div className="font-medium text-app-strong">{page.sessions.toLocaleString()}</div>
                  <div className="mt-1 flex justify-end">
                    <DeltaIndicator value={page.sessions_delta} />
                  </div>
                </td>
                <td className="table-cell text-right">{page.product_views.toLocaleString()}</td>
                <td className="table-cell text-right">{page.purchases.toLocaleString()}</td>
                <td className="table-cell text-right">
                  <div className="font-medium text-app-strong">${page.revenue.toFixed(2)}</div>
                  <div className="mt-1 flex justify-end">
                    <DeltaIndicator value={page.revenue_delta} />
                  </div>
                </td>
                <td className="table-cell">
                  <div className="flex justify-end gap-2">
                    <DeltaIndicator value={page.pageviews_delta} emphasize />
                    <DeltaIndicator value={page.revenue_delta} emphasize />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableSection>
    </div>
  )
}
