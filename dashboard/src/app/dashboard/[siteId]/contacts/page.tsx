'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { ArrowDown, ArrowUp, ArrowUpDown, BadgeDollarSign, Crown, RefreshCw, Repeat2, Users } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent, MetricGrid } from '@/components/ui/analytics-page-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { SearchInput } from '@/components/ui/search-input'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, ordersApi } from '@/lib/api'
import type { OrderContact, WooContactListResponse } from '@/lib/types'

const PAGE_SIZE = 25

const SPEND_TIERS = [
  { label: 'All', key: 'all' },
  { label: 'VIP (>$500)', key: 'vip' },
  { label: 'Repeat (>1 order)', key: 'repeat' },
  { label: 'New (1 order)', key: 'new' },
]

type SortKey = 'total_spent' | 'orders_count' | 'last_seen_at'
type SortDir = 'asc' | 'desc'

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
        active
          ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      {label}
    </button>
  )
}

function avatarColors(seed: string) {
  const palettes = [
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
    'bg-orange-100 text-orange-700',
  ]
  const idx = (seed.charCodeAt(0) || 0) % palettes.length
  return palettes[idx]
}

function money(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
    amount || 0,
  )
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString()
}

export default function ContactsPage() {
  const siteId = useSiteId()
  const [contacts, setContacts] = useState<OrderContact[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [spendTier, setSpendTier] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('total_spent')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

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
        const res = await ordersApi.listContacts(siteId, page, PAGE_SIZE, query || undefined)
        const data = res.data as WooContactListResponse
        setContacts(data.contacts)
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
  }, [page, reloadKey, siteId, query])

  const totals = useMemo(() => {
    const totalRevenue = contacts.reduce((sum, c) => sum + (c.total_spent || 0), 0)
    const totalOrders = contacts.reduce((sum, c) => sum + (c.orders_count || 0), 0)
    return { totalRevenue, totalOrders }
  }, [contacts])

  // Client-side filter + sort on loaded page
  const displayedContacts = useMemo(() => {
    let result = [...contacts]
    if (spendTier === 'vip') result = result.filter((c) => c.total_spent > 500)
    else if (spendTier === 'repeat') result = result.filter((c) => c.orders_count > 1)
    else if (spendTier === 'new') result = result.filter((c) => c.orders_count === 1)

    result.sort((a, b) => {
      let av: number, bv: number
      if (sortKey === 'total_spent') { av = a.total_spent || 0; bv = b.total_spent || 0 }
      else if (sortKey === 'orders_count') { av = a.orders_count || 0; bv = b.orders_count || 0 }
      else { av = new Date(a.last_seen_at || 0).getTime(); bv = new Date(b.last_seen_at || 0).getTime() }
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return result
  }, [contacts, spendTier, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-app-subtle" />
    return sortDir === 'desc'
      ? <ArrowDown className="ml-1 h-3 w-3 text-indigo-500" />
      : <ArrowUp className="ml-1 h-3 w-3 text-indigo-500" />
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  if (loading && contacts.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={7} />
  }

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Contacts"
        controls={
          <div className="flex flex-wrap items-center gap-2">
            {refreshing ? <StatusChip label="Refreshing…" tone="info" /> : null}
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or phone…" />
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

        {/* Filter + sort bar */}
        <div className="rounded-xl border border-app-line bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-app-soft">Segment</span>
              <div className="flex flex-wrap gap-1">
                {SPEND_TIERS.map((t) => (
                  <FilterPill key={t.key} label={t.label} active={spendTier === t.key} onClick={() => setSpendTier(t.key)} />
                ))}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-app-muted">Sort by:</span>
              {(['total_spent', 'orders_count', 'last_seen_at'] as SortKey[]).map((key) => {
                const labels: Record<SortKey, string> = { total_spent: 'Revenue', orders_count: 'Orders', last_seen_at: 'Last Order' }
                return (
                  <button
                    key={key}
                    type="button"
                    className={`flex items-center text-xs font-semibold transition ${sortKey === key ? 'text-indigo-600' : 'text-app-muted hover:text-app-strong'}`}
                    onClick={() => toggleSort(key)}
                  >
                    {labels[key]}
                    <SortIcon column={key} />
                  </button>
                )
              })}
              <span className="text-xs text-app-muted">{totalCount.toLocaleString()} contacts</span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <MetricGrid>
          <MetricCard label="Contacts" value={totalCount.toLocaleString()} icon={<Users className="h-5 w-5" />} />
          <MetricCard label="Total Orders" value={totals.totalOrders.toLocaleString()} />
          <MetricCard label="Total Revenue" value={money(totals.totalRevenue)} tone="good" icon={<BadgeDollarSign className="h-5 w-5" />} />
        </MetricGrid>

        {/* Contacts table */}
        <SectionCard
          title="WooCommerce Contacts"
          action={<StatusChip label={`${displayedContacts.length} shown`} tone="neutral" />}
          className="px-0 py-0 overflow-hidden"
        >
          {displayedContacts.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={<Users className="h-10 w-10" />}
                title="No contacts yet"
                body="Contacts are derived from synced WooCommerce orders. Enable order sync in the plugin settings."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="table-header sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft">Contact</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Email</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Phone</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">Company</th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium text-app-soft w-px whitespace-nowrap">
                      <button type="button" className="inline-flex items-center justify-end transition hover:text-app-strong" onClick={() => toggleSort('orders_count')}>
                        Orders
                        <SortIcon column="orders_count" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium text-app-soft w-px whitespace-nowrap">
                      <button type="button" className="inline-flex items-center justify-end transition hover:text-app-strong" onClick={() => toggleSort('total_spent')}>
                        Revenue
                        <SortIcon column="total_spent" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-app-soft w-px whitespace-nowrap">
                      <button type="button" className="inline-flex items-center transition hover:text-app-strong" onClick={() => toggleSort('last_seen_at')}>
                        Last Order
                        <SortIcon column="last_seen_at" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {displayedContacts.map((contact) => {
                    const displayName = contact.full_name || contact.email || '?'
                    const avatarClass = avatarColors(displayName)
                    const initial = displayName.charAt(0).toUpperCase()
                    const isVip = contact.total_spent > 500
                    const isRepeat = contact.orders_count > 1

                    return (
                      <tr key={contact.id} className="table-row transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/${siteId}/contacts/${contact.id}`} className="flex items-center gap-3">
                            <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass}`}>
                              {initial}
                              {isVip ? (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400">
                                  <Crown className="h-2.5 w-2.5 text-white" />
                                </span>
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold text-app-strong">{contact.full_name || 'Unknown'}</span>
                                {isVip ? <StatusChip label="VIP" tone="warn" /> : null}
                                {isRepeat && !isVip ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    <Repeat2 className="h-3 w-3" />
                                    Repeat
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 text-xs text-app-soft">
                                First seen {formatDate(contact.first_seen_at)}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-app-strong whitespace-nowrap">
                          {contact.email || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-app-muted whitespace-nowrap">
                          {contact.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-app-muted whitespace-nowrap">
                          {contact.company || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-app-strong whitespace-nowrap">
                          {contact.orders_count}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`text-sm font-bold tabular-nums ${isVip ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {money(contact.total_spent)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-app-muted whitespace-nowrap">
                          {formatDate(contact.last_seen_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

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
