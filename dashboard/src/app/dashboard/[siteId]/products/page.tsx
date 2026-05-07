'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Package, ShoppingCart } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
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

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Top Products</h2>
          <p className="mt-2 text-sm text-app-muted">Product interest, cart activity, and purchase conversion.</p>
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value as PresetDateRange)} className="select">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Package className="h-4 w-4" />} label="Products" value={products.length.toString()} />
        <MetricCard icon={<ShoppingCart className="h-4 w-4" />} label="Views" value={totalViews.toLocaleString()} />
        <MetricCard icon={<Package className="h-4 w-4" />} label="Purchases" value={totalPurchases.toLocaleString()} />
        <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
      </div>

      <div className="table-container">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Product</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Views</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Add to Cart</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Purchases</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Units Sold</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Conv. Rate</th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-app-soft">Revenue</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {products.map((product, i) => (
              <tr key={i} className="table-row">
                <td className="table-cell max-w-[200px]"><div className="truncate font-medium text-app-strong" title={product.product_name}>{product.product_name || product.product_id}</div></td>
                <td className="table-cell text-right">{product.views?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{product.add_to_carts?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{product.purchases?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{product.units_sold?.toLocaleString() || '0'}</td>
                <td className="table-cell text-right">{(product.conversion_rate || 0).toFixed(2)}%</td>
                <td className="table-cell text-right font-medium">${(product.revenue || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <EmptyState body="No product data available" />}
      </div>
    </div>
  )
}
