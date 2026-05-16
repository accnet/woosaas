'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Copy,
  Edit,
  Plus,
  Star,
  TableProperties,
  Trash2,
} from 'lucide-react'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { exportTemplatesApi, getApiErrorMessage } from '@/lib/api'
import type { ExportTemplate } from '@/lib/types'

export default function ExportTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<ExportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await exportTemplatesApi.list()
      setTemplates(res.data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load templates.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const handleSetDefault = async (id: string) => {
    setActionLoading(id + '-default')
    try {
      await exportTemplatesApi.setDefault(id)
      await loadTemplates()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to set default.'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    setActionLoading(id + '-duplicate')
    try {
      await exportTemplatesApi.duplicate(id)
      await loadTemplates()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to duplicate template.'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return
    setActionLoading(id + '-delete')
    try {
      await exportTemplatesApi.delete(id)
      await loadTemplates()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete template.'))
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Site Selector */}
      <SectionCard title="Export Templates" icon={<TableProperties className="h-4 w-4" />}>
        <div className="space-y-4">
          <p className="text-sm text-app-muted">
            Templates define which columns appear in CSV exports from the Orders page. These templates are shared across all sites.
          </p>
        </div>
      </SectionCard>

      {/* Templates List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app-strong">Templates</h2>
          <button
            type="button"
            className="btn-primary gap-2 text-sm"
            onClick={() => router.push('/dashboard/settings/export-templates/new')}
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        </div>

        {error && <InlineErrorState body={error} compact />}

        {loading ? (
          <LoadingSpinner className="py-8" />
        ) : templates.length === 0 ? (
          <div className="rounded-xl border border-app-line bg-white px-6 py-10 text-center shadow-sm">
            <TableProperties className="mx-auto mb-3 h-8 w-8 text-app-muted" />
            <p className="text-sm font-medium text-app-strong">No templates yet</p>
            <p className="mt-1 text-xs text-app-muted">Create your first template to customise CSV exports.</p>
            <button
              type="button"
              className="btn-primary mt-4 gap-2 text-sm"
              onClick={() => router.push('/dashboard/settings/export-templates/new')}
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 rounded-xl border border-app-line bg-white shadow-sm">
            {templates.map(tpl => (
              <TemplateRow
                key={tpl.id}
                template={tpl}
                actionLoading={actionLoading}
                onEdit={() => router.push(`/dashboard/settings/export-templates/${tpl.id}/edit`)}
                onDuplicate={() => handleDuplicate(tpl.id)}
                onDelete={() => handleDelete(tpl.id, tpl.name)}
                onSetDefault={() => handleSetDefault(tpl.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateRow({
  template,
  actionLoading,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
}: {
  template: ExportTemplate
  actionLoading: string | null
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  const orderFieldCount = template.columns.filter(c => c.type === 'order_field').length
  const customCount = template.columns.filter(c => c.type === 'custom').length
  const preview = template.columns.slice(0, 5).map(c => c.label).join(', ')
  const isActing = (key: string) => actionLoading === template.id + '-' + key

  return (
    <div className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-start sm:justify-between">
      {/* Info */}
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {template.is_default && <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />}
          <span className="font-medium text-app-strong">{template.name}</span>
          {template.is_system && <StatusChip label="System" tone="neutral" className="border border-slate-200 bg-slate-100 text-slate-700" />}
          {template.is_default && <StatusChip label="Default" tone="good" className="border border-emerald-200 bg-emerald-100 text-emerald-800" />}
        </div>
        {template.description && (
          <p className="text-xs text-app-muted">{template.description}</p>
        )}
        <p className="text-xs text-app-muted">
          {template.columns.length} columns
          {orderFieldCount > 0 && ` · ${orderFieldCount} order fields`}
          {customCount > 0 && ` · ${customCount} custom`}
        </p>
        <p className="truncate text-xs text-app-muted" title={template.columns.map(c => c.label).join(', ')}>
          {preview}{template.columns.length > 5 ? ` …+${template.columns.length - 5} more` : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
        {!template.is_default && (
          <button
            type="button"
            className="btn-secondary gap-1.5 text-xs"
            disabled={isActing('default')}
            onClick={onSetDefault}
            title="Set as default"
          >
            <Star className="h-3.5 w-3.5" />
            {isActing('default') ? 'Saving…' : 'Set default'}
          </button>
        )}
        <button
          type="button"
          className="btn-secondary gap-1.5 text-xs"
          disabled={isActing('duplicate')}
          onClick={onDuplicate}
          title="Duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
          {isActing('duplicate') ? '…' : 'Duplicate'}
        </button>
        {!template.is_system && (
          <>
            <button
              type="button"
              className="btn-secondary gap-1.5 text-xs"
              onClick={onEdit}
              title="Edit"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            {!template.is_default && (
              <button
                type="button"
                className="btn-danger gap-1.5 text-xs"
                disabled={isActing('delete')}
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isActing('delete') ? '…' : 'Delete'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
