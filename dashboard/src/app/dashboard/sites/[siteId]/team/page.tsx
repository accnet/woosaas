'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { MailPlus, RefreshCw, Shield, ShieldCheck, Trash2, Users } from 'lucide-react'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell, TableRowActionZone } from '@/components/ui/table-primitives'
import { TableSection } from '@/components/ui/table-section'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import type { SiteMember } from '@/lib/types'

const ROLE_OPTIONS = ['admin', 'editor', 'viewer'] as const

export default function TeamPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [members, setMembers] = useState<SiteMember[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [draftRoles, setDraftRoles] = useState<Record<string, 'admin' | 'editor' | 'viewer'>>({})
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadMembers = async () => {
      if (members.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const res = await sitesApi.getMembers(siteId)
        if (!cancelled) {
          setMembers(res.data.members)
          setCurrentUserRole(res.data.current_user_role)
          setDraftRoles(
            Object.fromEntries(
              res.data.members
                .filter((member) => member.role !== 'owner')
                .map((member) => [member.id, member.role])
            ) as Record<string, 'admin' | 'editor' | 'viewer'>
          )
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Team members could not be loaded right now.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadMembers()

    return () => {
      cancelled = true
    }
  }, [members.length, reloadKey, siteId])

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInviting(true)
    setError(null)

    try {
      await sitesApi.addMember(siteId, { email: inviteEmail, role: inviteRole })
      setInviteEmail('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to invite member.'))
    } finally {
      setInviting(false)
    }
  }

  const handleUpdateRole = async (member: SiteMember) => {
    const nextRole = draftRoles[member.id]
    if (!nextRole || nextRole === member.role) {
      return
    }

    setSavingRoleId(member.id)
    setError(null)

    try {
      await sitesApi.updateMember(siteId, member.id, { role: nextRole })
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update member role.'))
    } finally {
      setSavingRoleId(null)
    }
  }

  const handleRemove = async (memberId: string) => {
    setRemovingId(memberId)
    setError(null)

    try {
      await sitesApi.deleteMember(siteId, memberId)
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to remove member.'))
    } finally {
      setRemovingId(null)
    }
  }

  const stats = useMemo(() => {
    const admins = members.filter((member) => member.role === 'owner' || member.role === 'admin').length
    const editors = members.filter((member) => member.role === 'editor').length
    const viewers = members.filter((member) => member.role === 'viewer').length
    return { admins, editors, viewers }
  }, [members])

  if (loading && members.length === 0) {
    return <TableLoadingSkeleton rows={4} columns={5} />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Team Access"
        description="Manage member roles, invitations, and the empty-state workflow for sites that are not yet shared."
        controls={
          <>
            {refreshing ? <StatusChip label="Refreshing" tone="info" /> : null}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="btn-secondary gap-2">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`.trim()} />
              Refresh
            </button>
          </>
        }
      />

      {error ? (
        <InlineErrorState
          body={error}
          compact={members.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Users className="h-4 w-4" />} label="Members" value={members.length.toString()} helper="Total users with access" />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Admins" value={stats.admins.toString()} helper="Owner and admin roles" />
        <MetricCard icon={<Shield className="h-4 w-4" />} label="Editors" value={stats.editors.toString()} helper={`${stats.viewers} viewers`} />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Your Role" value={currentUserRole || 'unknown'} helper="Current operator permission level" valueClassName="capitalize text-2xl" />
      </div>

      <SectionCard
        title="Invite Member"
        description="Add an email and assign the narrowest role that fits the job."
        icon={<MailPlus className="h-4 w-4" />}
      >
        <form onSubmit={handleInvite} className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_180px_auto]">
          <input
            type="email"
            placeholder="colleague@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="input"
            required
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as 'admin' | 'editor' | 'viewer')}
            className="select"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={inviting} className="btn-primary gap-2">
            <MailPlus className="h-4 w-4" />
            {inviting ? 'Sending...' : 'Invite'}
          </button>
        </form>
      </SectionCard>

      <TableSection
        title="Members"
        description="Role badges, inline role updates, and a dedicated action zone for membership changes."
        action={<StatusChip label={`${members.length} total`} tone="neutral" />}
        isEmpty={members.length === 0}
        emptyTitle="No team members yet"
        emptyBody="Invite the first collaborator to turn this into a shared operations workspace."
        emptyIcon={<Users className="h-12 w-12" />}
      >
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <TableHeaderCell>Member</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Joined</TableHeaderCell>
              <TableHeaderCell>Role Action</TableHeaderCell>
              <TableHeaderCell align="right">Actions</TableHeaderCell>
            </tr>
          </thead>
          <tbody className="table-body">
            {members.map((member) => {
              const roleTone =
                member.role === 'owner' ? 'info' : member.role === 'admin' ? 'good' : member.role === 'editor' ? 'neutral' : 'warn'

              return (
                <tr key={member.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-app-subtle text-sm font-medium text-app-strong">
                        {(member.user_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-app-strong">{member.user_name}</div>
                        <div className="truncate text-xs text-app-muted">{member.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <StatusChip label={member.role} tone={roleTone} className="capitalize" />
                  </td>
                  <td className="table-cell">
                    {member.created_at ? new Date(member.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="table-cell">
                    {member.role === 'owner' ? (
                      <span className="text-sm text-app-muted">Owner role is fixed</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={draftRoles[member.id] ?? member.role}
                          onChange={(event) =>
                            setDraftRoles((previous) => ({
                              ...previous,
                              [member.id]: event.target.value as 'admin' | 'editor' | 'viewer',
                            }))
                          }
                          className="select min-w-[140px]"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleUpdateRole(member)}
                          disabled={savingRoleId === member.id || (draftRoles[member.id] ?? member.role) === member.role}
                          className="btn-secondary px-3 py-2 text-xs"
                        >
                          {savingRoleId === member.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="table-cell">
                    <TableRowActionZone>
                      {member.role !== 'owner' ? (
                        <button
                          type="button"
                          onClick={() => handleRemove(member.id)}
                          disabled={removingId === member.id}
                          className="btn-ghost px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {removingId === member.id ? 'Removing...' : 'Remove'}
                        </button>
                      ) : null}
                    </TableRowActionZone>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableSection>
    </div>
  )
}
