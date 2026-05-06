'use client'

import ReactECharts from 'echarts-for-react'

interface TrendPoint {
  date: string | Date
  pageviews?: number
  sessions?: number
  users?: number
  purchases?: number
  revenue?: number
}

interface LineChartProps {
  data: TrendPoint[]
  dataKey?: string
  height?: number
}

export function LineChart({ data, dataKey = 'pageviews', height = 300 }: LineChartProps) {
  const option = {
    tooltip: {
      trigger: 'axis',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => {
        const date = d.date instanceof Date ? d.date.toLocaleDateString() : d.date
        return typeof date === 'string' ? date.split('T')[0] : String(date)
      }),
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        data: data.map((d) => {
          const val = (d as any)[dataKey]
          return val ?? 0
        }),
        type: 'line',
        smooth: true,
        areaStyle: {
          opacity: 0.3,
        },
      },
    ],
  }

  return <ReactECharts option={option} style={{ height }} />
}

interface BarChartProps {
  data: { name: string; value: number }[]
  height?: number
}

export function BarChart({ data, height = 300 }: BarChartProps) {
  const option = {
    tooltip: {
      trigger: 'axis',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLabel: {
        rotate: 45,
      },
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        data: data.map((d) => d.value),
        type: 'bar',
      },
    ],
  }

  return <ReactECharts option={option} style={{ height }} />
}

interface PieChartProps {
  data: { name: string; value: number }[]
  height?: number
}

export function PieChart({ data, height = 300 }: PieChartProps) {
  const option = {
    tooltip: {
      trigger: 'item',
    },
    series: [
      {
        type: 'pie',
        radius: '50%',
        data: data.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  }

  return <ReactECharts option={option} style={{ height }} />
}