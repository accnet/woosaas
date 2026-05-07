'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'

interface DateRangeContextValue {
  dateRange: PresetDateRange
  setDateRange: (range: PresetDateRange) => void
  from: string
  to: string
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null)

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<PresetDateRange>('30d')

  const { from, to } = getPresetDateRange(dateRange)

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange, from, to }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRangeContext() {
  const context = useContext(DateRangeContext)

  if (!context) {
    return null
  }

  return context
}
