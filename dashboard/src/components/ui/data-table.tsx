'use client'

import { useState, useMemo, useEffect } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  render: (item: T) => React.ReactNode
  sortValue?: (item: T) => string | number
}

export function DataTable<T>({
  columns,
  data,
  emptyTitle = 'No data',
  emptyBody = 'No rows match the current criteria.',
  keyExtractor,
  framed = false,
  pageSize,
}: {
  columns: Column<T>[]
  data: T[]
  emptyTitle?: string
  emptyBody?: string
  keyExtractor: (item: T) => string
  framed?: boolean
  pageSize?: number
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)

  // Reset to page 1 when data or sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [data])

  const sorted = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return data

    return [...data].sort((a, b) => {
      const aVal = col.sortValue ? col.sortValue(a) : (a as Record<string, unknown>)[sortKey] as string | number
      const bVal = col.sortValue ? col.sortValue(b) : (b as Record<string, unknown>)[sortKey] as string | number
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [data, sortKey, sortDirection, columns])

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const paginated = pageSize ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sorted

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('desc') // default DESC for numeric tables (highest first)
    }
  }

  return (
    <div className={framed ? 'table-container' : ''}>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          {/* Sticky header */}
          <thead className="table-header sticky top-0">
            <tr>
              {columns.map((col) => {
                const isActive = sortKey === col.key
                const SortIcon = !col.sortable
                  ? null
                  : !isActive
                    ? ArrowUpDown
                    : sortDirection === 'asc'
                      ? ArrowUp
                      : ArrowDown

                return (
                  <th
                    key={col.key}
                    className={`px-4 py-2 text-[11px] font-medium text-app-soft ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    } ${col.sortable ? 'cursor-pointer select-none hover:text-app-strong' : ''} ${
                      isActive ? 'text-app-strong' : ''
                    }`}
                    onClick={() => col.sortable && handleSort(col.key)}
                    aria-sort={
                      isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {SortIcon ? <SortIcon className={`h-3 w-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} /> : null}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="table-body">
            {sorted.length > 0 ? (
              paginated.map((item) => (
                <tr key={keyExtractor(item)} className="table-row">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`table-cell px-4 py-2.5 text-sm tabular-nums ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-6 py-10 text-center">
                  <div className="text-sm font-medium text-app-strong">{emptyTitle}</div>
                  <div className="mt-1 text-xs text-app-soft">{emptyBody}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageSize && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-app-line px-4 py-2.5">
          <span className="text-xs text-app-muted">
            {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, sorted.length)} / {sorted.length} rows
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-line bg-white text-app-soft transition hover:border-app-soft hover:text-app-strong disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 text-xs tabular-nums text-app-muted">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-app-line bg-white text-app-soft transition hover:border-app-soft hover:text-app-strong disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
