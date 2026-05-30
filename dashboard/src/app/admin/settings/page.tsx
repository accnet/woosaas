'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { CheckCircle2, KeyRound, Mail, RefreshCw, Save, ShieldAlert, ShieldCheck } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminSectionIntro, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
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

const DEFAULT_PASSWORD_FORM = {
  current_password: '',
  new_password: '',
  confirm_password: '',
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [smtp, setSMTP] = useState<SMTPForm>(DEFAULT_SMTP)
  const [passwordForm, setPasswordForm] = useState(DEFAULT_PASSWORD_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('')

  const smtpConfigured = Boolean(smtp.host && smtp.port && smtp.from_email)
  const passwordReady =
    passwordForm.current_password.length > 0 &&
    passwordForm.new_password.length >= 8 &&
    passwordForm.new_password === passwordForm.confirm_password
  const smtpSecurityLabel =
    smtp.encryption === 'tls' ? 'TLS enforced' : smtp.encryption === 'starttls' ? 'STARTTLS upgrade' : 'No transport encryption'

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

  const updatePassword = (key: keyof typeof DEFAULT_PASSWORD_FORM, value: string) => {
    setPasswordForm((current) => ({ ...current, [key]: value }))
  }

  const openSaveDialog = () => {
    setReason('')
    setReasonOpen(true)
  }

  const saveSMTP = async () => {
    if (!reason.trim()) return
    setBusy(true)
    setError(null)
    setSuccess(null)
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
      setSuccess('SMTP settings saved.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'SMTP settings update failed.'))
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async () => {
    if (passwordForm.new_password.length < 8) {
      setError('New password must be at least 8 characters.')
      setSuccess(null)
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError('Password confirmation does not match.')
      setSuccess(null)
      return
    }

    setPasswordBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await adminApi.changePassword(passwordForm.current_password, passwordForm.new_password)
      setPasswordForm(DEFAULT_PASSWORD_FORM)
      setSuccess('Admin password updated.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Admin password update failed.'))
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Configure SMTP delivery settings and administrative console security."
        action={
          <button className="admin-btn-secondary gap-2 px-4 py-2.5 text-xs" onClick={() => void load()} disabled={busy || passwordBusy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Settings
          </button>
        }
      />
      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <SettingsMetricCard
          label="SMTP Delivery"
          value={smtp.enabled ? 'Enabled' : 'Disabled'}
          tone={smtp.enabled ? 'success' : 'warning'}
          icon={<Mail className="h-4 w-4" />}
        />
        <SettingsMetricCard
          label="SMTP Encryption"
          value={smtp.encryption.toUpperCase()}
          hint={smtpSecurityLabel}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <SettingsMetricCard
          label="Encrypted Secret"
          value={smtp.has_password && !smtp.clear_password ? 'Stored' : 'Not Configured'}
          tone={smtp.has_password && !smtp.clear_password ? 'success' : 'warning'}
          icon={<KeyRound className="h-4 w-4" />}
        />
        <SettingsMetricCard
          label="Security Credentials"
          value={passwordReady ? 'Ready' : 'Incomplete'}
          tone={passwordReady ? 'success' : 'neutral'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <AdminPanel className="p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 border-b border-slate-200/50 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700">
                  <Mail className="h-5 w-5" />
                </div>
                <AdminSectionIntro
                  eyebrow="Delivery"
                  title="SMTP Delivery configurations"
                  description="Required for SaaS transactional mails (verification, invoices, alerts)."
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <AdminStatusBadge label={smtp.enabled ? 'enabled' : 'disabled'} tone={smtp.enabled ? 'success' : 'warning'} />
                <AdminStatusBadge label={smtp.encryption} tone={smtp.encryption === 'none' ? 'warning' : 'neutral'} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
              <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-slate-50/40 p-4">
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-white px-4 py-3 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Enable SMTP Delivery Gateway</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-cyan-600 cursor-pointer"
                    checked={smtp.enabled}
                    onChange={(event) => updateSMTP('enabled', event.target.checked)}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block space-y-1.5 md:col-span-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Host address</span>
                    <input className="admin-input-premium text-xs" value={smtp.host} onChange={(event) => updateSMTP('host', event.target.value)} placeholder="smtp.mailgun.org" />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Port</span>
                    <input className="admin-input-premium text-xs" type="number" min={1} max={65535} value={smtp.port} onChange={(event) => updateSMTP('port', Number(event.target.value))} />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Transport encryption</span>
                    <select className="admin-select-premium text-xs w-full" value={smtp.encryption} onChange={(event) => updateSMTP('encryption', event.target.value as SMTPForm['encryption'])}>
                      <option value="starttls">STARTTLS</option>
                      <option value="tls">TLS</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Delivery Checklist</div>
                  </div>

                  <div className="space-y-2">
                    <SettingsChecklistItem label="Gateway Config" ready={Boolean(smtp.host && smtp.port)} />
                    <SettingsChecklistItem label="Sender Identity" ready={Boolean(smtp.from_email && smtp.from_name)} />
                    <SettingsChecklistItem label="Auth Credentials" ready={smtp.has_password || Boolean(smtp.password)} />
                    <SettingsChecklistItem label="Transport TLS" ready={smtp.encryption !== 'none'} warning={smtp.encryption === 'none'} />
                  </div>

                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                    {smtpConfigured ? 'Ready to Deploy' : 'Incomplete setup'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Authentication</div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Username</span>
                  <input className="admin-input-premium text-xs" value={smtp.username} onChange={(event) => updateSMTP('username', event.target.value)} placeholder="postmaster@woosaas.com" />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Password {smtp.has_password ? '(configured)' : ''}</span>
                  <input
                    className="admin-input-premium text-xs"
                    type="password"
                    value={smtp.password}
                    onChange={(event) => updateSMTP('password', event.target.value)}
                    placeholder={smtp.has_password ? '••••••••••••••••••••••••' : 'SMTP password'}
                    disabled={smtp.clear_password}
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-600 cursor-pointer"
                    checked={smtp.clear_password}
                    onChange={(event) => updateSMTP('clear_password', event.target.checked)}
                  />
                  Clear stored password secret
                </label>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Sender Identity</div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sender Email</span>
                  <input className="admin-input-premium text-xs" type="email" value={smtp.from_email} onChange={(event) => updateSMTP('from_email', event.target.value)} placeholder="no-reply@woosaas.com" />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Display Name</span>
                  <input className="admin-input-premium text-xs" value={smtp.from_name} onChange={(event) => updateSMTP('from_name', event.target.value)} placeholder="Woosaas Delivery" />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Change control</div>
              </div>
              <button className="admin-btn-primary gap-2 rounded-xl px-5 py-2.5 text-xs bg-cyan-700 hover:bg-cyan-800" disabled={busy} onClick={openSaveDialog}>
                {smtp.has_password ? <KeyRound className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                Save SMTP Settings
              </button>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel className="p-6">
          <div className="space-y-6">
            <div className="flex items-start gap-4 border-b border-slate-200/50 pb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <AdminSectionIntro
                eyebrow="Security"
                title="Admin Security Keys"
                description="Change password settings for platform operators."
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SettingsChecklistItem
                  label="Current Entered"
                  ready={passwordForm.current_password.length > 0}
                  compact
                />
                <SettingsChecklistItem
                  label="8+ Characters"
                  ready={passwordForm.new_password.length >= 8}
                  compact
                />
                <SettingsChecklistItem
                  label="Confirmed Match"
                  ready={Boolean(passwordForm.new_password) && passwordForm.new_password === passwordForm.confirm_password}
                  compact
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Current Security password</span>
                <input
                  className="admin-input-premium text-xs"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) => updatePassword('current_password', event.target.value)}
                  placeholder="••••••••"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">New Password</span>
                <input
                  className="admin-input-premium text-xs"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => updatePassword('new_password', event.target.value)}
                  placeholder="Minimum 8 characters"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Confirm New Password</span>
                <input
                  className="admin-input-premium text-xs"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(event) => updatePassword('confirm_password', event.target.value)}
                  placeholder="Repeat new password"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button className="admin-btn-primary gap-2 rounded-xl bg-slate-900 hover:bg-slate-800" disabled={passwordBusy} onClick={() => void changePassword()}>
                <KeyRound className="h-4 w-4" />
                {passwordBusy ? 'Updating...' : 'Change Security Password'}
              </button>
            </div>
          </div>
        </AdminPanel>
      </div>

      <ReasonDialog
        open={reasonOpen}
        title="Save SMTP Settings"
        description="Reason is required for the audit log."
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

function SettingsMetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  tone?: 'neutral' | 'success' | 'warning'
}) {
  const toneClasses = {
    neutral: 'from-slate-500/5 to-slate-600/5 hover:border-slate-300',
    success: 'from-emerald-500/5 to-teal-500/5 hover:border-emerald-500/30 text-emerald-950',
    warning: 'from-amber-500/5 to-orange-500/5 hover:border-amber-500/30 text-amber-950',
  }
  const iconColor = {
    neutral: 'bg-slate-500/10 text-slate-600',
    success: 'bg-emerald-500/10 text-emerald-600',
    warning: 'bg-amber-500/10 text-amber-600',
  }

  return (
    <div className={`card-admin-glass bg-gradient-to-br ${toneClasses[tone]} p-5 hover:-translate-y-1 transition-all duration-300`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="mt-2 font-admin-title text-xl font-bold text-slate-900">{value}</div>
          {hint ? <div className="mt-2 text-xs font-semibold text-slate-500">{hint}</div> : null}
        </div>
        {icon ? <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconColor[tone]}`}>{icon}</div> : null}
      </div>
    </div>
  )
}

function SettingsChecklistItem({
  label,
  ready,
  warning,
  compact,
}: {
  label: string
  ready: boolean
  warning?: boolean
  compact?: boolean
}) {
  const tone = ready ? 'text-emerald-600' : warning ? 'text-amber-600' : 'text-slate-400'
  const container = compact ? 'rounded-xl border border-slate-200 bg-white px-3 py-3' : 'flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3'

  return (
    <div className={container}>
      <div className={`flex items-center gap-2 text-xs font-semibold ${ready ? 'text-slate-900' : 'text-slate-600'}`}>
        <CheckCircle2 className={`h-4 w-4 ${tone} ${ready ? 'animate-pulse' : ''}`} />
        {label}
      </div>
      {compact ? null : <span className={`text-[10px] font-bold uppercase tracking-wider ${tone}`}>{ready ? 'Ready' : warning ? 'Review' : 'Missing'}</span>}
    </div>
  )
}
