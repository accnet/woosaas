'use client'

import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { getApiErrorMessage, settingsApi } from '@/lib/api'
import { useUserSettings } from '@/lib/settings-context'
import type { UserSettings } from '@/lib/types'

const TIMEZONES = ['UTC', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'America/New_York', 'Europe/London']
const CURRENCIES = ['USD', 'VND', 'EUR', 'GBP', 'JPY', 'THB']

export default function GeneralSettingsPage() {
  const userSettings = useUserSettings()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const res = await settingsApi.get()
        if (!cancelled) {
          setSettings(res.data)
          userSettings.setSettings(res.data)
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Settings could not be loaded.'))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current)
    setSaved(false)
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!settings) return

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await settingsApi.update({
        timezone: settings.timezone,
        currency: settings.currency,
        default_date_range: settings.default_date_range,
        dashboard_density: settings.dashboard_density,
        landing_page: settings.landing_page,
      })
      setSettings(res.data)
      userSettings.setSettings(res.data)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('woosaas-date-range', res.data.default_date_range)
      }
      setSaved(true)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Settings could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  if (!settings && !error) return <LoadingSpinner className="py-16" />

  return (
    <div className="space-y-6">
      {error ? <InlineErrorState body={error} compact={!!settings} /> : null}
      {settings ? (
        <SectionCard title="General" icon={<Settings2 className="h-4 w-4" />}>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-app-strong">Default timezone</span>
                <select className="select w-full" value={settings.timezone} onChange={(event) => update('timezone', event.target.value)}>
                  {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                </select>
                <span className="block text-xs text-app-muted">Used for new websites and as a fallback when a website has no timezone.</span>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-app-strong">Default currency</span>
                <select className="select w-full" value={settings.currency} onChange={(event) => update('currency', event.target.value)}>
                  {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
                <span className="block text-xs text-app-muted">Used for new websites and as a fallback when a website has no currency.</span>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-app-strong">Default date range</span>
                <select className="select w-full" value={settings.default_date_range} onChange={(event) => update('default_date_range', event.target.value as UserSettings['default_date_range'])}>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-app-strong">Dashboard density</span>
                <select className="select w-full" value={settings.dashboard_density} onChange={(event) => update('dashboard_density', event.target.value as UserSettings['dashboard_density'])}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-app-strong">Landing page</span>
                <select className="select w-full" value={settings.landing_page} onChange={(event) => update('landing_page', event.target.value as UserSettings['landing_page'])}>
                  <option value="sites">Sites</option>
                  <option value="dashboard">Dashboard</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save settings'}
              </button>
              {saved ? <StatusChip label="Saved" tone="good" /> : null}
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  )
}
