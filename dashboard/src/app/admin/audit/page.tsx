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
          <button className="admin-btn-secondary gap-2 px-4 py-2.5 text-xs" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Logs
          </button>
        }
      />
      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Audit Events Triggered" value={logs.length.toLocaleString()} icon={<ClipboardList className="h-4 w-4" />} />
        <MetricCard label="Authorized with Reason" value={logsWithReason.toLocaleString()} icon={<ClipboardList className="h-4 w-4" />} />
        <MetricCard label="Latest Operator Event" value={logs[0] ? new Date(logs[0].created_at).toLocaleDateString() : '-'} icon={<ClipboardList className="h-4 w-4" />} />
      </div>

      <AdminPanel className="p-6">
        <div className="mb-6 flex items-start gap-4 border-b border-slate-200/50 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700">
            <ClipboardList className="h-5 w-5" />
          </div>
          <AdminSectionIntro eyebrow="Activity Logs" title="Administrative Activity Timeline" description="Read-only log of modifications to plans, users, SMTP, and provider setups." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/60 pb-3">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Action Type</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Target Object</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Justification / Reason</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="group hover:bg-slate-50/40 transition-colors">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-900">{log.action}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">ID: {log.id}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-600 font-medium">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 border border-slate-200/40 font-mono">
                      {log.target_type}
                    </span>
                    {log.target_id ? (
                      <div className="mt-1 text-xs text-slate-400">Target ID: {log.target_id}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-slate-800 font-medium max-w-sm break-words">{log.reason || '-'}</td>
                  <td className="px-4 py-4 text-slate-500">
                    <div className="font-semibold text-slate-700">{new Date(log.created_at).toLocaleDateString()}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={4}>No audit logs found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="card-admin-glass bg-gradient-to-br from-slate-500/5 to-slate-600/5 p-5 hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="mt-2 font-admin-title text-2xl font-extrabold tracking-tight text-slate-900">{value}</div>
        </div>
        {icon ? <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600">{icon}</div> : null}
      </div>
    </div>
  )
}
