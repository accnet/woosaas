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
import ReactECharts from 'echarts-for-react'
import type { TrendPoint } from '@/lib/types'

interface BaseChartProps {
  data: TrendPoint[]
  height?: number
}

interface MultiLineChartProps extends BaseChartProps {
  lines: Array<{ dataKey: string; color: string; name: string }>
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

export function LineChart({ data, dataKey, height = 300 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
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
          dot={false}
          activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}

export function MultiLineChart({ data, lines, height = 320 }: MultiLineChartProps) {
  const option = {
    grid: { left: 0, right: 16, top: 12, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
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
    series: lines.map((l) => ({
      name: l.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: data.map((d) => (d as unknown as Record<string, number>)[l.dataKey] ?? 0),
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

  return <ReactECharts option={option} style={{ height }} notMerge />
}

export function BarChart({ data, bars, dataKey = 'name', height = 300 }: BarChartProps) {
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

export function AreaChart({ data, areas, height = 320 }: AreaChartProps) {
  const option = {
    grid: { left: 0, right: 16, top: 12, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
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
      data: data.map((d) => (d as unknown as Record<string, number>)[a.dataKey] ?? 0),
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

  return <ReactECharts option={option} style={{ height }} notMerge />
}
