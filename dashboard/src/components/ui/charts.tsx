'use client'

import {
  LineChart as RechartsLineChart,
  BarChart as RechartsBarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import dynamic from 'next/dynamic'
import type { TrendPoint } from '@/lib/types'

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-slate-50" />,
})

interface BaseChartProps {
  data: TrendPoint[]
  height?: number
}

interface MultiLineChartProps extends BaseChartProps {
  lines: Array<{ dataKey: string; color: string; name: string; yAxisId?: 'left' | 'right' }>
}

interface LineChartProps {
  data: TrendPoint[]
  dataKey: string
  height?: number
}

interface BarChartProps {
  data: Array<Record<string, string | number>>
  bars: Array<{ dataKey: string; color: string; name: string }>
  dataKey?: string
  height?: number
}

interface AreaChartProps {
  data: TrendPoint[]
  areas: Array<{ dataKey: string; color: string; name: string }>
  height?: number
}

const defaultTooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  fontSize: '12px',
}

function formatChartDate(value: string | number) {
  if (typeof value !== 'string') return String(value)

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const hasHour = /T|\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat('en-US', hasHour ? { month: 'short', day: 'numeric', hour: 'numeric' } : { month: 'short', day: 'numeric' }).format(parsed)
}

function getMetricKind(dataKey: string, name: string): 'currency' | 'percent' | 'count' {
  const metric = `${dataKey} ${name}`.toLowerCase()
  if (metric.includes('revenue') || metric.includes('aov') || metric.includes('value')) return 'currency'
  if (metric.includes('rate') || metric.includes('%') || metric.includes('conversion')) return 'percent'
  return 'count'
}

function formatMetricValue(value: number, kind: 'currency' | 'percent' | 'count') {
  if (!Number.isFinite(value)) return '0'

  if (kind === 'currency') {
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 0 })}`
  }

  if (kind === 'percent') {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function toNumericValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

type EChartsTooltipParam = {
  axisValue?: string | number
  axisValueLabel?: string
  marker?: string
  seriesName?: string
  value?: unknown
}

function getTooltipValue(value: unknown) {
  if (Array.isArray(value)) return value[value.length - 1]
  return value
}

export function LineChart({ data, dataKey, height = 300 }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-app-soft" style={{ height }}>
        <span className="text-sm">No data for this period</span>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatChartDate}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip contentStyle={defaultTooltipStyle} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke="#6366f1"
          strokeWidth={2}
          dot={data.length <= 2 ? { r: 3, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' } : false}
          activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}

export function MultiLineChart({ data, lines, height }: MultiLineChartProps) {
  const chartHeight = height ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 240 : 320)

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-app-soft" style={{ height: chartHeight }}>
        <span className="text-sm">No data for this period</span>
      </div>
    )
  }

  const hasRightAxis = lines.some((l) => l.yAxisId === 'right')
  const getAxisKind = (axisId: 'left' | 'right') => {
    const axisLines = lines.filter((l) => (l.yAxisId ?? 'left') === axisId)
    const kinds = axisLines.map((l) => getMetricKind(l.dataKey, l.name))
    if (kinds.length > 0 && kinds.every((kind) => kind === 'currency')) return 'currency'
    if (kinds.length > 0 && kinds.every((kind) => kind === 'percent')) return 'percent'
    return 'count'
  }
  const leftAxisKind = getAxisKind('left')
  const rightAxisKind = getAxisKind('right')
  const showPointSymbols = data.length <= 2

  const yAxisConfig = hasRightAxis
    ? [
        {
          type: 'value',
          min: 0,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => formatMetricValue(v, leftAxisKind) },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' as const } },
        },
        {
          type: 'value',
          position: 'right',
          min: 0,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => formatMetricValue(v, rightAxisKind) },
          splitLine: { show: false },
        },
      ]
    : {
        type: 'value',
        min: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => formatMetricValue(v, leftAxisKind) },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' as const } },
      }

  const option = {
    grid: { left: 0, right: hasRightAxis ? 60 : 16, top: 12, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: formatChartDate, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: yAxisConfig,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textStyle: { fontSize: 12, color: '#314056' },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px;',
      formatter: (params: EChartsTooltipParam | EChartsTooltipParam[]) => {
        const points = Array.isArray(params) ? params : [params]
        const axisValue = points[0]?.axisValue ?? points[0]?.axisValueLabel ?? ''
        const rows = points.map((point) => {
          const line = lines.find((l) => l.name === point.seriesName)
          const kind = line ? getMetricKind(line.dataKey, line.name) : 'count'
          const value = formatMetricValue(toNumericValue(getTooltipValue(point.value)), kind)
          return `${point.marker ?? ''}${point.seriesName ?? ''}: <strong>${value}</strong>`
        })

        return [`<strong>${formatChartDate(axisValue)}</strong>`, ...rows].join('<br/>')
      },
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 12, color: '#5e6b84' },
      icon: 'circle',
    },
    series: lines.map((l) => ({
      name: l.name,
      type: 'line',
      smooth: true,
      symbol: showPointSymbols ? 'circle' : 'none',
      symbolSize: 7,
      yAxisIndex: l.yAxisId === 'right' ? 1 : 0,
      data: data.map((d) => toNumericValue((d as unknown as Record<string, unknown>)[l.dataKey])),
      lineStyle: { color: l.color, width: 2.5 },
      itemStyle: { color: l.color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: l.color + '22' },
            { offset: 1, color: l.color + '00' },
          ],
        },
      },
    })),
  }

  return <ReactECharts option={option} style={{ height: chartHeight }} notMerge />
}

export function BarChart({ data, bars, dataKey = 'name', height = 300 }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-app-soft" style={{ height }}>
        <span className="text-sm">No data for this period</span>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey={dataKey}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip contentStyle={defaultTooltipStyle} />
        <Legend iconType="rect" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name}
            fill={bar.color}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

export function AreaChart({ data, areas, height }: AreaChartProps) {
  const chartHeight = height ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 240 : 320)

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-app-soft" style={{ height: chartHeight }}>
        <span className="text-sm">No data for this period</span>
      </div>
    )
  }

  const option = {
    grid: { left: 0, right: 16, top: 12, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: formatChartDate, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' as const } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textStyle: { fontSize: 12, color: '#314056' },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 8px;',
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 12, color: '#5e6b84' },
      icon: 'circle',
    },
    series: areas.map((a) => ({
      name: a.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      stack: 'total',
      data: data.map((d) => toNumericValue((d as unknown as Record<string, unknown>)[a.dataKey])),
      lineStyle: { color: a.color, width: 2 },
      itemStyle: { color: a.color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: a.color + '30' },
            { offset: 1, color: a.color + '05' },
          ],
        },
      },
    })),
  }

  return <ReactECharts option={option} style={{ height: chartHeight, width: '100%' }} notMerge opts={{ renderer: 'svg' }} />
}
