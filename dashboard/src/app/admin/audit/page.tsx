'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, RefreshCw } from 'lucide-react'
import { AdminPageHeader, AdminPanel, AdminSectionIntro } from '@/components/admin/admin-ui'
import { adminApi, type AdminAuditLog, getAdminToken } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

export default function AdminAuditPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    adminApi.auditLogs()
      .then((res) => setLogs(res.data.audit_logs || []))
      .catch((err) => setError(getApiErrorMessage(err, 'Audit logs could not be loaded.')))
  }

  useEffect(() => {
    load()
  }, [router])

  const logsWithReason = logs.filter((log) => log.reason).length

  return (
    <>
      <AdminPageHeader
        title="Audit Logs"
        description="Comprehensive activity log for all console operator actions."
        action={
          <button className="admin-btn-secondary gap-2 text-xs" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />
      {error ? <div className="admin-alert-error">{error}</div> : null}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <AuditStatCard label="Total Events" value={logs.length.toLocaleString()} icon={<ClipboardList className="h-4 w-4" />} iconBg="bg-slate-100 text-slate-600" />
        <AuditStatCard label="With Reason" value={logsWithReason.toLocaleString()} icon={<ClipboardList className="h-4 w-4" />} iconBg="bg-violet-100 text-violet-600" />
        <AuditStatCard label="Latest Event" value={logs[0] ? new Date(logs[0].created_at).toLocaleDateString() : '—'} icon={<ClipboardList className="h-4 w-4" />} iconBg="bg-blue-100 text-blue-600" />
      </div>

      {/* Log Table */}
      <AdminPanel className="p-6">
        <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <AdminSectionIntro
            eyebrow="Activity Logs"
            title="Administrative Activity Timeline"
            description="Read-only log of modifications to plans, users, SMTP, and provider setups."
          />
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table min-w-[800px]">
            <thead>
              <tr>
                <th>Action</th>
                <th>Target</th>
                <th>Reason</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div className="font-semibold text-slate-900">{log.action}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">{log.id}</div>
                  </td>
                  <td>
                    <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                      {log.target_type}
                    </span>
                    {log.target_id ? (
                      <div className="mt-1 text-[11px] text-slate-400">ID: {log.target_id}</div>
                    ) : null}
                  </td>
                  <td className="max-w-xs break-words text-slate-700">{log.reason || '—'}</td>
                  <td>
                    <div className="font-medium text-slate-700">
                      {new Date(log.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="py-10 text-center text-slate-400" colSpan={4}>
                    No audit logs found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </>
  )
}

function AuditStatCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string
  value: string
  icon?: ReactNode
  iconBg?: string
}) {
  return (
    <div className="card-admin-stat">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="font-admin-title text-[1.75rem] font-bold tracking-tight text-slate-900">{value}</div>
        </div>
        {icon ? <div className={`stat-icon ${iconBg || 'bg-slate-100 text-slate-600'}`}>{icon}</div> : null}
      </div>
    </div>
  )
}
