'use client'

import { useState } from 'react'
import { KeyRound, Save, UserRound } from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { getApiErrorMessage, profileApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export default function AuthenticationSettingsPage() {
  const { user, updateUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingProfile(true)
    setError(null)
    setProfileSaved(false)
    try {
      const res = await profileApi.update({ name })
      updateUser(res.data)
      setProfileSaved(true)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Profile could not be saved.'))
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPasswordSaved(false)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSavingPassword(true)
    try {
      await profileApi.changePassword({ current_password: currentPassword, new_password: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Password could not be changed.'))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      {error ? <InlineErrorState body={error} compact /> : null}

      <SectionCard title="Personal Info" icon={<UserRound className="h-4 w-4" />}>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-app-strong">Name</span>
              <input className="input" value={name} onChange={(event) => { setName(event.target.value); setProfileSaved(false) }} required />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-app-strong">Email</span>
              <input className="input" value={user?.email || ''} disabled />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={savingProfile} className="btn-primary gap-2">
              <Save className="h-4 w-4" />
              {savingProfile ? 'Saving...' : 'Save profile'}
            </button>
            {profileSaved ? <StatusChip label="Saved" tone="good" /> : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Password" icon={<KeyRound className="h-4 w-4" />}>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-app-strong">Current password</span>
              <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-app-strong">New password</span>
              <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-app-strong">Confirm password</span>
              <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={savingPassword} className="btn-primary gap-2">
              <KeyRound className="h-4 w-4" />
              {savingPassword ? 'Updating...' : 'Change password'}
            </button>
            {passwordSaved ? <StatusChip label="Updated" tone="good" /> : null}
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
