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
  if (max === 0 || value === 0) return 'bg-slate-50/50 border border-slate-100/50'
  const intensity = value / max
  if (intensity < 0.15) return 'bg-indigo-50 border border-indigo-100/50'
  if (intensity < 0.3) return 'bg-indigo-100 border border-indigo-200/50'
  if (intensity < 0.45) return 'bg-indigo-200 border border-indigo-300/50'
  if (intensity < 0.6) return 'bg-indigo-300 text-indigo-950'
  if (intensity < 0.75) return 'bg-indigo-400 text-white'
  if (intensity < 0.9) return 'bg-indigo-500 text-white'
  return 'bg-indigo-600 text-white shadow-[0_0_8px_rgba(99,102,241,0.25)]'
}

function textColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'text-slate-300'
  const intensity = value / max
  return intensity >= 0.45 ? 'text-white' : 'text-indigo-900'
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
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] backdrop-blur-sm px-5 py-3.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900 leading-normal">
                Peak Hour: <span className="font-bold text-amber-950">{peak.day} at {peak.hour}</span> — <span className="tabular-nums font-bold text-amber-950">{formatValue(peak.value)}</span> {metric}
              </p>
              <p className="text-xs text-amber-700/80 leading-normal mt-0.5">This is your highest-performing traffic slot based on the selected metric and date range.</p>
            </div>
          </div>
        )}

        <SectionCard title="Activity Heatmap">
          {/* Metric selector */}
          <div className="mb-6 flex gap-1 rounded-xl bg-slate-100/80 border border-slate-200/40 backdrop-blur-sm p-1 w-fit">
            {(['sessions', 'revenue', 'conversions'] as Metric[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  metric === m
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="overflow-x-auto pb-2">
            <table className="text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-12 pr-2" />
                  {HOURS.map((h) => (
                    <th key={h} className="w-9 pb-2 text-center font-mono text-[9px] uppercase tracking-wider text-slate-400">
                      {h.toString().padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIdx) => {
                  const dow = dayIdx + 1 // 1=Mon
                  return (
                    <tr key={day}>
                      <td className="pr-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">{day}</td>
                      {HOURS.map((h) => {
                        const v = grid[dow]?.[h] ?? 0
                        return (
                          <td
                            key={h}
                            title={`${day} ${h.toString().padStart(2, '0')}:00 — ${formatValue(v)}`}
                            className={`h-9 w-9 rounded-lg ${cellColor(v, maxValue)} cursor-default transition-all hover:scale-105`}
                          >
                            {v > 0 && maxValue > 0 && v / maxValue > 0.5 ? (
                              <span className={`flex h-full items-center justify-center font-semibold tabular-nums text-[10px] ${textColor(v, maxValue)}`}>
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
          <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Low</span>
            <div className="flex gap-1">
              {['bg-slate-50/50 border border-slate-100/50', 'bg-indigo-50 border border-indigo-100/50', 'bg-indigo-100 border border-indigo-200/50', 'bg-indigo-200 border border-indigo-300/50', 'bg-indigo-300', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-600'].map(
                (cls) => (
                  <div key={cls} className={`h-4 w-4 rounded-md ${cls}`} />
                )
              )}
            </div>
            <span>High</span>
          </div>
        </SectionCard>
      </AnalyticsPageContent>
    </AnalyticsPage>
  )
}
