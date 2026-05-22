'use client'

import { useEffect, useState } from 'react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { DataTable, type Column } from '@/components/ui/data-table'
import axios from 'axios'
import { ordersApi, statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { CrossSellPair, ProductStats } from '@/lib/types'
import { useDateRange } from '@/hooks/use-date-range'

export default function ProductsPage() {
  const siteId = useSiteId()
  const [products, setProducts] = useState<ProductStats[]>([])
  const [crossSell, setCrossSell] = useState<CrossSellPair[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()

  useEffect(() => {
    const controller = new AbortController()
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const [prodRes, csRes] = await Promise.all([
          statsApi.products(siteId, from, to, 50, { signal: controller.signal }),
          ordersApi.crossSell(siteId, 10),
        ])
        setProducts(prodRes.data)
        setCrossSell(csRes.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load product data', err)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
    return () => controller.abort()
  }, [dateRange, siteId])

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  const totalViews = products.reduce((sum, p) => sum + (p.views || 0), 0)
  const totalRevenue = products.reduce((sum, p) => sum + (p.revenue || 0), 0)
  const totalPurchases = products.reduce((sum, p) => sum + (p.purchases || 0), 0)
  const revenuePerView = totalViews > 0 ? totalRevenue / totalViews : 0

  const columns: Column<ProductStats>[] = [
    {
      key: 'product_name',
      label: 'Product',
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[200px] block font-semibold text-app-strong" title={p.product_name}>
            {p.product_name || p.product_id}
          </span>
        </div>
      ),
    },
    {
      key: 'views',
      label: 'Views',
      align: 'right',
      sortable: true,
      render: (p) => <span className="tabular-nums font-semibold text-app-strong">{p.views?.toLocaleString() || '0'}</span>,
      sortValue: (p) => p.views
    },
    {
      key: 'atc_rate',
      label: 'ATC Rate',
      align: 'right',
      sortable: true,
      render: (p) => {
        const rate = p.views > 0 ? ((p.add_to_carts || 0) / p.views) * 100 : 0
        return <span className={`tabular-nums font-semibold ${rate > 10 ? 'text-indigo-600' : 'text-app-muted'}`}>{rate.toFixed(1)}%</span>
      },
      sortValue: (p) => p.views > 0 ? ((p.add_to_carts || 0) / p.views) * 100 : 0,
    },
    {
      key: 'add_to_carts',
      label: 'Add to Cart',
      align: 'right',
      sortable: true,
      render: (p) => <span className="tabular-nums font-medium text-app-strong">{p.add_to_carts?.toLocaleString() || '0'}</span>,
      sortValue: (p) => p.add_to_carts
    },
    {
      key: 'purchases',
      label: 'Purchases',
      align: 'right',
      sortable: true,
      render: (p) => <span className="tabular-nums font-semibold text-app-strong">{p.purchases?.toLocaleString() || '0'}</span>,
      sortValue: (p) => p.purchases
    },
    {
      key: 'units_sold',
      label: 'Units Sold',
      align: 'right',
      sortable: true,
      render: (p) => <span className="tabular-nums font-semibold text-app-strong">{p.units_sold?.toLocaleString() || '0'}</span>,
      sortValue: (p) => p.units_sold
    },
    {
      key: 'conversion_rate',
      label: 'Conv. Rate',
      align: 'right',
      sortable: true,
      render: (p) => <span className="tabular-nums font-semibold text-indigo-600">{(p.conversion_rate || 0).toFixed(2)}%</span>,
      sortValue: (p) => p.conversion_rate
    },
    {
      key: 'aov',
      label: 'AOV',
      align: 'right',
      sortable: true,
      render: (p) => {
        const aov = p.purchases > 0 ? (p.revenue || 0) / p.purchases : 0
        return <span className="tabular-nums font-semibold text-app-strong">${aov.toFixed(2)}</span>
      },
      sortValue: (p) => p.purchases > 0 ? (p.revenue || 0) / p.purchases : 0,
    },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      sortable: true,
      render: (p) => <span className="tabular-nums font-bold text-emerald-600">${(p.revenue || 0).toFixed(2)}</span>,
      sortValue: (p) => p.revenue
    },
    {
      key: 'delta',
      label: 'Δ Revenue',
      align: 'right',
      sortable: true,
      render: (p) => {
        const delta = p.revenue_delta
        if (delta == null) return <span className="tabular-nums text-app-soft font-medium">-</span>
        const isUp = delta >= 0
        return <span className={`text-xs font-semibold tabular-nums ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>{isUp ? '+' : ''}{delta.toFixed(1)}%</span>
      },
      sortValue: (p) => p.revenue_delta,
    },
  ]

  return (
    <AnalyticsPage>

      <AnalyticsPageHeader
        title="Top Products"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(value) => setDateRange(value as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />
      <AnalyticsPageContent>
        <MetricGrid cols={5}>
          <MetricCard label="Products" value={products.length.toString()} />
          <MetricCard label="Views" value={totalViews.toLocaleString()} />
          <MetricCard label="Purchases" value={totalPurchases.toLocaleString()} />
          <MetricCard label="Revenue" value={`$${totalRevenue.toFixed(2)}`} tone={totalRevenue > 0 ? 'good' : 'neutral'} />
          <MetricCard label="Rev / View" value={`$${revenuePerView.toFixed(3)}`} tone={revenuePerView > 0 ? 'good' : 'neutral'} />
        </MetricGrid>

        <SectionCard title="Product Conversion" className="overflow-hidden px-0 py-0">
          <DataTable columns={columns} data={products} keyExtractor={(p) => p.product_id} />
        </SectionCard>

        {crossSell.length > 0 && (
          <SectionCard title="Top Cross-Sell Pairs">
            <p className="mb-3 text-xs text-app-muted">Products most frequently purchased together in the same order.</p>
            <div className="space-y-2">
              {crossSell.map((pair, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-lg border border-app-line px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className="truncate font-medium text-app-strong">{pair.product_a}</span>
                    <span className="shrink-0 text-app-muted">+</span>
                    <span className="truncate font-medium text-app-strong">{pair.product_b}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    {pair.co_purchase_count}× together
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
