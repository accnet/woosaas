'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PresetDateRange } from '@/lib/date-range'
import { useUserSettings } from '@/lib/settings-context'

const STORAGE_KEY = 'woosaas-date-range'

export function useDateRange(defaultRange: PresetDateRange = '30d') {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { settings } = useUserSettings()
  const settingsDefaultRange = settings.default_date_range || defaultRange
  
  const queryRange = searchParams.get('range') as PresetDateRange | null
  
  const [range, setRange] = useState<PresetDateRange>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const qRange = urlParams.get('range') as PresetDateRange | null
      if (qRange) return qRange
      
      const saved = localStorage.getItem(STORAGE_KEY) as PresetDateRange
      if (saved) return saved
    }
    return settingsDefaultRange
  })

  useEffect(() => {
    if (queryRange && queryRange !== range) {
      setRange(queryRange)
      localStorage.setItem(STORAGE_KEY, queryRange)
    }
  }, [queryRange, range])

  useEffect(() => {
    if (queryRange) return
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return
    if (settingsDefaultRange !== range) {
      setRange(settingsDefaultRange)
    }
  }, [queryRange, range, settingsDefaultRange])

  const updateRange = (newRange: PresetDateRange) => {
    setRange(newRange)
    localStorage.setItem(STORAGE_KEY, newRange)
    
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', newRange)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return [range, updateRange] as const
}
