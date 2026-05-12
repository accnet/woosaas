'use client'

import { useEffect, useMemo, useState } from 'react'
import { MailPlus, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnalyticsPageHeader } from '@/components/ui/analytics-page-header'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { MetricCard } from '@/components/ui/metric-card'
import { SearchInput } from '@/components/ui/search-input'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { TableLoadingSkeleton } from '@/components/ui/table-loading-skeleton'
import { TableHeaderCell } from '@/components/ui/table-primitives'
import { TableSection } from '@/components/ui/table-section'
import { getApiErrorMessage, sitesApi } from '@/lib/api'
import type { Site } from '@/lib/types'

type AccessRole = 'owner' | 'admin' | 'editor' | 'viewer'

type AccessRecord = {
  memberId: string
  siteId: string
  siteName: string
  siteDomain: string
  userId: string
  userName: string
  userEmail: string
  role: AccessRole
  createdAt: string
}

const ROLE_OPTIONS = ['admin', 'editor', 'viewer'] as const

export default function TeamsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSiteFilter = searchParams.get('siteId') || 'all'

  const [sites, setSites] = useState<Site[]>([])
  const [records, setRecords] = useState<AccessRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [siteFilter, setSiteFilter] = useState(initialSiteFilter)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSiteId, setInviteSiteId] = useState(initialSiteFilter !== 'all' ? initialSiteFilter : '')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [draftRoles, setDraftRoles] = useState<Record<string, 'admin' | 'editor' | 'viewer'>>({})
  const [savingAccessId, setSavingAccessId] = useState<string | null>(null)
  const [removingAccessId, setRemovingAccessId] = useState<string | null>(null)

  useEffect(() => {
    const nextFilter = searchParams.get('siteId') || 'all'
    setSiteFilter(nextFilter)
  }, [searchParams])

  useEffect(() => {
    if (siteFilter !== 'all') {
      setInviteSiteId(siteFilter)
      return
    }
  }, [siteFilter])

  useEffect(() => {
    if (!inviteSiteId && sites.length > 0) {
      setInviteSiteId(sites[0].id)
    }
  }, [inviteSiteId, sites])

  useEffect(() => {
    let cancelled = false

    const loadSystemAccess = async () => {
      if (records.length === 0) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError(null)

      try {
        const sitesRes = await sitesApi.list()
        if (cancelled) {
          return
        }

        const nextSites = sitesRes.data
        setSites(nextSites)

        const memberResults = await Promise.allSettled(
          nextSites.map(async (site) => {
            const res = await sitesApi.getMembers(site.id)
            return {
              site,
              members: res.data.members,
            }
          })
        )

        if (cancelled) {
          return
        }

        const rejected = memberResults.filter((result) => result.status === 'rejected')
        if (rejected.length > 0) {
          setError('Some website access lists could not be loaded. The roster below may be incomplete.')
        }

        const nextRecords = memberResults.flatMap((result) => {
          if (result.status !== 'fulfilled') {
            return []
          }

          return result.value.members.map((member) => ({
            memberId: member.id,
            siteId: result.value.site.id,
            siteName: result.value.site.name,
            siteDomain: result.value.site.domain,
            userId: member.user_id,
            userName: member.user_name,
            userEmail: member.user_email,
            role: member.role,
            createdAt: member.created_at,
          }))
        })

        setRecords(nextRecords)
        setDraftRoles(
          Object.fromEntries(
            nextRecords
              .filter((record) => record.role !== 'owner')
              .map((record) => [record.memberId, record.role])
          ) as Record<string, 'admin' | 'editor' | 'viewer'>
        )
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Team access could not be loaded right now.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void loadSystemAccess()

    return () => {
      cancelled = true
    }
  }, [records.length, reloadKey])

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesSite = siteFilter === 'all' || record.siteId === siteFilter
      if (!matchesSite) {
        return false
      }

      const haystack = `${record.userName} ${record.userEmail} ${record.siteName} ${record.siteDomain} ${record.role}`.toLowerCase()
      return haystack.includes(query.trim().toLowerCase())
    })
  }, [query, records, siteFilter])

  const summary = useMemo(() => {
    const uniquePeople = new Set(filteredRecords.map((record) => record.userId)).size
    const sharedSites = new Set(filteredRecords.map((record) => record.siteId)).size
    const admins = filteredRecords.filter((record) => record.role === 'owner' || record.role === 'admin').length

    return {
      uniquePeople,
      accessGrants: filteredRecords.length,
      sharedSites,
      admins,
    }
  }, [filteredRecords])

  const websiteOptions = useMemo(() => {
    return sites.map((site) => ({
      id: site.id,
      label: `${site.name} (${site.domain})`,
    }))
  }, [sites])

  const handleFilterChange = (nextSiteId: string) => {
    setSiteFilter(nextSiteId)
    const params = new URLSearchParams(searchParams.toString())
    if (nextSiteId === 'all') {
      params.delete('siteId')
    } else {
      params.set('siteId', nextSiteId)
    }
    const nextQuery = params.toString()
    router.replace(nextQuery ? `/dashboard/teams?${nextQuery}` : '/dashboard/teams')
  }

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!inviteSiteId) {
      setError('Select a website before granting access.')
      return
    }

    setInviting(true)
    setError(null)

    try {
      await sitesApi.addMember(inviteSiteId, { email: inviteEmail, role: inviteRole })
      setInviteEmail('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to grant website access.'))
    } finally {
      setInviting(false)
    }
  }

  const handleUpdateRole = async (record: AccessRecord) => {
    const nextRole = draftRoles[record.memberId]
    if (!nextRole || nextRole === record.role) {
      return
    }

    setSavingAccessId(record.memberId)
    setError(null)

    try {
      await sitesApi.updateMember(record.siteId, record.memberId, { role: nextRole })
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update website role.'))
    } finally {
      setSavingAccessId(null)
    }
  }

  const handleRemoveAccess = async (record: AccessRecord) => {
    setRemovingAccessId(record.memberId)
    setError(null)

    try {
      await sitesApi.deleteMember(record.siteId, record.memberId)
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to remove website access.'))
    } finally {
      setRemovingAccessId(null)
    }
  }

  if (loading && records.length === 0) {
    return <TableLoadingSkeleton rows={6} columns={5} />
  }

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Teams"
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
          compact={records.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard icon={<Users className="h-4 w-4" />} label="People" value={summary.uniquePeople.toString()} helper="Unique members in the system" />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Access Grants" value={summary.accessGrants.toString()} helper="Website-level access rows" />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Shared Websites" value={summary.sharedSites.toString()} helper="Websites with at least one teammate" />
        <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Admins" value={summary.admins.toString()} helper="Owner and admin assignments" />
      </div>

      <SectionCard
        title="Grant Access"
        icon={<MailPlus className="h-4 w-4" />}
      >
        <form onSubmit={handleInvite} className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_240px_180px_auto]">
          <input
            type="email"
            placeholder="colleague@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="input"
            required
          />
          <select
            value={inviteSiteId}
            onChange={(event) => setInviteSiteId(event.target.value)}
            className="select"
            required
          >
            <option value="" disabled>Select website</option>
            {websiteOptions.map((site) => (
              <option key={site.id} value={site.id}>{site.label}</option>
            ))}
          </select>
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
            {inviting ? 'Granting...' : 'Grant Access'}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Filters"
        icon={<Users className="h-4 w-4" />}
      >
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Search people, websites, or roles" />
          <select value={siteFilter} onChange={(event) => handleFilterChange(event.target.value)} className="select">
            <option value="all">All websites</option>
            {websiteOptions.map((site) => (
              <option key={`filter-${site.id}`} value={site.id}>{site.label}</option>
            ))}
          </select>
        </div>
      </SectionCard>

      <TableSection
        title="Website Access"
        action={<StatusChip label={`${filteredRecords.length} grants`} tone="neutral" />}
        isEmpty={filteredRecords.length === 0}
        emptyTitle="No access grants found"
        emptyBody="Adjust filters or grant access to the first teammate."
        emptyIcon={<Users className="h-12 w-12" />}
      >
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <TableHeaderCell>Member</TableHeaderCell>
              <TableHeaderCell>Website</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Granted</TableHeaderCell>
              <TableHeaderCell align="right">Actions</TableHeaderCell>
            </tr>
          </thead>
          <tbody className="table-body">
            {filteredRecords.map((record) => (
              <tr key={`${record.siteId}-${record.memberId}`} className="table-row">
                <td className="table-cell">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-app-strong">{record.userName}</div>
                    <div className="truncate text-xs text-app-muted">{record.userEmail}</div>
                  </div>
                </td>
                <td className="table-cell">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-app-strong">{record.siteName}</div>
                    <div className="truncate text-xs text-app-muted">{record.siteDomain}</div>
                  </div>
                </td>
                <td className="table-cell">
                  {record.role === 'owner' ? (
                    <StatusChip label="owner" tone="info" className="capitalize" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={draftRoles[record.memberId] || record.role}
                        onChange={(event) =>
                          setDraftRoles((current) => ({
                            ...current,
                            [record.memberId]: event.target.value as 'admin' | 'editor' | 'viewer',
                          }))
                        }
                        className="select min-w-[140px]"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={`${record.memberId}-${role}`} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleUpdateRole(record)}
                        disabled={savingAccessId === record.memberId || (draftRoles[record.memberId] || record.role) === record.role}
                        className="btn-secondary px-3 py-2"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </td>
                <td className="table-cell">
                  {record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-'}
                </td>
                <td className="table-cell text-right">
                  {record.role === 'owner' ? (
                    <span className="text-xs font-medium text-app-soft">Owner access</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveAccess(record)}
                      disabled={removingAccessId === record.memberId}
                      className="btn-ghost gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableSection>
    </div>
  )
}
