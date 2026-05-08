'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DollarSign, ExternalLink, Package, ShoppingCart } from 'lucide-react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { statsApi } from '@/lib/api'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import type { ProductStats } from '@/lib/types'

export default function ProductsPage() {
  const siteId = useSiteId()
  const [products, setProducts] = useState<ProductStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.products(siteId, from, to, 20)
        setProducts(res.data)
      } catch (err) {
        console.error('Failed to load product data', err)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [dateRange, siteId])

  if (loading) return <LoadingSpinner className="py-16" />

  const totalViews = products.reduce((sum, p) => sum + (p.views || 0), 0)
  const totalRevenue = products.reduce((sum, p) => sum + (p.revenue || 0), 0)
  const totalPurchases = products.reduce((sum, p) => sum + (p.purchases || 0), 0)

  const columns: Column<ProductStats>[] = [
    {
      key: 'product_name',
      label: 'Product',
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[200px] block font-medium text-app-strong" title={p.product_name}>
            {p.product_name || p.product_id}
          </span>
        </div>
      ),
    },
    { key: 'views', label: 'Views', align: 'right', sortable: true, render: (p) => p.views?.toLocaleString() || '0', sortValue: (p) => p.views },
    { key: 'add_to_carts', label: 'Add to Cart', align: 'right', sortable: true, render: (p) => p.add_to_carts?.toLocaleString() || '0', sortValue: (p) => p.add_to_carts },
    { key: 'purchases', label: 'Purchases', align: 'right', sortable: true, render: (p) => p.purchases?.toLocaleString() || '0', sortValue: (p) => p.purchases },
    { key: 'units_sold', label: 'Units Sold', align: 'right', sortable: true, render: (p) => p.units_sold?.toLocaleString() || '0', sortValue: (p) => p.units_sold },
    { key: 'conversion_rate', label: 'Conv. Rate', align: 'right', sortable: true, render: (p) => `${(p.conversion_rate || 0).toFixed(2)}%`, sortValue: (p) => p.conversion_rate },
    { key: 'revenue', label: 'Revenue', align: 'right', sortable: true, render: (p) => <span className="font-medium">${(p.revenue || 0).toFixed(2)}</span>, sortValue: (p) => p.revenue },
    {
      key: 'delta',
      label: 'Δ Revenue',
      align: 'right',
      sortable: true,
      render: (p) => {
        const delta = p.revenue_delta
        if (delta == null) return <span className="text-app-soft">-</span>
        const isUp = delta >= 0
        return <span className={`text-xs font-semibold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>{isUp ? '+' : ''}{delta.toFixed(1)}%</span>
      },
      sortValue: (p) => p.revenue_delta,
    },
  ]

  return (
    <div className="space-y-4">

      <AnalyticsPageHeader
        title="Top Products"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(value) => setDateRange(value as PresetDateRange)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Package className="h-4 w-4" />} label="Products" value={products.length.toString()} />
        <MetricCard icon={<ShoppingCart className="h-4 w-4" />} label="Views" value={totalViews.toLocaleString()} />
        <MetricCard icon={<Package className="h-4 w-4" />} label="Purchases" value={totalPurchases.toLocaleString()} />
        <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
      </div>

      <SectionCard
        title="Product Conversion"
        icon={<Package className="h-4 w-4" />}
        className="overflow-hidden px-0 py-0"
      >
        <DataTable columns={columns} data={products} keyExtractor={(p) => p.product_id} />
      </SectionCard>
    </div>
  )
}
