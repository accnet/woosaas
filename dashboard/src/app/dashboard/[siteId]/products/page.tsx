'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { statsApi } from '@/lib/api'
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
        const res = await statsApi.products(siteId, from, to, 25)
        setProducts(res.data)
      } catch (err) {
        console.error('Failed to load product stats', err)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [dateRange, siteId])

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Top Products</h1>
          <p className="text-gray-600">Review which catalog items attract attention, cart activity, and revenue.</p>
        </div>

        <select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value as PresetDateRange)}
          className="rounded border px-3 py-2"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Product</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Views</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Add to Cart</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Purchases</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Units Sold</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">CR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={`${product.product_id}-${product.product_name}`} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{product.product_name || 'Unnamed product'}</div>
                  <div className="text-sm text-gray-500">{product.product_id || 'No product id'}</div>
                </td>
                <td className="px-6 py-4 text-right">{product.views.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">{product.add_to_carts.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">{product.purchases.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">{product.units_sold.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">${product.revenue.toFixed(2)}</td>
                <td className="px-6 py-4 text-right">{product.conversion_rate.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No product data available</div>
        ) : null}
      </div>
    </div>
  )
}
