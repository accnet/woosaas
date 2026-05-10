'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from 'axios'
import { ChevronRight, RefreshCw, Users } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
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

type ContactFilter = 'all' | 'identified' | 'anonymous' | 'repeat'

const PAGE_SIZE = 25

export default function ContactsPage() {
  const siteId = useSiteId()
  const [contacts, setContacts] = useState<Customer[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [query, setQueryInternal] = useState(searchParams.get('q') ?? '')
  const [filter, setFilterInternal] = useState<ContactFilter>((searchParams.get('f') as ContactFilter) || 'all')

  const setQuery = (value: string) => {
    setQueryInternal(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('q', value)
    else params.delete('q')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const setFilter = (value: ContactFilter) => {
    setFilterInternal(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value !== 'all') params.set('f', value)
    else params.delete('f')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      if (contacts.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const res = await statsApi.customers(siteId, page, PAGE_SIZE, { signal: controller.signal })
        const data = res.data as CustomerListResponse
        setContacts(data.customers)
        setTotalCount(data.total_count)
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getApiErrorMessage(err, 'Contact records could not be loaded right now.'))
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    void loadData()

    return () => controller.abort()
  }, [contacts.length, page, reloadKey, siteId])

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return contacts.filter((contact) => {
      const matchesQuery =
        !normalizedQuery ||
        contact.email.toLowerCase().includes(normalizedQuery) ||
        contact.client_id.toLowerCase().includes(normalizedQuery)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'identified' && Boolean(contact.email)) ||
        (filter === 'anonymous' && !contact.email) ||
        (filter === 'repeat' && contact.total_orders > 1)

      return matchesQuery && matchesFilter
    })
  }, [contacts, filter, query])

  const totals = useMemo(() => {
    const visibleRevenue = filteredContacts.reduce((sum, contact) => sum + (contact.total_revenue || 0), 0)
    const visibleOrders = filteredContacts.reduce((sum, contact) => sum + (contact.total_orders || 0), 0)
    const identifiedContacts = filteredContacts.filter((contact) => contact.email).length

    return { visibleRevenue, visibleOrders, identifiedContacts }
  }, [filteredContacts])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  if (loading && contacts.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={8} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Contacts"
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={`${totalCount.toLocaleString()} total`} tone="neutral" />
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <SearchInput value={query} onChange={setQuery} placeholder="Search email or client id" />
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </div>
        }
      />

      <AnalyticsPageContent>
        {error ? (
          <InlineErrorState
            body={error}
            compact={contacts.length > 0}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}

        <MetricGrid>
          <MetricCard label="Contacts" value={totalCount.toLocaleString()} />
          <MetricCard label="Orders" value={totals.visibleOrders.toLocaleString()} />
          <MetricCard label="Revenue" value={`$${totals.visibleRevenue.toFixed(2)}`} tone="good" />
          <MetricCard label="Identified" value={totals.identifiedContacts.toLocaleString()} />
        </MetricGrid>

        <TableSection
          title="Contact Directory"
          action={
            <div className="flex items-center gap-2">
                <StatusChip label={`${filteredContacts.length} visible`} tone="neutral" />
            </div>
          }
          isEmpty={filteredContacts.length === 0}
          emptyTitle={contacts.length === 0 ? 'No contact data yet' : 'No matching contacts'}
          emptyBody={
            contacts.length === 0
              ? 'Contact records will appear here after identified sessions and orders are collected.'
              : 'Try a different email fragment, client id, or contact filter.'
          }
          emptyIcon={<Users className="h-12 w-12" />}
        >
          <div className="border-b border-app-line px-6 py-4">
            <FilterPills
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: contacts.length },
                {
                  value: 'identified',
                  label: 'Identified',
                  count: contacts.filter((contact) => contact.email).length,
                },
                {
                  value: 'anonymous',
                  label: 'Anonymous',
                  count: contacts.filter((contact) => !contact.email).length,
                },
                {
                  value: 'repeat',
                  label: 'Repeat buyers',
                  count: contacts.filter((contact) => contact.total_orders > 1).length,
                },
              ]}
            />
          </div>
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <TableHeaderCell>Contact</TableHeaderCell>
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
              {filteredContacts.map((contact) => (
                <tr key={contact.client_id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-subtle text-sm font-medium text-app-strong">
                        {(contact.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-app-strong">
                          {contact.email || 'Anonymous'}
                        </div>
                        <div className="mt-1 text-xs text-app-soft">
                          Client ID {contact.client_id.slice(0, 12)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-right">{contact.total_sessions.toLocaleString()}</td>
                  <td className="table-cell text-right">{contact.total_orders.toLocaleString()}</td>
                  <td className="table-cell text-right font-medium">${contact.total_revenue.toFixed(2)}</td>
                  <td className="table-cell text-right">${contact.avg_order_value.toFixed(2)}</td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-2">
                      <StatusChip label={contact.email ? 'Known' : 'Anonymous'} tone={contact.email ? 'info' : 'neutral'} />
                      {contact.total_orders > 1 ? <StatusChip label="Repeat" tone="good" /> : null}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-app-strong">
                      {contact.last_seen ? new Date(contact.last_seen).toLocaleDateString() : '-'}
                    </div>
                    <div className="mt-1 text-xs text-app-muted">
                      First seen {contact.first_seen ? new Date(contact.first_seen).toLocaleDateString() : '-'}
                    </div>
                  </td>
                  <td className="table-cell">
                    <TableRowActionZone>
                      <Link
                        href={`/dashboard/${siteId}/contacts/${contact.client_id}`}
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
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
