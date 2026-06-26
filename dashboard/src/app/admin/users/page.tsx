'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Ban, LogIn, RefreshCw, Users } from 'lucide-react'
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
        description="Manage tenant accounts, access levels, and plan assignments."
        action={
          <button onClick={() => void load()} className="admin-btn-secondary gap-2 text-xs" disabled={!!busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="admin-alert-error">
          <Ban className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Accounts"
          value={users.length.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Active Tenants"
          value={activeUsers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          label="Restricted"
          value={(suspendedUsers + disabledUsers).toLocaleString()}
          hint={`${suspendedUsers} suspended · ${disabledUsers} disabled`}
          icon={<Ban className="h-4 w-4" />}
          iconBg="bg-amber-100 text-amber-600"
        />
        <StatCard
          label="Plan Spread"
          value={uniquePlans.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-violet-100 text-violet-600"
        />
      </div>

      {/* Users Table */}
      <AdminPanel className="p-6">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Users className="h-5 w-5" />
          </div>
          <AdminSectionIntro
            eyebrow="Access Control"
            title="Tenant Directory"
            description="Manage user statuses, plan assignments, and impersonate sessions."
          />
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table min-w-[900px]">
            <thead>
              <tr>
                <th>Account</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Registered</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{user.name || user.email}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                      <div className="inline-flex rounded-md bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                        {user.id}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-2">
                      <AdminStatusBadge label={user.status} tone={statusTone(user.status)} />
                      <select
                        className="admin-select-premium !py-1 !pr-6 !text-[11px] min-w-[110px]"
                        value={user.status}
                        disabled={busy === user.id}
                        onChange={(event) => void updateStatus(user, event.target.value)}
                      >
                        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  </td>
                  <td>
                    <select
                      className="admin-select-premium !py-1 !pr-6 !text-[11px] min-w-[130px]"
                      value={user.plan_id}
                      disabled={busy === user.id}
                      onChange={(event) => void updatePlan(user, event.target.value)}
                    >
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="text-sm font-medium text-slate-700">
                      {new Date(user.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(user.created_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      className="admin-btn-secondary gap-1.5 px-3 py-1.5 text-[11px]"
                      disabled={busy === user.id}
                      onClick={() => void impersonate(user)}
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      Impersonate
                      <ArrowUpRight className="h-3 w-3 text-slate-400" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="py-10 text-center text-slate-400" colSpan={5}>
                    No users found.
                  </td>
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

function StatCard({
  label,
  value,
  hint,
  icon,
  iconBg,
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  iconBg?: string
}) {
  return (
    <div className="card-admin-stat">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="font-admin-title text-[1.75rem] font-bold tracking-tight text-slate-900">{value}</div>
          {hint ? <div className="text-[11px] font-medium text-slate-500">{hint}</div> : null}
        </div>
        {icon ? (
          <div className={`stat-icon ${iconBg || 'bg-slate-100 text-slate-600'}`}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  )
}
