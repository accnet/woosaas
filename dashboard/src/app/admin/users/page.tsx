'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Ban, LogIn, RefreshCw, ShieldAlert, Users } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminSectionIntro, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
import { adminApi, type AdminPlan, type AdminUserRow, getAdminToken } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

const statuses = ['active', 'disabled', 'suspended']

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{
    title: string
    description: string
    confirmLabel: string
    danger?: boolean
    run: (reason: string) => Promise<void>
  } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    setError(null)
    try {
      const [usersRes, plansRes] = await Promise.all([adminApi.users(), adminApi.plans()])
      setUsers(usersRes.data.users || [])
      setPlans(plansRes.data.plans || [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Users could not be loaded.'))
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const updateStatus = async (user: AdminUserRow, status: string) => {
    openReasonDialog({
      title: 'Change account status',
      description: `${user.email} will be changed to ${status}.`,
      confirmLabel: 'Update status',
      danger: status !== 'active',
      run: async (reasonText) => {
        setBusy(user.id)
        try {
          await adminApi.updateUserStatus(user.id, status, reasonText)
          await load()
        } catch (err) {
          setError(getApiErrorMessage(err, 'Status update failed.'))
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const updatePlan = async (user: AdminUserRow, plan: string) => {
    const selected = plans.find((item) => item.id === plan)
    openReasonDialog({
      title: 'Change account plan',
      description: `${user.email} will move to ${selected?.name || plan}.`,
      confirmLabel: 'Update plan',
      run: async (reasonText) => {
        setBusy(user.id)
        try {
          await adminApi.updateUserPlan(user.id, plan, reasonText)
          await load()
        } catch (err) {
          setError(getApiErrorMessage(err, 'Plan update failed.'))
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const impersonate = async (user: AdminUserRow) => {
    openReasonDialog({
      title: 'Start impersonation',
      description: `Open a tenant session for ${user.email}.`,
      confirmLabel: 'Start session',
      danger: true,
      run: async (reasonText) => {
        setBusy(user.id)
        try {
          const res = await adminApi.impersonate(user.id, reasonText)
          localStorage.setItem('woosaas-auth', JSON.stringify({ state: { token: res.data.token, user, isAuthenticated: true }, version: 0 }))
          window.open('/dashboard', '_blank', 'noopener,noreferrer')
        } catch (err) {
          setError(getApiErrorMessage(err, 'Impersonation failed.'))
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const openReasonDialog = (next: NonNullable<typeof dialog>) => {
    setReason('')
    setDialog(next)
  }

  const submitDialog = async () => {
    if (!dialog || !reason.trim()) return
    await dialog.run(reason.trim())
    setDialog(null)
    setReason('')
  }

  const activeUsers = users.filter((user) => user.status === 'active').length
  const suspendedUsers = users.filter((user) => user.status === 'suspended').length
  const disabledUsers = users.filter((user) => user.status === 'disabled').length
  const uniquePlans = new Set(users.map((user) => user.plan_id).filter(Boolean)).size

  const statusTone = (status: string) => {
    if (status === 'active') return 'success'
    if (status === 'suspended') return 'warning'
    return 'danger'
  }

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Accounts and access control lists."
        action={
          <button onClick={() => void load()} className="admin-btn-secondary gap-2 px-4 py-2.5 text-xs" disabled={!!busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh List
          </button>
        }
      />

      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Accounts"
          value={users.length.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <SummaryCard
          label="Active Tenants"
          value={activeUsers.toLocaleString()}
          tone="success"
          icon={<Users className="h-4 w-4" />}
        />
        <SummaryCard
          label="Restricted Access"
          value={(suspendedUsers + disabledUsers).toLocaleString()}
          hint={`${suspendedUsers} suspended · ${disabledUsers} disabled`}
          tone={suspendedUsers + disabledUsers > 0 ? 'warning' : 'neutral'}
          icon={<Ban className="h-4 w-4" />}
        />
        <SummaryCard
          label="Plan Spread"
          value={uniquePlans.toLocaleString()}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <AdminPanel className="p-6">
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-200/50 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700">
              <Users className="h-5 w-5" />
            </div>
            <AdminSectionIntro
              eyebrow="Access Control"
              title="Tenant Access Control"
              description="Manage user scopes, plans, and impersonate tenant sessions."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/60 pb-3">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Account Information</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Status</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Plan Quota</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Registration Date</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Operational Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="group hover:bg-slate-50/40 transition-colors">
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900">{user.name || user.email}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                      <div className="inline-flex rounded-lg border border-slate-100 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                        ID: {user.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <div>
                        <AdminStatusBadge label={user.status} tone={statusTone(user.status)} />
                      </div>
                      <select className="admin-select-premium !py-1.5 !px-3 !pr-8 min-w-32 text-xs" value={user.status} disabled={busy === user.id} onChange={(event) => void updateStatus(user, event.target.value)}>
                        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned plan</div>
                      <select className="admin-select-premium !py-1.5 !px-3 !pr-8 min-w-36 text-xs" value={user.plan_id} disabled={busy === user.id} onChange={(event) => void updatePlan(user, event.target.value)}>
                        {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    <div className="font-medium text-slate-700">{new Date(user.created_at).toLocaleDateString()}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{new Date(user.created_at).toLocaleTimeString()}</div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end">
                      <button className="admin-btn-secondary gap-1.5 px-3 py-2 text-xs" disabled={busy === user.id} onClick={() => void impersonate(user)}>
                        <LogIn className="h-3.5 w-3.5" />
                        Impersonate
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={5}>No users found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminPanel>
      <ReasonDialog
        open={!!dialog}
        title={dialog?.title || ''}
        description={dialog?.description || ''}
        confirmLabel={dialog?.confirmLabel}
        danger={dialog?.danger}
        value={reason}
        loading={!!busy}
        onChange={setReason}
        onCancel={() => setDialog(null)}
        onConfirm={() => void submitDialog()}
      />
    </>
  )
}

function SummaryCard({
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
          <div className="mt-2 font-admin-title text-3xl font-extrabold tracking-tight text-slate-900">{value}</div>
          {hint ? <div className="mt-2 text-xs font-semibold text-slate-500">{hint}</div> : null}
        </div>
        {icon ? <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconColor[tone]}`}>{icon}</div> : null}
      </div>
    </div>
  )
}
