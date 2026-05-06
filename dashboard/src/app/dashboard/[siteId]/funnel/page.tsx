'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { statsApi } from '@/lib/api'

export default function FunnelPage() {
  const params = useParams()
  const siteId = params.siteId as string
  
  const [funnel, setFunnel] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [siteId])

  const loadData = async () => {
    setLoading(true)
    try {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 30)
      const res = await statsApi.funnel(siteId, from.toISOString(), to.toISOString())
      setFunnel(res.data)
    } catch (err) {
      console.error('Failed to load funnel', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>
  }

  const steps = [
    { name: 'Pageviews', value: funnel?.pageviews || 0, rate: funnel?.product_view_rate || 0 },
    { name: 'Product Views', value: funnel?.product_views || 0, rate: funnel?.add_to_cart_rate || 0 },
    { name: 'Add to Cart', value: funnel?.add_to_carts || 0, rate: funnel?.checkout_rate || 0 },
    { name: 'Checkout', value: funnel?.checkouts || 0, rate: funnel?.purchase_rate || 0 },
    { name: 'Purchase', value: funnel?.purchases || 0, rate: 100 },
  ]

  const maxValue = steps[0].value || 1

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Conversion Funnel</h1>

      <div className="bg-white p-6 rounded-lg shadow">
        <div className="space-y-6">
          {steps.map((step, i) => {
            const percentage = (step.value / maxValue) * 100
            return (
              <div key={step.name}>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{step.name}</span>
                  <span>
                    {step.value.toLocaleString()} 
                    {i < steps.length - 1 && <span className="text-gray-500 ml-2">({step.rate.toFixed(1)}% →)</span>}
                  </span>
                </div>
                <div className="h-8 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-blue-500">
            {funnel?.product_view_rate?.toFixed(1) || 0}%
          </div>
          <div className="text-sm text-gray-500">View Rate</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-blue-500">
            {funnel?.add_to_cart_rate?.toFixed(1) || 0}%
          </div>
          <div className="text-sm text-gray-500">Cart Rate</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-blue-500">
            {funnel?.checkout_rate?.toFixed(1) || 0}%
          </div>
          <div className="text-sm text-gray-500">Checkout Rate</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-green-500">
            {funnel?.purchase_rate?.toFixed(1) || 0}%
          </div>
          <div className="text-sm text-gray-500">Purchase Rate</div>
        </div>
      </div>
    </div>
  )
}
