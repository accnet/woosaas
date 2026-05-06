'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSiteId } from '@/hooks/use-site-id'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import type { CreateSiteMemberInput, Site, SiteMembersResponse, UpdateSiteMemberInput } from '@/lib/types'
import { useAuthStore } from '@/store/auth'

const MEMBER_ROLE_OPTIONS: Array<CreateSiteMemberInput['role']> = ['admin', 'editor', 'viewer']

export default function TeamPage() {
  const siteId = useSiteId()
  const { user } = useAuthStore()
  const [site, setSite] = useState<Site | null>(null)
  const [team, setTeam] = useState<SiteMembersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<CreateSiteMemberInput>({ email: '', role: 'viewer' })

  const loadData = async () => {
    setLoading(true)
    try {
      const [siteRes, teamRes] = await Promise.all([sitesApi.get(siteId), sitesApi.getMembers(siteId)])
      setSite(siteRes.data)
      setTeam(teamRes.data)
    } catch (error) {
      console.error('Failed to load team data', error)
      setMessage(getApiErrorMessage(error, 'Failed to load site members'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [siteId])

  const permissions = useMemo(() => new Set(team?.current_user_permissions ?? []), [team])
  const canManageMembers = permissions.has('users:write')
  const canRemoveMembers = permissions.has('users:delete')

  const updateMemberRole = async (memberId: string, role: UpdateSiteMemberInput['role']) => {
    try {
      await sitesApi.updateMember(siteId, memberId, { role })
      setMessage('Updated member role')
      await loadData()
    } catch (error) {
      console.error('Failed to update member role', error)
      setMessage(getApiErrorMessage(error, 'Failed to update member role'))
    }
  }

  const removeMember = async (memberId: string) => {
    try {
      await sitesApi.deleteMember(siteId, memberId)
      setMessage('Removed member from site')
      await loadData()
    } catch (error) {
      console.error('Failed to remove member', error)
      setMessage(getApiErrorMessage(error, 'Failed to remove member'))
    }
  }

  if (loading) {
    return <LoadingSpinner className="p-8" />
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/sites" className="text-blue-500 hover:text-blue-700">
            Back to Sites
          </Link>
          <Link href={`/dashboard/sites/${siteId}/onboarding`} className="text-blue-500 hover:text-blue-700">
            Setup Guide
          </Link>
          <Link href={`/dashboard/sites/${siteId}/api-keys`} className="text-blue-500 hover:text-blue-700">
            API Keys
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-bold">Team</h1>
        <p className="text-gray-500">
          {site?.name} · {site?.domain}
        </p>
        {team ? (
          <p className="mt-2 text-sm text-gray-600">
            Your role: <span className="font-medium text-gray-900">{team.current_user_role}</span>
          </p>
        ) : null}
        {message ? <p className="mt-2 text-sm text-gray-600">{message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Members" value={(team?.members.length ?? 0).toString()} />
        <SummaryCard
          label="Role Access"
          value={team?.current_user_role || 'viewer'}
          detail={canManageMembers ? 'You can invite or change roles.' : 'You can view members only.'}
        />
        <SummaryCard
          label="Removal Access"
          value={canRemoveMembers ? 'Enabled' : 'Restricted'}
          detail={canRemoveMembers ? 'Owners can remove members.' : 'Member removal is limited to site owners.'}
        />
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Invite Existing User</h2>
            <p className="mt-2 text-sm text-gray-600">
              Sprint 1 keeps team invites simple: the email must already belong to a Woosaas account.
            </p>
          </div>
        </div>

        <form
          className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-[1.6fr,0.8fr,auto]"
          onSubmit={async (event) => {
            event.preventDefault()
            setSubmitting(true)
            try {
              await sitesApi.addMember(siteId, form)
              setForm({ email: '', role: 'viewer' })
              setMessage('Added member to site')
              await loadData()
            } catch (error) {
              console.error('Failed to add member', error)
              setMessage(getApiErrorMessage(error, 'Failed to add member'))
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="teammate@example.com"
            className="rounded border px-3 py-2"
            disabled={!canManageMembers || submitting}
            required
          />
          <select
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({ ...current, role: event.target.value as CreateSiteMemberInput['role'] }))
            }
            className="rounded border px-3 py-2"
            disabled={!canManageMembers || submitting}
          >
            {MEMBER_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!canManageMembers || submitting}
            className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Member'}
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Member</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {(team?.members ?? []).map((member) => {
              const isCurrentUser = member.user_id === user?.id
              const isOwner = member.role === 'owner'
              const canEditRole = canManageMembers && !isOwner && !isCurrentUser
              const canRemove = canRemoveMembers && !isOwner && !isCurrentUser

              return (
                <tr key={member.id}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{member.user_name || member.user_email}</div>
                    <div className="text-sm text-gray-500">{member.user_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void updateMemberRole(member.id, event.target.value as UpdateSiteMemberInput['role'])
                      }
                      disabled={!canEditRole}
                      className="rounded border px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                    >
                      {isOwner ? (
                        <option value="owner">owner</option>
                      ) : (
                        MEMBER_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))
                      )}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(member.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      disabled={!canRemove}
                      onClick={() => void removeMember(member.id)}
                      className="text-sm font-medium text-red-600 hover:text-red-700 disabled:text-gray-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {(team?.members.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-gray-500">No members yet.</div>
        ) : null}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {detail ? <div className="mt-2 text-sm text-gray-600">{detail}</div> : null}
    </div>
  )
}
