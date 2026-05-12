'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getApiErrorMessage, settingsApi } from '@/lib/api'
import type { UserSettings } from '@/lib/types'

const STORAGE_KEY = 'woosaas-user-settings'

const DEFAULT_SETTINGS: UserSettings = {
  user_id: '',
  timezone: 'UTC',
  currency: 'USD',
  default_date_range: '7d',
  dashboard_density: 'comfortable',
  landing_page: 'sites',
  created_at: '',
  updated_at: '',
}

type UserSettingsContextValue = {
  settings: UserSettings
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setSettings: (settings: UserSettings) => void
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null)

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<UserSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_SETTINGS
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setSettings = (nextSettings: UserSettings) => {
    setSettingsState(nextSettings)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings))
    }
  }

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await settingsApi.get()
      setSettings(res.data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Settings could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.dashboardDensity = settings.dashboard_density
  }, [settings.dashboard_density])

  const value = useMemo(
    () => ({ settings, loading, error, refresh, setSettings }),
    [settings, loading, error]
  )

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  )
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext)
  if (!context) {
    return {
      settings: DEFAULT_SETTINGS,
      loading: false,
      error: null,
      refresh: async () => undefined,
      setSettings: () => undefined,
    }
  }
  return context
}
