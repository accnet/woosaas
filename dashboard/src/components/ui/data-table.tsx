'use client'

import { useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

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
}: {
  columns: Column<T>[]
  data: T[]
  emptyTitle?: string
  emptyBody?: string
  keyExtractor: (item: T) => string
  framed?: boolean
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  return (
    <div className={framed ? 'table-container' : ''}>
      <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="table-header">
          <tr>
            {columns.map((col) => {
              const isActive = sortKey === col.key
              const SortIcon = !col.sortable ? null : !isActive ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown

              return (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-app-soft ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer select-none hover:text-app-strong' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                  aria-sort={
                    isActive
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {SortIcon ? <SortIcon className="h-3.5 w-3.5" /> : null}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="table-body">
          {sorted.length > 0 ? (
            sorted.map((item) => (
              <tr key={keyExtractor(item)} className="table-row">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`table-cell ${
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
              <td colSpan={columns.length} className="px-6 py-16 text-center">
                <div className="text-[15px] font-semibold text-app-strong">{emptyTitle}</div>
                <div className="mt-2 text-sm text-app-soft">{emptyBody}</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
