'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnalyticsPageHeader, DateRangeSelect } from '@/components/ui/analytics-page-header'
import { AnalyticsPage, AnalyticsPageContent } from '@/components/ui/analytics-page-layout'
import { AnalyticsPageSkeleton } from '@/components/ui/analytics-page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import axios from 'axios'
import { statsApi } from '@/lib/api'
import { DATE_RANGE_OPTIONS, getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useSiteId } from '@/hooks/use-site-id'
import { useDateRange } from '@/hooks/use-date-range'
import type { HeatmapCell } from '@/lib/types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

type Metric = 'sessions' | 'revenue' | 'conversions'

function cellColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'bg-slate-50'
  const intensity = value / max
  if (intensity < 0.15) return 'bg-blue-100'
  if (intensity < 0.3) return 'bg-blue-200'
  if (intensity < 0.45) return 'bg-blue-300'
  if (intensity < 0.6) return 'bg-blue-400'
  if (intensity < 0.75) return 'bg-blue-500'
  if (intensity < 0.9) return 'bg-blue-600'
  return 'bg-blue-700'
}

function textColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'text-slate-300'
  const intensity = value / max
  return intensity >= 0.6 ? 'text-white' : 'text-slate-700'
}

export default function HeatmapPage() {
  const siteId = useSiteId()
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useDateRange()
  const [metric, setMetric] = useState<Metric>('sessions')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const { from, to } = getPresetDateRange(dateRange)
        const res = await statsApi.heatmap(siteId, from, to, metric, { signal: controller.signal })
        setCells(res.data)
      } catch (err) {
        if (axios.isCancel(err)) return
        console.error('Failed to load heatmap', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [dateRange, siteId, metric])

  // Build lookup map: [dayOfWeek][hour] → value
  const grid = useMemo(() => {
    const map: Record<number, Record<number, number>> = {}
    for (let d = 1; d <= 7; d++) {
      map[d] = {}
      for (let h = 0; h < 24; h++) {
        map[d][h] = 0
      }
    }
    for (const cell of cells) {
      const d = cell.day_of_week
      const h = cell.hour_of_day
      if (d >= 1 && d <= 7 && h >= 0 && h < 24) {
        map[d][h] = cell.value
      }
    }
    return map
  }, [cells])

  const maxValue = useMemo(() => Math.max(...cells.map((c) => c.value), 0), [cells])

  const peak = useMemo(() => {
    if (!cells.length || maxValue === 0) return null
    const best = cells.reduce((a, b) => (b.value > a.value ? b : a))
    const day = DAYS[best.day_of_week - 1] ?? 'Unknown'
    const hour = best.hour_of_day
    const label = `${hour.toString().padStart(2, '0')}:00`
    return { day, hour: label, value: best.value }
  }, [cells, maxValue])

  const formatValue = (v: number) => {
    if (metric === 'revenue') return `$${v.toFixed(0)}`
    return v.toFixed(0)
  }

  if (loading) return <AnalyticsPageSkeleton cols={4} />

  return (
    <AnalyticsPage>
      <AnalyticsPageHeader
        title="Time Heatmap"
        controls={
          <DateRangeSelect
            value={dateRange}
            onChange={(v) => setDateRange(v as PresetDateRange)}
            options={DATE_RANGE_OPTIONS}
          />
        }
      />

      <AnalyticsPageContent>
        {peak && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
            <span className="text-xl">⏰</span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                Peak: {peak.day} at {peak.hour} — {formatValue(peak.value)} {metric}
              </p>
              <p className="text-xs text-amber-700">This is your highest-traffic slot based on the selected metric and date range.</p>
            </div>
          </div>
        )}

        <SectionCard title="Activity Heatmap">
          {/* Metric selector */}
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
            {(['sessions', 'revenue', 'conversions'] as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  metric === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th className="w-10" />
                  {HOURS.map((h) => (
                    <th key={h} className="w-8 pb-1 text-center font-normal text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIdx) => {
                  const dow = dayIdx + 1 // 1=Mon
                  return (
                    <tr key={day}>
                      <td className="pr-2 text-right text-slate-500 font-medium">{day}</td>
                      {HOURS.map((h) => {
                        const v = grid[dow]?.[h] ?? 0
                        return (
                          <td
                            key={h}
                            title={`${day} ${h}:00 — ${formatValue(v)}`}
                            className={`h-8 w-8 rounded ${cellColor(v, maxValue)} cursor-default`}
                          >
                            {v > 0 && maxValue > 0 && v / maxValue > 0.5 ? (
                              <span className={`flex h-full items-center justify-center ${textColor(v, maxValue)}`}>
                                {formatValue(v)}
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <span>Low</span>
            {['bg-blue-100', 'bg-blue-200', 'bg-blue-300', 'bg-blue-400', 'bg-blue-500', 'bg-blue-600', 'bg-blue-700'].map(
              (cls) => (
                <div key={cls} className={`h-4 w-4 rounded ${cls}`} />
              )
            )}
            <span>High</span>
          </div>
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
