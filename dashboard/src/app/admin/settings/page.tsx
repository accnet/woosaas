'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Mail, Save } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
import { adminApi, type AdminSMTPSettings, getAdminToken } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

type SMTPForm = AdminSMTPSettings & {
  password: string
  clear_password: boolean
}

const DEFAULT_SMTP: SMTPForm = {
  enabled: false,
  host: '',
  port: 587,
  username: '',
  password: '',
  clear_password: false,
  from_email: '',
  from_name: '',
  encryption: 'starttls',
  has_password: false,
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [smtp, setSMTP] = useState<SMTPForm>(DEFAULT_SMTP)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    try {
      const res = await adminApi.smtpSettings()
      setSMTP({ ...DEFAULT_SMTP, ...res.data.smtp, password: '', clear_password: false })
    } catch (err) {
      setError(getApiErrorMessage(err, 'System settings could not be loaded.'))
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const updateSMTP = <K extends keyof SMTPForm>(key: K, value: SMTPForm[K]) => {
    setSMTP((current) => ({ ...current, [key]: value }))
  }

  const openSaveDialog = () => {
    setReason('')
    setReasonOpen(true)
  }

  const saveSMTP = async () => {
    if (!reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await adminApi.updateSMTPSettings({
        enabled: smtp.enabled,
        host: smtp.host,
        port: Number(smtp.port),
        username: smtp.username,
        password: smtp.password,
        clear_password: smtp.clear_password,
        from_email: smtp.from_email,
        from_name: smtp.from_name,
        encryption: smtp.encryption,
        reason: reason.trim(),
      })
      setSMTP({ ...DEFAULT_SMTP, ...res.data.smtp, password: '', clear_password: false })
      setReasonOpen(false)
      setReason('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'SMTP settings update failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AdminPageHeader title="Settings" description="System configuration for Woosaas services and platform operations." />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <AdminPanel className="p-4">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-app-bg text-app-accent">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-semibold text-app-primary">SMTP</div>
                <div className="text-sm text-app-muted">Outbound email delivery for system notifications.</div>
              </div>
            </div>
            <AdminStatusBadge label={smtp.enabled ? 'enabled' : 'disabled'} tone={smtp.enabled ? 'success' : 'warning'} />
          </div>

          <label className="flex items-center justify-between gap-4 rounded-md border border-app-border bg-app-bg px-3 py-2">
            <span>
              <span className="block text-sm font-medium text-app-primary">Enable SMTP</span>
              <span className="block text-xs text-app-muted">Use this provider for outbound system email.</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-blue-600"
              checked={smtp.enabled}
              onChange={(event) => updateSMTP('enabled', event.target.checked)}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm text-app-muted">Host</span>
              <input className="input" value={smtp.host} onChange={(event) => updateSMTP('host', event.target.value)} placeholder="smtp.example.com" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">Port</span>
              <input className="input" type="number" min={1} max={65535} value={smtp.port} onChange={(event) => updateSMTP('port', Number(event.target.value))} />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">Encryption</span>
              <select className="select w-full" value={smtp.encryption} onChange={(event) => updateSMTP('encryption', event.target.value as SMTPForm['encryption'])}>
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">From email</span>
              <input className="input" type="email" value={smtp.from_email} onChange={(event) => updateSMTP('from_email', event.target.value)} placeholder="no-reply@woosaas.com" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">From name</span>
              <input className="input" value={smtp.from_name} onChange={(event) => updateSMTP('from_name', event.target.value)} placeholder="Woosaas" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">Username</span>
              <input className="input" value={smtp.username} onChange={(event) => updateSMTP('username', event.target.value)} placeholder="SMTP username" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-app-muted">Password {smtp.has_password ? '(configured)' : ''}</span>
              <input
                className="input"
                type="password"
                value={smtp.password}
                onChange={(event) => updateSMTP('password', event.target.value)}
                placeholder={smtp.has_password ? 'Leave blank to keep current password' : 'SMTP password'}
                disabled={smtp.clear_password}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-app-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={smtp.clear_password}
              onChange={(event) => updateSMTP('clear_password', event.target.checked)}
            />
            Clear saved SMTP password
          </label>

          <div className="flex justify-end">
            <button className="btn-primary gap-2" disabled={busy} onClick={openSaveDialog}>
              {smtp.has_password ? <KeyRound className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Save SMTP settings
            </button>
          </div>
        </div>
      </AdminPanel>

      <ReasonDialog
        open={reasonOpen}
        title="Save SMTP settings"
        description="SMTP changes affect system email delivery and will be recorded in the admin audit log."
        confirmLabel="Save settings"
        value={reason}
        loading={busy}
        onChange={setReason}
        onCancel={() => setReasonOpen(false)}
        onConfirm={() => void saveSMTP()}
      />
    </>
  )
}
