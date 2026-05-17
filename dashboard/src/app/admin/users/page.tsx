'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn, RefreshCw, Users } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminStatusBadge, ReasonDialog } from '@/components/admin/admin-ui'
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

  const statusTone = (status: string) => {
    if (status === 'active') return 'success'
    if (status === 'suspended') return 'warning'
    return 'danger'
  }

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Tenant accounts, status, plan, and support access."
        action={
        <button onClick={() => void load()} className="btn-secondary gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Accounts" value={users.length.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <SummaryCard label="Active" value={activeUsers.toLocaleString()} />
        <SummaryCard label="Plans" value={plans.length.toLocaleString()} />
      </div>

      <AdminPanel>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-app-border text-app-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-app-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-app-primary">{user.name || user.email}</div>
                  <div className="text-app-muted">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                  <AdminStatusBadge label={user.status} tone={statusTone(user.status)} />
                  <select className="select min-w-32" value={user.status} disabled={busy === user.id} onChange={(event) => void updateStatus(user, event.target.value)}>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select className="select min-w-28" value={user.plan_id} disabled={busy === user.id} onChange={(event) => void updatePlan(user, event.target.value)}>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-app-muted">{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-secondary gap-2 text-xs" disabled={busy === user.id} onClick={() => void impersonate(user)}>
                    <LogIn className="h-3.5 w-3.5" />
                    Impersonate
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-app-muted" colSpan={5}>No users found.</td>
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

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <AdminPanel className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-app-muted">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-app-primary">{value}</div>
        </div>
        {icon ? <div className="flex h-9 w-9 items-center justify-center rounded-md bg-app-bg text-app-accent">{icon}</div> : null}
      </div>
    </AdminPanel>
  )
}
