'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui'
import { adminApi, type AdminAuditLog, getAdminToken } from '@/lib/admin/api'
import { getApiErrorMessage } from '@/lib/api'

export default function AdminAuditPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login')
      return
    }
    adminApi.auditLogs()
      .then((res) => setLogs(res.data.audit_logs || []))
      .catch((err) => setError(getApiErrorMessage(err, 'Audit logs could not be loaded.')))
  }, [router])

  return (
    <>
      <AdminPageHeader title="Audit Logs" description="Administrative actions and reasons." />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <AdminPanel>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-app-border text-app-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-app-border last:border-0">
                <td className="px-4 py-3 font-medium text-app-primary">{log.action}</td>
                <td className="px-4 py-3 text-app-muted">{log.target_type}{log.target_id ? ` · ${log.target_id}` : ''}</td>
                <td className="px-4 py-3 text-app-primary">{log.reason || '-'}</td>
                <td className="px-4 py-3 text-app-muted">{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-app-muted" colSpan={4}>No audit logs found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </AdminPanel>
    </>
  )
}
