'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { DataTable, type Column } from '@/components/ui/data-table'
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

  const columns: Column<PageStats>[] = [
    {
      key: 'path',
      label: 'Page',
      render: (p) => (
        <div className="truncate max-w-[280px]">
          <span className="font-medium text-app-strong" title={p.path || '/'}>{p.path || '/'}</span>
          <div className="mt-0.5 text-xs text-app-muted">{p.previous_pageviews.toLocaleString()} views in previous range</div>
        </div>
      ),
    },
    {
      key: 'pageviews',
      label: 'Pageviews',
      align: 'right',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-app-strong">{p.pageviews.toLocaleString()}</div>
          <div className="mt-0.5 flex justify-end">
            <DeltaLabel value={p.pageviews_delta} />
          </div>
        </div>
      ),
      sortValue: (p) => p.pageviews,
    },
    {
      key: 'sessions',
      label: 'Sessions',
      align: 'right',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-app-strong">{p.sessions.toLocaleString()}</div>
          <div className="mt-0.5 flex justify-end">
            <DeltaLabel value={p.sessions_delta} />
          </div>
        </div>
      ),
      sortValue: (p) => p.sessions,
    },
    { key: 'product_views', label: 'Product Views', align: 'right', sortable: true, render: (p) => p.product_views.toLocaleString(), sortValue: (p) => p.product_views },
    { key: 'purchases', label: 'Purchases', align: 'right', sortable: true, render: (p) => p.purchases.toLocaleString(), sortValue: (p) => p.purchases },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-app-strong">${p.revenue.toFixed(2)}</div>
          <div className="mt-0.5 flex justify-end">
            <DeltaLabel value={p.revenue_delta} />
          </div>
        </div>
      ),
      sortValue: (p) => p.revenue,
    },
    {
      key: 'momentum',
      label: 'Momentum',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-2">
          <DeltaLabel value={p.pageviews_delta} />
          <DeltaLabel value={p.revenue_delta} />
        </div>
      ),
    },
  ]

  if (loading && pages.length === 0) {
    return <LoadingSpinner className="py-16" />
  }

  return (
    <div className="space-y-4">

      <AnalyticsPageHeader
        title="Pages"
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

      <div className="px-5 md:px-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Pages" value={pages.length.toString()} valueClassName="truncate text-2xl" />
          <MetricCard label="Pageviews" value={totals.totalViews.toLocaleString()} />
          <MetricCard label="Purchases" value={totals.totalPurchases.toLocaleString()} />
          <MetricCard label="Revenue" value={`$${totals.totalRevenue.toFixed(2)}`} />
        </div>

        <div className="mt-4">
          <SectionCard
            title="Page Performance"
            className="overflow-hidden px-0 py-0"
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
                <SearchInput value={query} onChange={setQuery} placeholder="Filter by path" />
              </div>
            }
          >
            <DataTable
              columns={columns}
              data={filteredPages}
              keyExtractor={(p) => p.path}
              emptyTitle={pages.length === 0 ? 'No page data yet' : 'No matching paths'}
              emptyBody={
                pages.length === 0
                  ? 'Top pages will appear here once traffic is collected.'
                  : 'Try a shorter filter or clear to see all pages.'
              }
            />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function DeltaLabel({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-app-soft">-</span>
  const isUp = value >= 0
  return <span className={`text-xs font-semibold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>{isUp ? '+' : ''}{value.toFixed(1)}%</span>
}
