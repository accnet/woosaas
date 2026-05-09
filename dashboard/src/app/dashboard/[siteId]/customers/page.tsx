'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from 'axios'
import { ChevronRight, RefreshCw, Users } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { FilterPills } from '@/components/ui/filter-pills'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { SearchInput } from '@/components/ui/search-input'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell, TableRowActionZone } from '@/components/ui/table-primitives'
import { TableSection } from '@/components/ui/table-section'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, statsApi } from '@/lib/api'
import type { Customer, CustomerListResponse } from '@/lib/types'

type CustomerFilter = 'all' | 'identified' | 'anonymous' | 'repeat'

const PAGE_SIZE = 25

export default function CustomersPage() {
  const siteId = useSiteId()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [query, setQueryInternal] = useState(searchParams.get('q') ?? '')
  const [filter, setFilterInternal] = useState<CustomerFilter>((searchParams.get('f') as CustomerFilter) || 'all')

  const setQuery = (value: string) => {
    setQueryInternal(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('q', value)
    else params.delete('q')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const setFilter = (value: CustomerFilter) => {
    setFilterInternal(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value !== 'all') params.set('f', value)
    else params.delete('f')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (customers.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const res = await statsApi.customers(siteId, page, PAGE_SIZE, { signal: controller.signal })
        const data = res.data as CustomerListResponse
        setCustomers(data.customers)
        setTotalCount(data.total_count)
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getApiErrorMessage(err, 'Customer records could not be loaded right now.'))
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()

    return () => controller.abort()
  }, [page, reloadKey, siteId])

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return customers.filter((customer) => {
      const matchesQuery =
        !normalizedQuery ||
        customer.email.toLowerCase().includes(normalizedQuery) ||
        customer.client_id.toLowerCase().includes(normalizedQuery)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'identified' && Boolean(customer.email)) ||
        (filter === 'anonymous' && !customer.email) ||
        (filter === 'repeat' && customer.total_orders > 1)

      return matchesQuery && matchesFilter
    })
  }, [customers, filter, query])

  const totals = useMemo(() => {
    const visibleRevenue = filteredCustomers.reduce((sum, customer) => sum + (customer.total_revenue || 0), 0)
    const visibleOrders = filteredCustomers.reduce((sum, customer) => sum + (customer.total_orders || 0), 0)
    const visibleSessions = filteredCustomers.reduce((sum, customer) => sum + (customer.total_sessions || 0), 0)
    const identifiedCustomers = filteredCustomers.filter((customer) => customer.email).length

    return { visibleRevenue, visibleOrders, visibleSessions, identifiedCustomers }
  }, [filteredCustomers])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  if (loading && customers.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={8} />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Customer 360"
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </>
        }
      />

      <div className="space-y-6 px-5 md:px-6">
        {error ? (
          <InlineErrorState
            body={error}
            compact={customers.length > 0}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Customers"
            value={totalCount.toLocaleString()}
          />
          <MetricCard
            label="Orders"
            value={totals.visibleOrders.toLocaleString()}
          />
          <MetricCard
            label="Revenue"
            value={`$${totals.visibleRevenue.toFixed(2)}`}
            tone="good"
          />
          <MetricCard
            label="Identified"
            value={totals.identifiedCustomers.toLocaleString()}
          />
        </div>

        <TableSection
          title="Customer Directory"
          action={
            <div className="flex flex-col gap-3 sm:min-w-[340px]">
              <div className="flex items-center justify-end gap-2">
                <StatusChip label={`${filteredCustomers.length} visible`} tone="neutral" />
              </div>
              <SearchInput value={query} onChange={setQuery} placeholder="Search email or client id" />
            </div>
          }
          isEmpty={filteredCustomers.length === 0}
          emptyTitle={customers.length === 0 ? 'No customer data yet' : 'No matching customers'}
          emptyBody={
            customers.length === 0
              ? 'Customer records will appear here after identified sessions and orders are collected.'
              : 'Try a different email fragment, client id, or customer filter.'
          }
          emptyIcon={<Users className="h-12 w-12" />}
        >
          <div className="border-b border-app-line px-6 py-4">
            <FilterPills
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: customers.length },
                {
                  value: 'identified',
                  label: 'Identified',
                  count: customers.filter((customer) => customer.email).length,
                },
                {
                  value: 'anonymous',
                  label: 'Anonymous',
                  count: customers.filter((customer) => !customer.email).length,
                },
                {
                  value: 'repeat',
                  label: 'Repeat buyers',
                  count: customers.filter((customer) => customer.total_orders > 1).length,
                },
              ]}
            />
          </div>
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <TableHeaderCell>Customer</TableHeaderCell>
                <TableHeaderCell align="right">Sessions</TableHeaderCell>
                <TableHeaderCell align="right">Orders</TableHeaderCell>
                <TableHeaderCell align="right">Revenue</TableHeaderCell>
                <TableHeaderCell align="right">Avg Order</TableHeaderCell>
                <TableHeaderCell>Identity</TableHeaderCell>
                <TableHeaderCell>Last Seen</TableHeaderCell>
                <TableHeaderCell align="right">Actions</TableHeaderCell>
              </tr>
            </thead>
            <tbody className="table-body">
              {filteredCustomers.map((customer) => (
                <tr key={customer.client_id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-subtle text-sm font-medium text-app-strong">
                        {(customer.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-app-strong">
                          {customer.email || 'Anonymous'}
                        </div>
                        <div className="mt-1 text-xs text-app-soft">
                          Client ID {customer.client_id.slice(0, 12)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-right">{customer.total_sessions.toLocaleString()}</td>
                  <td className="table-cell text-right">{customer.total_orders.toLocaleString()}</td>
                  <td className="table-cell text-right font-medium">${customer.total_revenue.toFixed(2)}</td>
                  <td className="table-cell text-right">${customer.avg_order_value.toFixed(2)}</td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-2">
                      <StatusChip label={customer.email ? 'Known' : 'Anonymous'} tone={customer.email ? 'info' : 'neutral'} />
                      {customer.total_orders > 1 ? <StatusChip label="Repeat" tone="good" /> : null}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-app-strong">
                      {customer.last_seen ? new Date(customer.last_seen).toLocaleDateString() : '-'}
                    </div>
                    <div className="mt-1 text-xs text-app-muted">
                      First seen {customer.first_seen ? new Date(customer.first_seen).toLocaleDateString() : '-'}
                    </div>
                  </td>
                  <td className="table-cell">
                    <TableRowActionZone>
                      <Link
                        href={`/dashboard/${siteId}/customers/${customer.client_id}`}
                        className="btn-ghost px-2.5 py-1 text-xs"
                      >
                        View
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </TableRowActionZone>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableSection>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
        />
      </div>
    </div>
  )
}
