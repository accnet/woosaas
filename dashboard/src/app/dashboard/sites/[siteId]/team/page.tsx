'use client'

import { use, useEffect, useState } from 'react'
import { MailPlus, Shield, ShieldCheck, Trash2, Users } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { sitesApi, getApiErrorMessage } from '@/lib/api'
import type { SiteMember } from '@/lib/types'

export default function TeamPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [members, setMembers] = useState<SiteMember[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')

  const loadMembers = async () => {
    setLoading(true)
    try {
      const res = await sitesApi.getMembers(siteId)
      setMembers(res.data.members)
      setCurrentUserRole(res.data.current_user_role)
    } catch (err) {
      console.error('Failed to load team members', err)
      setError(getApiErrorMessage(err, 'Failed to load members'))
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setInviting(true)
    setError('')
    try {
      await sitesApi.addMember(siteId, { email: inviteEmail, role: inviteRole })
      setInviteEmail('')
      await loadMembers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to invite member'))
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (memberId: string) => {
    try {
      await sitesApi.deleteMember(siteId, memberId)
      await loadMembers()
    } catch (err) {
      console.error('Failed to remove member', err)
    }
  }

  useEffect(() => {
    void loadMembers()
  }, [siteId])

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const admins = members.filter((member) => member.role === 'owner' || member.role === 'admin').length
  const editors = members.filter((member) => member.role === 'editor').length

  return (
    <div className="space-y-8">
      <div className="panel-header">
        <div>
          <h2 className="text-2xl font-semibold text-app-strong">Team Access</h2>
          <p className="mt-2 text-sm text-app-muted">
            Review site membership, invite collaborators, and keep permissions tight.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <MetricCard icon={<Users className="h-4 w-4" />} label="Members" value={members.length.toString()} helper="Total users with access" />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Admins" value={admins.toString()} helper="Owner and admin roles" />
        <MetricCard icon={<Shield className="h-4 w-4" />} label="Editors" value={editors.toString()} helper={`Your role: ${currentUserRole || 'unknown'}`} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        </div>
      )}

      <SectionCard title="Invite Member" description="Add an email and assign the narrowest role that fits the job." icon={<MailPlus className="h-4 w-4" />}>
        <form onSubmit={handleInvite}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_180px_auto]">
          <input
            type="email"
            placeholder="colleague@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="input"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')}
            className="select"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="btn-primary"
          >
            {inviting ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <MailPlus className="h-4 w-4" />
                Invite
              </span>
            )}
          </button>
        </div>
        </form>
      </SectionCard>

      <div className="card overflow-hidden">
        <div className="panel-header border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-app-strong">Members</h3>
            <p className="mt-1 text-sm text-app-muted">Direct access to this site and its operational settings.</p>
          </div>
          <div className="badge badge-neutral">{members.length} total</div>
        </div>

        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 last:border-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-app-subtle text-sm font-medium text-app-strong">
                {(member.user_name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-app-strong">{member.user_name}</div>
                <div className="text-xs text-app-muted">{member.user_email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge capitalize ${
                member.role === 'owner' ? 'badge-info' : 'badge-neutral'
              }`}>
                {member.role}
              </span>
              {member.role !== 'owner' && (
                <button
                  onClick={() => handleRemove(member.id)}
                  className="btn-ghost px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                >
                  <span className="flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <EmptyState body="No team members yet" />
        )}
      </div>
    </div>
  )
}
