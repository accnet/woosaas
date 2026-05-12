'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Save } from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { billingApi, getApiErrorMessage } from '@/lib/api'
import type { BillingProfile } from '@/lib/types'

const EMPTY_PROFILE: BillingProfile = {
  billing_name: '',
  company: '',
  email: '',
  phone: '',
  tax_id: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
}

export default function BillingSettingsPage() {
  const [profile, setProfile] = useState<BillingProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const res = await billingApi.getProfile()
        if (!cancelled) setProfile({ ...EMPTY_PROFILE, ...res.data })
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Billing information could not be loaded.'))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const update = (key: keyof BillingProfile, value: string) => {
    setProfile((current) => current ? { ...current, [key]: value } : current)
    setSaved(false)
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!profile) return

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await billingApi.updateProfile(profile)
      setProfile({ ...EMPTY_PROFILE, ...res.data })
      setSaved(true)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Billing information could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  if (!profile && !error) return <LoadingSpinner className="py-16" />

  return (
    <div className="space-y-6">
      {error ? <InlineErrorState body={error} compact={!!profile} /> : null}
      {profile ? (
        <SectionCard title="Billing Information" icon={<CreditCard className="h-4 w-4" />}>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Field label="Billing name" value={profile.billing_name} onChange={(value) => update('billing_name', value)} />
              <Field label="Company" value={profile.company} onChange={(value) => update('company', value)} />
              <Field label="Billing email" type="email" value={profile.email} onChange={(value) => update('email', value)} />
              <Field label="Phone" value={profile.phone} onChange={(value) => update('phone', value)} />
              <Field label="Tax ID" value={profile.tax_id} onChange={(value) => update('tax_id', value)} />
              <Field label="Country" value={profile.country} onChange={(value) => update('country', value)} />
              <Field label="Address line 1" value={profile.address_line1} onChange={(value) => update('address_line1', value)} />
              <Field label="Address line 2" value={profile.address_line2} onChange={(value) => update('address_line2', value)} />
              <Field label="City" value={profile.city} onChange={(value) => update('city', value)} />
              <Field label="State / region" value={profile.state} onChange={(value) => update('state', value)} />
              <Field label="Postal code" value={profile.postal_code} onChange={(value) => update('postal_code', value)} />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save billing information'}
              </button>
              {saved ? <StatusChip label="Saved" tone="good" /> : null}
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-app-strong">{label}</span>
      <input className="input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
