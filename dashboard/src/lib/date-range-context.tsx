'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getPresetDateRange, type PresetDateRange } from '@/lib/date-range'
import { useUserSettings } from '@/lib/settings-context'

interface DateRangeContextValue {
  dateRange: PresetDateRange
  setDateRange: (range: PresetDateRange) => void
  from: string
  to: string
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null)

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const { settings } = useUserSettings()
  const [dateRange, setDateRange] = useState<PresetDateRange>(settings.default_date_range)

  useEffect(() => {
    setDateRange(settings.default_date_range)
  }, [settings.default_date_range])

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
